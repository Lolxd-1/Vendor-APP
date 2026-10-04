import type { Order, OrderPhase } from './order';

// The socket sends the phase as `status`, the REST API as `state`. Anything that is not
// one of the three board columns (terminal states, junk, non-strings) is null.
export const normalisePhase = (raw: unknown): OrderPhase | null => {
  if (typeof raw !== 'string') return null;
  const phase = raw.trim().toUpperCase();
  return phase === 'PENDING' || phase === 'ACCEPTED' || phase === 'READY_FOR_PICKUP' ? phase : null;
};

// States the server never revives. IN_TRANSIT = the rider has it; without it the rider-pickup
// frame (which carries the full order) rang again as a brand-new order.
export const TERMINAL_STATES: ReadonlySet<string> = new Set(['REJECTED', 'CANCELLED', 'COMPLETED', 'IN_TRANSIT']);

export const isTerminalState = (raw: unknown): boolean =>
  typeof raw === 'string' && TERMINAL_STATES.has(raw.trim().toUpperCase());

export const PHASE_RANK: Record<OrderPhase, number> = { PENDING: 0, ACCEPTED: 1, READY_FOR_PICKUP: 2 };

// A full order: a string id and at least one item under `orderItem` (the only field the
// cards read). An itemless frame would ring as a blank card.
export const isValidOrder = (data: unknown): data is Order => {
  if (typeof data !== 'object' || data === null) return false;
  const o = data as Partial<Order>;
  return typeof o.orderId === 'string' && Array.isArray(o.orderItem) && o.orderItem.length > 0;
};

// `||` on purpose: an empty-string status falls through to `state`.
export const rawStatusOf = (data: { status?: unknown; state?: unknown }): unknown => data.status || data.state;

export type FrameAction =
  | { kind: 'upsert'; order: Partial<Order> & { orderId: string }; phase: OrderPhase }
  | { kind: 'remove'; orderId: string; terminal: string }
  | { kind: 'add'; order: Order }
  | { kind: 'ignore' };

// Decides what one socket frame does to the board (web useOrderWebsocket.tsx:134-201).
// `isKnown` = the order is already on this device's board.
export const classifyFrame = (data: unknown, isKnown: (orderId: string) => boolean): FrameAction => {
  if (typeof data !== 'object' || data === null) return { kind: 'ignore' };
  const frame = data as Record<string, unknown>;
  if (typeof frame.orderId !== 'string') return { kind: 'ignore' };
  const orderId = frame.orderId;
  const status = rawStatusOf(frame);
  const phase = normalisePhase(status);

  if (phase) {
    // A status-only frame may move an order we hold but must never insert one.
    if (!isKnown(orderId) && !isValidOrder(frame)) return { kind: 'ignore' };
    return { kind: 'upsert', order: frame as Partial<Order> & { orderId: string }, phase };
  }
  if (isTerminalState(status)) {
    return { kind: 'remove', orderId, terminal: String(status).trim().toUpperCase() };
  }
  // Only a frame with NO status is a new order; an unknown status is about an existing one.
  if (!status && isValidOrder(frame)) return { kind: 'add', order: frame };
  return { kind: 'ignore' };
};

// Rider OTP = last 4 digits of the order id (as printed on the web bill).
export const riderOtp = (orderId: string): string => {
  const digits = String(orderId || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : String(orderId || '--').slice(-4);
};

export const riderStatusOf = (order: Order): string | undefined => {
  const p = order.assignedPartner;
  const s = p?.orderStatus ?? p?.OrderStatus;
  return typeof s === 'string' ? s : undefined;
};

export const canHandOver = (order: Order): boolean =>
  (riderStatusOf(order) ?? '').trim().toUpperCase() === 'ARRIVED_AT_STORE';
