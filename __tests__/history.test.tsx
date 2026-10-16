import React from 'react';
import { RefreshControl, SectionList, Text, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import { presetPeriod, queryOf } from '../src/domain/period';
import { HistoryScreen } from '../src/screens/HistoryScreen';

jest.mock('../src/api/endpoints');
const api = endpoints as jest.Mocked<typeof endpoints>;

let r: ReactTestRenderer.ReactTestRenderer;
const onOpen = jest.fn();
const show = async () => {
  await act(async () => {
    r = ReactTestRenderer.create(<HistoryScreen shopId="7" onOpenOrder={onOpen} />);
  });
};
const textOf = () => r.root.findAllByType(Text).map(t => [t.props.children].flat().join('')).join(' ');
const visibleText = (n: ReactTestRenderer.ReactTestInstance) =>
  n.findAllByType(Text).map(t => [t.props.children].flat().join('')).join(' ');
// By spoken label, else by the visible text of a tappable element (chips are read by their text).
const press = async (label: string) =>
  act(async () =>
    r.root
      .find(
        n =>
          typeof n.props?.onPress === 'function' &&
          (n.props.accessibilityLabel === label || (!n.props.accessibilityLabel && visibleText(n) === label)),
      )
      .props.onPress(),
  );

const delivered = {
  orderId: 'A1',
  state: 'COMPLETED',
  amountExcludingDeliveryFee: 245,
  orderItem: [{ id: 1, name: 'Veg Biryani', itemCount: 2, itemPrice: 100 }],
};

beforeEach(() => jest.clearAllMocks());
afterEach(async () => act(async () => r?.unmount()));

test("loads today's orders of every status first", async () => {
  api.getOrdersPage.mockResolvedValue({ orders: [delivered], totalPages: 1 });
  await show();
  expect(api.getOrdersPage).toHaveBeenCalledWith('7', { statuses: [], timeRange: 'TODAY', page: 0 });
  expect(textOf()).toContain('#A1');
  expect(textOf()).toContain('Delivered');
  expect(textOf()).toContain('₹245');
});

test('a status chip reloads from page 0 with that status', async () => {
  api.getOrdersPage.mockResolvedValue({ orders: [delivered], totalPages: 1 });
  await show();
  await press('Rejected');
  expect(api.getOrdersPage).toHaveBeenLastCalledWith('7', { statuses: ['REJECTED'], timeRange: 'TODAY', page: 0 });
});

test('an empty period says so', async () => {
  api.getOrdersPage.mockResolvedValue({ orders: [], totalPages: 0 });
  await show();
  expect(textOf()).toContain('No orders in this period');
});

test('an error offers a retry', async () => {
  api.getOrdersPage.mockRejectedValueOnce(new ApiError('No connection to the server', null));
  api.getOrdersPage.mockResolvedValueOnce({ orders: [delivered], totalPages: 1 });
  await show();
  expect(textOf()).toContain('No connection to the server');
  await press('Try again');
  expect(api.getOrdersPage).toHaveBeenCalledTimes(2);
  expect(textOf()).toContain('#A1');
});

const stamp = (daysAgo: number, hour: number) => {
  const d = new Date(Date.now());
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:00:00`;
};
const order = (orderId: string, extra: object = {}) => ({ ...delivered, orderId, ...extra });
const typeSearch = async (text: string) =>
  act(async () => r.root.findByType(TextInput).props.onChangeText(text));

test('tapping an order opens its page', async () => {
  api.getOrdersPage.mockResolvedValue({ orders: [delivered], totalPages: 1 });
  await show();
  await press('Order A1, Delivered, ₹245');
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'A1' }), undefined); // no order here carries a rate
});

test('groups orders by day with totals', async () => {
  api.getOrdersPage.mockResolvedValue({
    orders: [
      order('A1', { creationTime: stamp(0, 10) }),
      order('B2', { creationTime: stamp(0, 9), state: 'REJECTED', amountExcludingDeliveryFee: 99 }),
      order('C3', { creationTime: stamp(1, 20), amountExcludingDeliveryFee: 100 }),
    ],
    totalPages: 1,
  });
  await show();
  expect(textOf()).toContain('Today');
  expect(textOf()).toContain('2 orders · ₹245 delivered');
  expect(textOf()).toContain('Yesterday');
  expect(textOf()).toContain('1 order · ₹100 delivered');
});

test('unreadable times go to Earlier', async () => {
  api.getOrdersPage.mockResolvedValue({ orders: [order('A1', { creationTime: 'bad' })], totalPages: 1 });
  await show();
  expect(textOf()).toContain('Earlier');
  expect(textOf()).toContain('#A1');
});

test('a period from the sheet reloads with its query', async () => {
  api.getOrdersPage.mockResolvedValue({ orders: [delivered], totalPages: 1 });
  await show();
  await press('Period: Today');
  await press('Yesterday');
  expect(api.getOrdersPage).toHaveBeenLastCalledWith('7', {
    statuses: [],
    ...queryOf(presetPeriod('YESTERDAY', new Date())),
    page: 0,
  });
  expect(r.root.findAll(n => n.props.accessibilityLabel === 'Period: Yesterday').length).toBeGreaterThan(0);
});

test('search filters loaded orders by id or customer', async () => {
  api.getOrdersPage.mockResolvedValue({
    orders: [order('A1', { customerName: 'Rahul' }), order('B2', { customerName: 'Sneha' })],
    totalPages: 1,
  });
  await show();
  await typeSearch('sne');
  expect(textOf()).toContain('#B2');
  expect(textOf()).not.toContain('#A1');
  await typeSearch('a1');
  expect(textOf()).toContain('#A1');
  expect(textOf()).not.toContain('#B2');
});

test('no search match offers older orders', async () => {
  api.getOrdersPage.mockResolvedValue({ orders: [delivered], totalPages: 2 });
  await show();
  await typeSearch('zzz');
  expect(textOf()).toContain('No orders match "zzz"');
  await press('Search older orders');
  expect(api.getOrdersPage).toHaveBeenLastCalledWith('7', expect.objectContaining({ page: 1 }));
});

test('ignores an answer to an older filter', async () => {
  let resolveFirst: (v: endpoints.OrdersPage) => void = () => {};
  api.getOrdersPage.mockReturnValueOnce(new Promise(res => (resolveFirst = res)));
  api.getOrdersPage.mockResolvedValueOnce({ orders: [order('R9', { state: 'REJECTED' })], totalPages: 1 });
  await show();
  await press('Rejected');
  await act(async () => resolveFirst({ orders: [delivered], totalPages: 1 }));
  expect(textOf()).toContain('#R9');
  expect(textOf()).not.toContain('#A1');
});

test('a later page error keeps the list and offers a retry', async () => {
  api.getOrdersPage.mockResolvedValueOnce({ orders: [delivered], totalPages: 2 });
  api.getOrdersPage.mockRejectedValueOnce(new ApiError('No connection to the server', null));
  await show();
  await act(async () => r.root.findByType(SectionList).props.onEndReached());
  expect(textOf()).toContain('#A1');
  expect(textOf()).toContain('No connection to the server');
  expect(textOf()).toContain('Try again');
});

test('a failed pull-to-refresh retries page 0', async () => {
  api.getOrdersPage.mockResolvedValueOnce({ orders: [delivered], totalPages: 2 });
  api.getOrdersPage.mockRejectedValueOnce(new ApiError('No connection to the server', null));
  api.getOrdersPage.mockResolvedValue({ orders: [delivered], totalPages: 2 });
  await show();
  await act(async () => r.root.findByType(RefreshControl).props.onRefresh());
  expect(textOf()).toContain('No connection to the server');
  await press('Try again');
  expect(api.getOrdersPage).toHaveBeenLastCalledWith('7', expect.objectContaining({ page: 0 }));
});
