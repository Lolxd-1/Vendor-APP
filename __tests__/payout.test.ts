import type { Order } from '../src/domain/order';
import { payoutOf, summarize } from '../src/domain/payout';

const completed = (extra: Record<string, unknown> = {}) =>
  ({ orderId: 'A', state: 'COMPLETED', amountExcludingDeliveryFee: 200, ...extra }) as Order;

describe('payout', () => {
  it('estimated 10 percent when the backend sends no commission', () => {
    expect(payoutOf(completed({ amountExcludingDeliveryFee: 245 }))).toEqual({
      gross: 245,
      commission: 24.5,
      net: 220.5,
      pct: 10,
      estimated: true,
      settled: false,
    });
  });

  it('rounds commission to whole paise', () => {
    const p = payoutOf(completed({ amountExcludingDeliveryFee: 98.01 }));
    expect(p?.commission).toBe(9.8);
    expect(p?.net).toBe(88.21);
  });

  it('uses the backend commission when it is sent', () => {
    const p = payoutOf(completed({ finance: { commission: 16 }, isSettled: true }));
    expect(p).toMatchObject({ commission: 16, pct: 8, estimated: false, net: 184, settled: true });
  });

  it('ignores a backend commission that is not a number between 0 and gross', () => {
    for (const commission of [-5, 500, '16']) {
      const p = payoutOf(completed({ finance: { commission } }));
      expect(p).toMatchObject({ estimated: true, commission: 20 });
    }
  });

  it('only delivered orders have a payout', () => {
    expect(payoutOf(completed({ state: 'REJECTED' }))).toBeNull();
    expect(payoutOf(completed({ state: 'ACCEPTED' }))).toBeNull();
    expect(payoutOf(completed({ state: ' completed ' }))).not.toBeNull();
    expect(payoutOf(completed({ amountExcludingDeliveryFee: undefined }))).toBeNull();
    expect(payoutOf(completed({ amountExcludingDeliveryFee: NaN }))).toBeNull();
  });

  it('summary adds delivered orders only', () => {
    const orders = [
      completed({ orderId: 'A', amountExcludingDeliveryFee: 245 }),
      completed({ orderId: 'B', finance: { commission: 16 }, isSettled: true }),
      completed({ orderId: 'C', state: 'REJECTED', amountExcludingDeliveryFee: 100 }),
    ];
    expect(summarize(orders)).toEqual({
      orders: 2,
      gross: 445,
      commission: 40.5,
      net: 404.5,
      settled: 184,
      toBePaid: 220.5,
      estimated: true,
    });
  });

  it('summary of nothing is zero and not estimated', () => {
    expect(summarize([])).toEqual({ orders: 0, gross: 0, commission: 0, net: 0, settled: 0, toBePaid: 0, estimated: false });
  });
});
