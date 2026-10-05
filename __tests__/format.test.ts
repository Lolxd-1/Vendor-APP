import {
  clockTime,
  dayTime,
  historyStatusInfo,
  initials,
  itemsSummary,
  minutesLabel,
  money,
  paymentLabel,
  riderStatusLabel,
} from '../src/domain/format';
import { mergeOrders } from '../src/domain/history';
import { parseStats } from '../src/domain/stats';

const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo, d, h, mi).getTime();

describe('money', () => {
  it('uses Indian grouping and drops .00', () => {
    expect(money(245)).toBe('₹245');
    expect(money(245.5)).toBe('₹245.50');
    expect(money(12345)).toBe('₹12,345');
    expect(money(123456.75)).toBe('₹1,23,456.75');
  });
  it('shows -- for anything that is not a number', () => {
    expect(money('12')).toBe('--');
    expect(money(NaN)).toBe('--');
    expect(money(undefined)).toBe('--');
  });
});

describe('times', () => {
  const now = at(2026, 9, 6, 20, 0);
  it('labels today, yesterday and older days', () => {
    expect(dayTime(at(2026, 9, 6, 19, 42), now)).toBe('Today, 7:42 pm');
    expect(dayTime(at(2026, 9, 5, 0, 5), now)).toBe('Yesterday, 12:05 am');
    expect(dayTime(at(2026, 9, 3, 19, 42), now)).toBe('3 Oct, 7:42 pm');
    expect(dayTime(null, now)).toBe('--');
    expect(clockTime(String(at(2026, 9, 6, 12, 7)))).toBe('12:07 pm');
  });
  it('turns seconds into readable durations', () => {
    expect(minutesLabel(0)).toBe('--');
    expect(minutesLabel(45)).toBe('45 sec');
    expect(minutesLabel(200)).toBe('3 min');
    expect(minutesLabel(3900)).toBe('1 h 5 min');
    expect(minutesLabel('x')).toBe('--');
  });
});

describe('labels', () => {
  it('payment', () => {
    expect(paymentLabel('COD')).toBe('Cash on delivery');
    expect(paymentLabel('cash')).toBe('Cash on delivery');
    expect(paymentLabel('UPI')).toBe('Paid online');
    expect(paymentLabel(undefined)).toBe('Payment not shown');
  });
  it('rider status in plain words', () => {
    expect(riderStatusLabel(undefined)).toBe('Finding a rider');
    expect(riderStatusLabel('arrived_at_store')).toBe('Rider at your shop');
    expect(riderStatusLabel('PARTNER_ASSIGNED')).toBe('Partner assigned');
  });
  it('history status', () => {
    expect(historyStatusInfo('COMPLETED')).toMatchObject({ label: 'Delivered', tone: 'green' });
    expect(historyStatusInfo('weird_state')).toMatchObject({ label: 'Weird state', tone: 'neutral' });
    expect(historyStatusInfo(null)).toMatchObject({ label: 'Unknown' });
  });
  it('items and initials', () => {
    expect(itemsSummary([{ name: 'A', itemCount: 2 }, { name: 'B', itemCount: 1 }])).toBe('2 × A, 1 × B');
    expect(itemsSummary(null)).toBe('No items');
    expect(initials('Tasty Bites')).toBe('TB');
    expect(initials('')).toBe('QV');
  });
});

describe('parseStats', () => {
  it('reads the response wrapper', () => {
    expect(
      parseStats({
        response: { totalOrdersToday: 5, revenueToday: 1200, avgAcceptanceTimeSec: 30, avgPreparationTimeSec: 600, completionRate: 80 },
      }),
    ).toEqual({ orders: 5, revenue: 1200, avgAcceptSec: 30, avgPrepSec: 600, completionRate: 80 });
  });
  it('treats junk numbers as 0 and a missing wrapper as no data', () => {
    expect(parseStats({ response: { totalOrdersToday: 'x' } })?.orders).toBe(0);
    expect(parseStats({})).toBeNull();
    expect(parseStats(null)).toBeNull();
  });
});

describe('mergeOrders', () => {
  it('keeps the first copy of an order that appears on two pages', () => {
    const a1 = { orderId: 'A', customerName: 'first' };
    const merged = mergeOrders([a1], [{ orderId: 'A', customerName: 'second' }, { orderId: 'B' }]);
    expect(merged.map(o => o.orderId)).toEqual(['A', 'B']);
    expect(merged[0]).toBe(a1);
  });
});
