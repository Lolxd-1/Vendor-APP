import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import { EMPTY_BOARD, type Board } from '../src/domain/board';
import { InsightsScreen } from '../src/screens/InsightsScreen';

jest.mock('../src/api/endpoints');
const api = endpoints as jest.Mocked<typeof endpoints>;

let r: ReactTestRenderer.ReactTestRenderer;
const show = async (board: Board = EMPTY_BOARD) => {
  await act(async () => {
    r = ReactTestRenderer.create(<InsightsScreen shopId="7" board={board} active />);
  });
};
const textOf = () => r.root.findAllByType(Text).map(t => [t.props.children].flat().join('')).join(' | ');

beforeEach(() => jest.clearAllMocks());
afterEach(async () => act(async () => r?.unmount()));

test("shows today's numbers in plain words", async () => {
  api.getDashboardStats.mockResolvedValue({ orders: 5, revenue: 1200, avgAcceptSec: 30, avgPrepSec: 600, completionRate: 80 });
  await show();
  expect(api.getDashboardStats).toHaveBeenCalledWith('7');
  const text = textOf();
  expect(text).toContain('₹1,200');
  expect(text).toContain('From 5 orders');
  expect(text).toContain('80%');
  expect(text).toContain('30 sec');
  expect(text).toContain('10 min');
});

test('right now counts come from the live board', async () => {
  api.getDashboardStats.mockResolvedValue({ orders: 0, revenue: 0, avgAcceptSec: 0, avgPrepSec: 0, completionRate: 0 });
  const pending = (id: string) => ({ phase: 'PENDING' as const, localAt: null, localPrep: null, order: { orderId: id } });
  await show({ ...EMPTY_BOARD, orders: [pending('A'), pending('B')] });
  expect(textOf()).toContain('New | 2');
});

test('an error offers a retry', async () => {
  api.getDashboardStats.mockRejectedValueOnce(new ApiError('No connection to the server', null));
  api.getDashboardStats.mockResolvedValueOnce({ orders: 1, revenue: 99, avgAcceptSec: 0, avgPrepSec: 0, completionRate: 100 });
  await show();
  expect(textOf()).toContain('No connection to the server');
  await act(async () =>
    r.root.find(n => n.props?.accessibilityLabel === 'Try again' && typeof n.props.onPress === 'function').props.onPress(),
  );
  expect(api.getDashboardStats).toHaveBeenCalledTimes(2);
  expect(textOf()).toContain('₹99');
});
