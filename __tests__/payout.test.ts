import type { Order } from '../src/domain/order';
import { commissionLabel, payoutOf, shopCommissionPct, summarize } from '../src/domain/payout';

const completed = (extra: Record<string, unknown> = {}) =>
  ({ orderId: 'A', state: 'COMPLETED', amountExcludingDeliveryFee: 200, ...extra }) as Order;

// Money fields exactly as the live backend sent them for shop 68246 (5% shop, 2026-10).
const live = (itemTotalAmount: number, commission: number, extra: Record<string, unknown> = {}) =>
  completed({
    amountExcludingDeliveryFee: itemTotalAmount,
    finance: { itemTotalAmount, couponDiscount: 0, commissionRate: 5, commission, commissionGst: 0, ...extra },
  });

describe('payout', () => {
  it('shows the backend rate, not commission / gross (which wobbles with rupee rounding)', () => {
    for (const [total, commission] of [[1000, 50], [232, 12], [85, 4], [474, 24]]) {
      const p = payoutOf(live(total, commission));
      expect(p).toMatchObject({ pct: 5, commission, gross: total, net: total - commission, estimated: false });
      expect(commissionLabel(p!)).toBe('Commission (5%)');
    }
  });

  it('a coupon is paid by the shop; commission is still on the item total before the coupon', () => {
    const p = payoutOf(
      completed({
        amountExcludingDeliveryFee: 100,
        finance: { itemTotalAmount: 168, couponDiscount: 68, commissionRate: 10, commission: 17 },
      }),
    );
    expect(p).toMatchObject({ itemTotal: 168, coupon: 68, gross: 100, pct: 10, commission: 17, net: 83 });
    expect(commissionLabel(p!)).toBe('Commission (10% of ₹168)');
  });

  it('GST on commission is deducted when the backend sends it', () => {
    const p = payoutOf(live(1000, 50, { commissionGst: 9 }));
    expect(p).toMatchObject({ commissionGst: 9, net: 941 });
  });

  it('estimates in whole rupees like the backend when no commission was sent', () => {
    expect(payoutOf(completed({ amountExcludingDeliveryFee: 245 }))).toEqual({
      itemTotal: 245,
      coupon: 0,
      gross: 245,
      pct: 10,
      commission: 25,
      commissionGst: 0,
      net: 220,
      estimated: true,
      settled: false,
    });
    expect(payoutOf(completed({ amountExcludingDeliveryFee: 245 }), 5)).toMatchObject({ pct: 5, commission: 12 });
    expect(commissionLabel(payoutOf(completed(), 5)!)).toBe('Commission (5%, estimated)');
  });

  it('ignores a backend commission or rate that makes no sense', () => {
    for (const commission of [-5, 500, '16']) {
      expect(payoutOf(completed({ finance: { commission } }))).toMatchObject({ estimated: true, commission: 20 });
    }
    expect(payoutOf(completed({ finance: { commissionRate: 250 } }))).toMatchObject({ pct: 10 });
    expect(payoutOf(completed({ finance: { couponDiscount: 999 } }))).toMatchObject({ coupon: 200, gross: 0 });
  });

  it('only delivered orders have a payout', () => {
    expect(payoutOf(completed({ state: 'REJECTED' }))).toBeNull();
    expect(payoutOf(completed({ state: 'ACCEPTED' }))).toBeNull();
    expect(payoutOf(completed({ state: ' completed ' }))).not.toBeNull();
    expect(payoutOf(completed({ amountExcludingDeliveryFee: undefined }))).toBeNull();
    expect(payoutOf(completed({ amountExcludingDeliveryFee: NaN }))).toBeNull();
  });

  it("reads the shop's rate from any order that carries it", () => {
    expect(shopCommissionPct([completed(), live(232, 12)])).toBe(5);
    expect(shopCommissionPct([completed()])).toBeUndefined();
  });

  it("summary adds delivered orders only, estimating others at the shop's own rate", () => {
    const orders = [
      live(232, 12, {}),
      completed({ orderId: 'B', amountExcludingDeliveryFee: 245, isSettled: true }), // no finance: 5% of 245 = 12
      completed({ orderId: 'C', state: 'REJECTED', amountExcludingDeliveryFee: 100 }),
    ];
    expect(summarize(orders)).toEqual({
      orders: 2,
      gross: 477,
      commission: 24,
      commissionGst: 0,
      net: 453,
      settled: 233,
      toBePaid: 220,
      estimated: true,
    });
  });

  it('summary of nothing is zero and not estimated', () => {
    expect(summarize([])).toEqual({
      orders: 0,
      gross: 0,
      commission: 0,
      commissionGst: 0,
      net: 0,
      settled: 0,
      toBePaid: 0,
      estimated: false,
    });
  });
});
