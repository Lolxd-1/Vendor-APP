import type { Order } from './order';

// History pages can overlap when a new order arrives mid-scroll (web fetchAllOrderPages): keep the first copy.
export const mergeOrders = (prev: Order[], next: Order[]): Order[] => {
  const seen = new Set(prev.map(o => o.orderId));
  const out = prev.slice();
  for (const o of next) {
    if (!o || typeof o.orderId !== 'string' || seen.has(o.orderId)) continue;
    seen.add(o.orderId);
    out.push(o);
  }
  return out;
};
