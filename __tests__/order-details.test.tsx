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

test('the bill adds up: fees and taxes the customer paid are shown (live order: 1000 + 20 + 11 = 1031)', () => {
  show({ ...L, amountExcludingDeliveryFee: 1000, deliveryFee: 20, totalAmount: 1031 });
  const t = textOf();
  for (const s of ['Items total', '₹1,000', 'Delivery fee (paid by customer)', '₹20', 'Fees & taxes (paid by customer)', '₹11', 'Customer paid', '₹1,031']) {
    expect(t).toContain(s);
  }
  show({ ...L, amountExcludingDeliveryFee: 245, deliveryFee: 20, totalAmount: 265 });
  expect(textOf()).not.toContain('Fees & taxes');
});

test('a long order ID is not cut off in the title', () => {
  show({ ...L, orderId: '9066325384336548' });
  const title = r.root.find(n => n.props?.accessibilityRole === 'header' && typeof n.props.numberOfLines === 'number');
  expect(title.props.numberOfLines).toBe(2);
});

test('a delivered order shows the estimated payout', () => {
  show(L);
  const t = textOf();
  for (const s of ['Gross revenue', 'Commission (10%, estimated)', '-₹25', 'Net receivable', '₹220', 'To be paid']) {
    expect(t).toContain(s);
  }
});

test('the backend commission is shown without estimated', () => {
  show({ ...L, amountExcludingDeliveryFee: 200, finance: { itemTotalAmount: 200, commissionRate: 8, commission: 16 }, isSettled: true });
  const t = textOf();
  for (const s of ['Commission (8%)', '-₹16', 'Settled']) expect(t).toContain(s);
  expect(t).not.toContain('estimated');
});

test('a coupon order shows the coupon the shop paid and what the commission was taken on', () => {
  show({
    ...L,
    amountExcludingDeliveryFee: 100,
    finance: { itemTotalAmount: 168, couponDiscount: 68, commissionRate: 10, commission: 17 },
  });
  const t = textOf();
  for (const s of ['Item total', '₹168', 'Coupon (paid by shop)', '-₹68', 'Gross revenue', '₹100', 'Commission (10% of ₹168)', '-₹17', '₹83']) {
    expect(t).toContain(s);
  }
  // The bill says the same as the earnings: items ₹168 before the coupon, never ₹100 as "Items total".
  expect(t).toContain('Items total | ₹168 | Coupon (paid by shop) | -₹68');
  expect(t).not.toContain('Items total | ₹100');
});

test('an estimated order uses the shop rate it was opened with, so it matches its Earnings card', () => {
  act(() => {
    r = ReactTestRenderer.create(<OrderDetailsScreen order={L as Order} commissionPct={5} onBack={onBack} />);
  });
  const t = textOf();
  expect(t).toContain('Commission (5%, estimated)');
  expect(t).toContain('Estimated at 5%');
});

test('a commission sent without a rate shows no made-up percent', () => {
  show({ ...L, amountExcludingDeliveryFee: 232, finance: { commission: 12 } });
  const t = textOf();
  expect(t).toContain('Commission | -₹12');
  expect(t).not.toMatch(/Commission \(\d/);
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
