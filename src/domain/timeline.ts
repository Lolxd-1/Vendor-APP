import type { Order } from './order';
import { minutesLabel } from './format';
import { parseServerTime } from './time';

export type StepKey = 'placed' | 'accepted' | 'ready' | 'onTheWay' | 'delivered' | 'rejected' | 'cancelled';
export interface Step {
  key: StepKey;
  title: string;
  at: number | null;
  done: boolean;
  detail: string | null;
  tone: 'neutral' | 'green' | 'red';
}

const ACCEPTED_STATES = ['ACCEPTED', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'COMPLETED'];
const READY_STATES = ['READY_FOR_PICKUP', 'IN_TRANSIT', 'COMPLETED'];

const secondsBetween = (from: number | null, to: number | null): number | null =>
  from !== null && to !== null && to - from > 0 ? (to - from) / 1000 : null;

export const timelineOf = (o: Order): Step[] => {
  const s = String(o.state).trim().toUpperCase();
  const created = parseServerTime(o.creationTime);
  const acceptedAt = parseServerTime(o.acceptedDate);
  const readyAt = parseServerTime(o.readyDate);

  const placed: Step = { key: 'placed', title: 'Order placed', at: created, done: true, detail: null, tone: 'neutral' };

  if (s === 'REJECTED') {
    return [placed, { key: 'rejected', title: 'Rejected', at: parseServerTime(o.rejectedDate), done: true, detail: null, tone: 'red' }];
  }

  const toAccept = secondsBetween(created, acceptedAt);
  const accepted: Step = {
    key: 'accepted',
    title: 'Accepted',
    at: acceptedAt,
    done: acceptedAt !== null || ACCEPTED_STATES.includes(s),
    detail: toAccept !== null ? `Took ${minutesLabel(toAccept)} to accept` : null,
    tone: 'neutral',
  };

  const prep = secondsBetween(acceptedAt, readyAt);
  const promised = typeof o.preparationTime === 'number' && o.preparationTime > 0 ? o.preparationTime : null;
  const ready: Step = {
    key: 'ready',
    title: 'Food ready',
    at: readyAt,
    done: readyAt !== null || READY_STATES.includes(s),
    detail: null,
    tone: 'neutral',
  };
  if (prep !== null) {
    const cooked = `Cooked in ${minutesLabel(prep)}`;
    if (promised === null) {
      ready.detail = cooked;
    } else {
      const late = Math.floor((prep - promised * 60) / 60);
      ready.detail = late >= 1 ? `${cooked} · ${late} min late` : `${cooked} · on time`;
      ready.tone = late >= 1 ? 'red' : 'green';
    }
  }

  if (s === 'CANCELLED') {
    const steps = [placed];
    if (acceptedAt !== null) steps.push(accepted);
    if (readyAt !== null) steps.push(ready);
    steps.push({ key: 'cancelled', title: 'Cancelled', at: null, done: true, detail: null, tone: 'red' });
    return steps;
  }

  const delivered = s === 'COMPLETED';
  const steps = [placed, accepted, ready];
  if (s === 'IN_TRANSIT') {
    steps.push({ key: 'onTheWay', title: 'Picked up by the rider', at: null, done: true, detail: null, tone: 'neutral' });
  }
  steps.push({
    key: 'delivered',
    title: 'Delivered',
    at: parseServerTime(o.completedDate),
    done: delivered,
    detail: null,
    tone: delivered ? 'green' : 'neutral',
  });
  return steps;
};
