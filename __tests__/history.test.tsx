import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import { HistoryScreen } from '../src/screens/HistoryScreen';

jest.mock('../src/api/endpoints');
const api = endpoints as jest.Mocked<typeof endpoints>;

let r: ReactTestRenderer.ReactTestRenderer;
const show = async () => {
  await act(async () => {
    r = ReactTestRenderer.create(<HistoryScreen shopId="7" />);
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

test('tapping an order opens its bill', async () => {
  api.getOrdersPage.mockResolvedValue({ orders: [delivered], totalPages: 1 });
  await show();
  await press('Order A1, Delivered, ₹245');
  expect(textOf()).toContain('Items total');
  expect(textOf()).toContain('2 × Veg Biryani');
});
