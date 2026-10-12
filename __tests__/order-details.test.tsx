import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { Order } from '../src/domain/order';
import { OrderDetailsScreen } from '../src/screens/OrderDetailsScreen';

let r: ReactTestRenderer.ReactTestRenderer;
const onBack = jest.fn();
const show = (order: Partial<Order>) => {
  act(() => {
    r = ReactTestRenderer.create(<OrderDetailsScreen order={order as Order} onBack={onBack} />);
  });
};
const textOf = () => r.root.findAllByType(Text).map(t => [t.props.children].flat().join('')).join(' | ');

const L = {
  orderId: 'L1',
  state: 'COMPLETED',
  creationTime: '2026-10-09 19:38:00',
  acceptedDate: '2026-10-09 19:39:00',
  readyDate: '2026-10-09 19:55:30',
  preparationTime: 15,
  completedDate: '2026-10-09 20:10:00',
  amountExcludingDeliveryFee: 245,
  orderItem: [
    { id: 1, name: 'Veg Biryani', itemCount: 2, itemPrice: 100 },
    { id: 2, name: 'Coke', itemCount: 1, itemPrice: 45 },
  ],
  paymentMethod: 'ONLINE',
  customerName: 'Rahul',
} as Partial<Order>;

beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r?.unmount()));

test('shows the timeline with times and delays', () => {
  show(L);
  const t = textOf();
  for (const s of ['Order placed', '7:38 pm', 'Took 1 min to accept', 'Cooked in 16 min · 1 min late', 'Delivered', '8:10 pm']) {
    expect(t).toContain(s);
  }
});

test('shows the bill', () => {
  show(L);
  const t = textOf();
  for (const s of ['Items total', '₹245', '2 × Veg Biryani', '₹200', '1 × Coke', '₹45']) expect(t).toContain(s);
});

test('a delivered order shows the estimated payout', () => {
  show(L);
  const t = textOf();
  for (const s of ['Gross revenue', 'Commission (10%, estimated)', '-₹24.50', 'Net receivable', '₹220.50', 'To be paid']) {
    expect(t).toContain(s);
  }
});

test('the backend commission is shown without estimated', () => {
  show({ ...L, amountExcludingDeliveryFee: 200, finance: { commission: 16 }, isSettled: true });
  const t = textOf();
  for (const s of ['Commission (8%)', '-₹16', 'Settled']) expect(t).toContain(s);
  expect(t).not.toContain('estimated');
});

test('a rejected order has no payout', () => {
  show({ orderId: 'R1', state: 'REJECTED', amountExcludingDeliveryFee: 99 });
  expect(textOf()).toContain('No payout for this order');
  expect(textOf()).not.toContain('Net receivable');
});

test('an order in progress says payout comes after delivery', () => {
  show({ ...L, state: 'ACCEPTED' });
  expect(textOf()).toContain('Payout after delivery');
});

test('back calls onBack', () => {
  show(L);
  act(() => r.root.find(n => n.props.accessibilityLabel === 'Back' && typeof n.props.onPress === 'function').props.onPress());
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('shows the customer note and rider', () => {
  show({ ...L, orderDescription: 'Less spicy', deliveryPartnerDetails: { name: 'Ravi', mobileNumber: 9876543210 } });
  const t = textOf();
  for (const s of ['Less spicy', 'Note from customer', 'Ravi', 'Call']) expect(t).toContain(s);
  expect(r.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Call').length).toBeGreaterThan(0);
});
