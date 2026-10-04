import type { Order } from './order';

// Which orders ring, and when they move, is decided natively (OrderBook.kt). These are display rules.

// Rider OTP = last 4 digits of the order id — the same value the web prints on the bill.
export const riderOtp = (orderId: string): string => {
  const digits = String(orderId || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : String(orderId || '--').slice(-4);
};

export const riderStatusOf = (order: Order): string | undefined => {
  const p = order.assignedPartner;
  const s = p?.orderStatus ?? p?.OrderStatus;
  return typeof s === 'string' && s.trim() ? s.trim() : undefined;
};

// Web ReadyOrderCard: hand over only once the rider is at the store.
export const canHandOver = (order: Order): boolean => riderStatusOf(order)?.toUpperCase() === 'ARRIVED_AT_STORE';

export const isValidRejectReason = (reason: string, min: number): boolean => reason.trim().length >= min;

// Same rule as the web login form.
export const isValidIndianMobile = (phone: string): boolean => /^[6-9]\d{9}$/.test(phone);
