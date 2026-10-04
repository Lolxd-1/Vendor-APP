import { byPhase, parseBoard } from '../src/domain/board';
import type { Order } from '../src/domain/order';
import { canHandOver, isValidIndianMobile, isValidRejectReason, riderOtp, riderStatusOf } from '../src/domain/orderRules';
import { elapsedLabel, formatDuration, parseServerTime, prepRemainingMs } from '../src/domain/time';

const order = (o: Partial<Order> = {}): Order => ({ orderId: 'QV1001', ...o });

describe('parseBoard', () => {
  it('reads the native snapshot', () => {
    const board = parseBoard(
      JSON.stringify({
        socket: true,
        lastPollOk: true,
        lastPollAt: 5,
        orders: [
          { phase: 'PENDING', localAt: null, localPrep: null, order: { orderId: 'A' } },
          { phase: 'ACCEPTED', localAt: 10, localPrep: 15, order: { orderId: 'B' } },
        ],
      }),
    );
    expect(board.socket).toBe(true);
    expect(byPhase(board, 'PENDING').map(e => e.order.orderId)).toEqual(['A']);
    expect(byPhase(board, 'ACCEPTED')[0].localPrep).toBe(15);
  });

  it('drops malformed entries instead of crashing', () => {
    const board = parseBoard(
      JSON.stringify({ orders: [{ phase: 'BOGUS', order: { orderId: 'A' } }, { phase: 'PENDING', order: {} }, null] }),
    );
    expect(board.orders).toEqual([]);
    expect(board.lastPollOk).toBeNull();
  });

  it('returns an empty board for invalid JSON', () => {
    expect(parseBoard('not json').orders).toEqual([]);
  });
});

describe('order display rules', () => {
  it('rider OTP is the last 4 digits of the order id (same as the printed bill)', () => {
    expect(riderOtp('QV-2026-104587')).toBe('4587');
    expect(riderOtp('AB12')).toBe('AB12');
  });

  it('hand-over only once the rider has arrived (either casing / field spelling)', () => {
    expect(canHandOver(order({ assignedPartner: { orderStatus: 'arrived_at_store' } }))).toBe(true);
    expect(canHandOver(order({ assignedPartner: { OrderStatus: 'ARRIVED_AT_STORE' } }))).toBe(true);
    expect(canHandOver(order({ assignedPartner: { orderStatus: 'PARTNER_ASSIGNED' } }))).toBe(false);
    expect(canHandOver(order())).toBe(false);
    expect(riderStatusOf(order({ assignedPartner: { orderStatus: '  ' } }))).toBeUndefined();
  });

  it('reject reason needs 3 real characters', () => {
    expect(isValidRejectReason('  ab ', 3)).toBe(false);
    expect(isValidRejectReason('out of stock', 3)).toBe(true);
  });

  it('accepts only 10-digit Indian mobiles', () => {
    expect(isValidIndianMobile('9876543210')).toBe(true);
    expect(isValidIndianMobile('5876543210')).toBe(false);
    expect(isValidIndianMobile('987654321')).toBe(false);
  });
});

describe('time helpers', () => {
  it('parses epoch, ISO and the backend "yyyy-MM-dd HH:mm:ss" form', () => {
    expect(parseServerTime('1700000000000')).toBe(1_700_000_000_000);
    expect(parseServerTime('2026-10-05T10:00:00Z')).toBe(Date.parse('2026-10-05T10:00:00Z'));
    expect(parseServerTime('2026-10-05 10:00:00')).toBe(Date.parse('2026-10-05T10:00:00'));
    expect(parseServerTime('garbage')).toBeNull();
    expect(parseServerTime(undefined)).toBeNull();
  });

  it('formats durations and clamps negatives', () => {
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('00:00');
    expect(elapsedLabel(null, 0)).toBe('--:--');
  });

  it('prep countdown needs an accept time and a positive prep', () => {
    expect(prepRemainingMs(0, 15, 60_000)).toBe(14 * 60_000);
    expect(prepRemainingMs(null, 15, 0)).toBeNull();
    expect(prepRemainingMs(0, 0, 0)).toBeNull();
  });
});
