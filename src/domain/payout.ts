import { money } from './format';
import type { Order } from './order';

// Used only when the backend sent no commission for an order and no other order shows the shop's rate.
export const DEFAULT_COMMISSION_PCT = 10;

// Business rules (owner, 2026-10-16), checked against live orders:
// - QuickVerse commission = commissionRate % of the item total BEFORE any coupon, rounded to whole rupees.
// - Coupons are paid by the shop, so the shop's gross is the item total minus the coupon.
// - Payment gateway and COD charges are paid by QuickVerse, not deducted from the shop.
export interface Payout {
  itemTotal: number;
  coupon: number;
  gross: number;
  pct: number | null;
  commission: number;
  commissionGst: number;
  net: number;
  estimated: boolean;
  settled: boolean;
}

export interface PayoutSummary {
  orders: number;
  gross: number;
  commission: number;
  commissionGst: number;
  net: number;
  settled: number;
  toBePaid: number;
  estimated: boolean;
}

// EPSILON so 1.005 rounds to 1.01 like a person would expect (same as the web dashboard).
const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isPct = (v: unknown): v is number => isNumber(v) && v >= 0 && v <= 100;

// The backend rounds commission to whole rupees (11.6 -> 12, 4.25 -> 4); an estimate does the same.
const commissionAt = (base: number, pct: number): number => Math.round((base * pct) / 100);

/** The shop's commission rate as the backend sends it on its orders, or undefined when none says. */
export const shopCommissionPct = (orders: readonly Order[]): number | undefined =>
  orders.map(o => o.finance?.commissionRate).find(isPct);

export const payoutOf = (o: Order, fallbackPct: number = DEFAULT_COMMISSION_PCT): Payout | null => {
  if (String(o.state).trim().toUpperCase() !== 'COMPLETED') return null;
  const f = o.finance ?? undefined;
  const itemTotal = isNumber(f?.itemTotalAmount) ? f.itemTotalAmount : o.amountExcludingDeliveryFee;
  if (!isNumber(itemTotal) || itemTotal < 0) return null;
  const coupon = isNumber(f?.couponDiscount) ? Math.min(Math.max(f.couponDiscount, 0), itemTotal) : 0;
  const sentPct = isPct(f?.commissionRate) ? f.commissionRate : undefined;
  const sent = f?.commission;
  const hasSent = isNumber(sent) && sent >= 0 && sent <= itemTotal;
  const commission = hasSent ? round2(sent) : commissionAt(itemTotal, sentPct ?? fallbackPct);
  // A sent amount with no sent rate shows no %: working it out from the rounded amount is what made it wobble.
  const pct = sentPct ?? (hasSent ? null : fallbackPct);
  const commissionGst = isNumber(f?.commissionGst) && f.commissionGst > 0 ? round2(f.commissionGst) : 0;
  const gross = round2(itemTotal - coupon);
  return {
    itemTotal: round2(itemTotal),
    coupon: round2(coupon),
    gross,
    pct,
    commission,
    commissionGst,
    net: round2(gross - commission - commissionGst),
    estimated: !hasSent,
    settled: o.isSettled === true,
  };
};

/** 'Commission (5%)'; with a coupon the base is not the gross, so 'Commission (10% of ₹168)'. */
export const commissionLabel = (p: Payout): string => {
  const parts = [
    p.pct === null ? (p.coupon > 0 ? `on ${money(p.itemTotal)}` : '') : `${p.pct}%${p.coupon > 0 ? ` of ${money(p.itemTotal)}` : ''}`,
    p.estimated ? 'estimated' : '',
  ].filter(Boolean);
  return parts.length ? `Commission (${parts.join(', ')})` : 'Commission';
};

export const summarize =(orders: readonly Order[]): PayoutSummary => {
  const fallbackPct = shopCommissionPct(orders) ?? DEFAULT_COMMISSION_PCT;
  const sum: PayoutSummary = {
    orders: 0,
    gross: 0,
    commission: 0,
    commissionGst: 0,
    net: 0,
    settled: 0,
    toBePaid: 0,
    estimated: false,
  };
  for (const o of orders) {
    const p = payoutOf(o, fallbackPct);
    if (!p) continue;
    sum.orders += 1;
    sum.gross += p.gross;
    sum.commission += p.commission;
    sum.commissionGst += p.commissionGst;
    sum.net += p.net;
    if (p.settled) sum.settled += p.net;
    else sum.toBePaid += p.net;
    if (p.estimated) sum.estimated = true;
  }
  return {
    ...sum,
    gross: round2(sum.gross),
    commission: round2(sum.commission),
    commissionGst: round2(sum.commissionGst),
    net: round2(sum.net),
    settled: round2(sum.settled),
    toBePaid: round2(sum.toBePaid),
  };
};
