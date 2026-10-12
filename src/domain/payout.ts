import type { Order } from './order';

export const DEFAULT_COMMISSION_PCT = 10;

export interface Payout {
  gross: number;
  commission: number;
  net: number;
  pct: number;
  estimated: boolean;
  settled: boolean;
}

export interface PayoutSummary {
  orders: number;
  gross: number;
  commission: number;
  net: number;
  settled: number;
  toBePaid: number;
  estimated: boolean;
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

export const commissionAt = (gross: number, pct: number): number =>
  Math.round((Math.round(gross * 100) * pct) / 100) / 100;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const payoutOf = (o: Order): Payout | null => {
  if (String(o.state).trim().toUpperCase() !== 'COMPLETED') return null;
  const gross = o.amountExcludingDeliveryFee;
  if (!isNumber(gross) || gross < 0) return null;
  const sent = o.finance?.commission;
  const hasSent = isNumber(sent) && sent >= 0 && sent <= gross;
  const commission = hasSent ? round2(sent) : commissionAt(gross, DEFAULT_COMMISSION_PCT);
  const pct = hasSent ? (gross > 0 ? Math.round((sent / gross) * 1000) / 10 : 0) : DEFAULT_COMMISSION_PCT;
  return {
    gross,
    commission,
    net: round2(gross - commission),
    pct,
    estimated: !hasSent,
    settled: o.isSettled === true,
  };
};

export const summarize = (orders: Order[]): PayoutSummary => {
  const sum: PayoutSummary = { orders: 0, gross: 0, commission: 0, net: 0, settled: 0, toBePaid: 0, estimated: false };
  for (const o of orders) {
    const p = payoutOf(o);
    if (!p) continue;
    sum.orders += 1;
    sum.gross += p.gross;
    sum.commission += p.commission;
    sum.net += p.net;
    if (p.settled) sum.settled += p.net;
    else sum.toBePaid += p.net;
    if (p.estimated) sum.estimated = true;
  }
  return {
    ...sum,
    gross: round2(sum.gross),
    commission: round2(sum.commission),
    net: round2(sum.net),
    settled: round2(sum.settled),
    toBePaid: round2(sum.toBePaid),
  };
};
