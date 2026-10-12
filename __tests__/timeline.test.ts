import type { Order } from '../src/domain/order';
import { parseServerTime } from '../src/domain/time';
import { timelineOf } from '../src/domain/timeline';

const base = {
  orderId: 'A',
  state: 'COMPLETED',
  creationTime: '2026-10-09 19:38:00',
  acceptedDate: '2026-10-09 19:39:00',
  readyDate: '2026-10-09 19:52:00',
  preparationTime: 15,
  completedDate: '2026-10-09 20:10:00',
};
const make = (extra: Record<string, unknown> = {}) => ({ ...base, ...extra }) as Order;
const keys = (o: Order) => timelineOf(o).map((s) => s.key);
const step = (o: Order, key: string) => timelineOf(o).find((s) => s.key === key)!;

describe('timeline', () => {
  it('delivered order on time', () => {
    const o = make();
    const steps = timelineOf(o);
    expect(steps.map((s) => s.key)).toEqual(['placed', 'accepted', 'ready', 'delivered']);
    expect(steps.every((s) => s.done)).toBe(true);
    expect(step(o, 'accepted').detail).toBe('Took 1 min to accept');
    expect(step(o, 'ready').detail).toBe('Cooked in 13 min · on time');
    expect(step(o, 'ready').tone).toBe('green');
    expect(step(o, 'delivered').tone).toBe('green');
    expect(step(o, 'delivered').at).toBe(parseServerTime(base.completedDate));
  });

  it('late by whole minutes', () => {
    const late = step(make({ readyDate: '2026-10-09 19:55:30' }), 'ready');
    expect(late.detail).toBe('Cooked in 16 min · 1 min late');
    expect(late.tone).toBe('red');
    expect(step(make({ readyDate: '2026-10-09 19:54:30' }), 'ready').detail).toBe('Cooked in 15 min · on time');
  });

  it('rejected order', () => {
    const o = make({ state: 'REJECTED', rejectedDate: '2026-10-09 19:40:00' });
    expect(keys(o)).toEqual(['placed', 'rejected']);
    expect(step(o, 'rejected')).toMatchObject({
      tone: 'red',
      done: true,
      at: parseServerTime('2026-10-09 19:40:00'),
    });
  });

  it('cancelled after accept', () => {
    const o = make({ state: 'CANCELLED', readyDate: null });
    expect(keys(o)).toEqual(['placed', 'accepted', 'cancelled']);
    expect(step(o, 'cancelled')).toMatchObject({ at: null, tone: 'red' });
  });

  it('in progress shows what is still to come', () => {
    const o = make({ state: 'ACCEPTED', readyDate: null, completedDate: null });
    expect(keys(o)).toEqual(['placed', 'accepted', 'ready', 'delivered']);
    expect(step(o, 'ready')).toMatchObject({ done: false, at: null });
    expect(step(o, 'delivered').done).toBe(false);
  });

  it('on the way adds a rider step', () => {
    const o = make({ state: 'IN_TRANSIT', completedDate: null });
    expect(keys(o)).toEqual(['placed', 'accepted', 'ready', 'onTheWay', 'delivered']);
    expect(step(o, 'onTheWay').done).toBe(true);
    expect(step(o, 'delivered').done).toBe(false);
  });

  it('missing or broken times never throw', () => {
    const steps = timelineOf({ orderId: 'X', state: 'COMPLETED' } as Order);
    expect(steps).toHaveLength(4);
    steps.forEach((s) => {
      expect(s.at).toBeNull();
      expect(s.detail).toBeNull();
      expect(s.done).toBe(true);
    });
    expect(step(make({ creationTime: 'garbage' }), 'placed').at).toBeNull();
  });
});
