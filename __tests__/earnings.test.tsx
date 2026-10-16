import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { Order } from '../src/domain/order';
import { addDays, dayLabel, rangeQuery, settlementWeek } from '../src/domain/period';
import { EarningsScreen } from '../src/screens/EarningsScreen';

jest.mock('../src/api/endpoints');
const api = endpoints as jest.Mocked<typeof endpoints>;

const now = new Date();
const week0 = settlementWeek(now, 0);
const inside = (() => {
  const d = addDays(week0.start, 1);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
})();
const A = { orderId: 'A', state: 'COMPLETED', amountExcludingDeliveryFee: 245, creationTime: inside, paymentMethod: 'ONLINE' } as unknown as Order;
const B = {
  orderId: 'B',
  state: 'COMPLETED',
  amountExcludingDeliveryFee: 200,
  finance: { itemTotalAmount: 200, commissionRate: 8, commission: 16 },
  isSettled: true,
  creationTime: inside,
} as unknown as Order;

let r: ReactTestRenderer.ReactTestRenderer;
const onOpenOrder = jest.fn();
const ui = (active: boolean) => <EarningsScreen shopId="7" active={active} onOpenOrder={onOpenOrder} />;
const show = async () => {
  await act(async () => {
    r = ReactTestRenderer.create(ui(true));
  });
};
const textOf = () => r.root.findAllByType(Text).map(t => [t.props.children].flat().join('')).join(' | ');
const byLabel = (label: string) =>
  r.root.find(n => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');

beforeEach(() => {
  jest.clearAllMocks();
  api.getAllOrders.mockResolvedValue({ orders: [A, B], complete: true });
});
afterEach(async () => act(async () => r?.unmount()));

test("loads this week's delivered orders once", async () => {
  await show();
  expect(api.getAllOrders).toHaveBeenCalledTimes(1);
  expect(api.getAllOrders).toHaveBeenCalledWith('7', { statuses: ['COMPLETED'], ...rangeQuery(week0) });
});

test('shows the week summary', async () => {
  await show();
  const text = textOf();
  for (const s of [
    'Net receivable',
    '₹409',
    '₹445',
    '-₹36',
    '₹225',
    '₹184',
    `Payout on ${dayLabel(week0.end)} · 2 orders`,
    'Commission is estimated at 8% where QuickVerse did not send it.',
  ])
    expect(text).toContain(s);
});

test('each order card shows gross, commission and net', async () => {
  await show();
  const text = textOf();
  for (const s of ['ID: A', 'Commission (8%, estimated)', '-₹20', 'To be paid', 'ID: B', 'Commission (8%)', '-₹16', 'Settled'])
    expect(text).toContain(s);
});

test('a card opens the order', async () => {
  await show();
  act(() => byLabel('Order A, net receivable ₹225').props.onPress());
  expect(onOpenOrder).toHaveBeenCalledWith(A);
});

test('week arrows move by one week', async () => {
  await show();
  expect(byLabel('Next week').props.accessibilityState).toEqual({ disabled: true });
  await act(async () => byLabel('Previous week').props.onPress());
  expect(api.getAllOrders).toHaveBeenLastCalledWith('7', {
    statuses: ['COMPLETED'],
    ...rangeQuery(settlementWeek(now, -1)),
  });
  expect(textOf()).toContain('Last week');
  expect(byLabel('Next week').props.accessibilityState).toEqual({ disabled: false });
});

test('an empty week says so', async () => {
  api.getAllOrders.mockResolvedValue({ orders: [], complete: true });
  await show();
  expect(textOf()).toContain('No delivered orders in this week');
});

test('an error offers a retry', async () => {
  api.getAllOrders.mockReset();
  api.getAllOrders.mockRejectedValueOnce(new ApiError('No connection to the server', null));
  api.getAllOrders.mockResolvedValueOnce({ orders: [A], complete: true });
  await show();
  expect(textOf()).toContain("Couldn't load earnings");
  expect(textOf()).toContain('No connection to the server');
  await act(async () => byLabel('Try again').props.onPress());
  expect(api.getAllOrders).toHaveBeenCalledTimes(2);
  expect(textOf()).toContain('ID: A');
});

test('a capped week says only part is shown', async () => {
  api.getAllOrders.mockResolvedValue({ orders: [A], complete: false });
  await show();
  expect(textOf()).toContain('Showing the first 1,000 orders of this week');
});

test('opening the tab again reloads', async () => {
  await show();
  await act(async () => r.update(ui(false)));
  expect(api.getAllOrders).toHaveBeenCalledTimes(1);
  await act(async () => r.update(ui(true)));
  expect(api.getAllOrders).toHaveBeenCalledTimes(2);
});

test("switching weeks never shows the previous week's numbers", async () => {
  await show();
  let reject: (e: Error) => void = () => {};
  api.getAllOrders.mockReturnValueOnce(new Promise((_, rej) => (reject = rej)));
  await act(async () => byLabel('Previous week').props.onPress());
  expect(textOf()).not.toContain('₹409');
  expect(textOf()).not.toContain('ID: A');
  await act(async () => reject(new ApiError('No connection to the server', null)));
  expect(textOf()).toContain("Couldn't load earnings");
  expect(textOf()).not.toContain('₹409');
});

test('past weeks say of the week when capped', async () => {
  await show();
  api.getAllOrders.mockResolvedValueOnce({ orders: [A], complete: false });
  await act(async () => byLabel('Previous week').props.onPress());
  expect(textOf()).toContain('Showing the first 1,000 orders of the week');
});

test('a failed refresh keeps the numbers and says so once', async () => {
  await show();
  await act(async () => r.update(ui(false)));
  api.getAllOrders.mockRejectedValueOnce(new ApiError('Try again.', 500));
  await act(async () => r.update(ui(true)));
  expect(textOf()).toContain('₹409');
  expect(textOf()).toContain('Showing the last numbers.');
  expect(textOf()).not.toContain('..');
});
