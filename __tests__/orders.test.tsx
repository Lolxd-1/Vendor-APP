import React from 'react';
import { Linking, Text, TextInput, ToastAndroid } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { Board, BoardEntry } from '../src/domain/board';
import type { Order, OrderPhase } from '../src/domain/order';
import type { StoreStatusApi } from '../src/hooks/useStoreStatus';
import * as vendor from '../src/native/vendor';
import { OrdersScreen } from '../src/screens/OrdersScreen';

jest.mock('../src/api/endpoints');
jest.mock('../src/native/vendor', () => ({ markLocal: jest.fn(), pollNow: jest.fn() }));
const api = endpoints as jest.Mocked<typeof endpoints>;
const native = vendor as jest.Mocked<typeof vendor>;

const OK_SETUP = { notifications: true, fullScreen: true, batteryUnrestricted: true };

const fakeStore = (over: Partial<StoreStatusApi> = {}): StoreStatusApi => ({
  schedule: null,
  status: { online: true, reason: null },
  busy: false,
  error: null,
  loading: false,
  setOnline: jest.fn(async () => true),
  save: jest.fn(async () => true),
  reload: jest.fn(),
  ...over,
});

const entry = (phase: OrderPhase, order: Partial<Order> = {}, local: Partial<BoardEntry> = {}): BoardEntry => ({
  phase,
  localAt: null,
  localPrep: null,
  order: { orderId: 'A1', ...order },
  ...local,
});

const boardOf = (...orders: BoardEntry[]): Board => ({ socket: true, lastPollOk: true, lastPollAt: 1, orders });

let r: ReactTestRenderer.ReactTestRenderer;
const show = async (e: BoardEntry, store = fakeStore(), setup = OK_SETUP, onOpenAlerts = jest.fn()) => {
  await act(async () => {
    r = ReactTestRenderer.create(
      <OrdersScreen
        session={{ jwt: 'j', shopId: '7', phone: '9876543210' }}
        board={boardOf(e)}
        setup={setup}
        store={store}
        shopName="Tasty Bites"
        segment={e.phase}
        onSegment={jest.fn()}
        onOpenAlerts={onOpenAlerts}
        onOpenTimings={jest.fn()}
      />,
    );
  });
  return r;
};
const textOf = () => r.root.findAllByType(Text).map(t => [t.props.children].flat().join('')).join(' ');
const node = (label: string) => r.root.find(n => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');
const press = async (label: string) => act(async () => node(label).props.onPress());
const isDisabled = (label: string) =>
  r.root.find(n => n.props?.accessibilityLabel === label && n.props.accessibilityState).props.accessibilityState.disabled;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(ToastAndroid, 'show').mockReturnValue(undefined);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(async () => act(async () => r?.unmount()));

const callOrder = (...mocks: jest.Mock[]) => mocks.map(m => m.mock.invocationCallOrder[0]);

describe('new orders', () => {
  it('accept: server first, then the native board, then a poll', async () => {
    api.acceptOrder.mockResolvedValue({});
    await show(entry('PENDING'));
    await press('Accept order');
    expect(api.acceptOrder).toHaveBeenCalledWith('A1', 15);
    expect(native.markLocal).toHaveBeenCalledWith('A1', 'ACCEPTED', 15);
    const [a, m, p] = callOrder(api.acceptOrder as jest.Mock, native.markLocal as jest.Mock, native.pollNow as jest.Mock);
    expect(a).toBeLessThan(m);
    expect(m).toBeLessThan(p);
  });

  it('the stepper changes the prep time that is sent', async () => {
    api.acceptOrder.mockResolvedValue({});
    await show(entry('PENDING'));
    await press('More time');
    expect(textOf()).toContain('20 min');
    await press('Accept order');
    expect(api.acceptOrder).toHaveBeenCalledWith('A1', 20);
  });

  it('a failed accept says so, leaves the board alone and re-enables the button', async () => {
    api.acceptOrder.mockRejectedValue(new ApiError('boom', 500));
    await show(entry('PENDING'));
    await press('Accept order');
    expect(textOf()).toContain(
      'Accept failed — it may still have been accepted. Wait a few seconds before retrying. (boom)',
    );
    expect(native.markLocal).not.toHaveBeenCalled();
    expect(isDisabled('Accept order')).toBe(false);
  });

  it('reject with a preset reason', async () => {
    api.rejectOrder.mockResolvedValue({});
    await show(entry('PENDING'));
    await press('Reject');
    await press('Item out of stock');
    await press('Reject order');
    expect(api.rejectOrder).toHaveBeenCalledWith('A1', 'Item out of stock');
    expect(native.markLocal).toHaveBeenCalledWith('A1', 'CLOSED', 0);
  });

  it('reject with a too-short typed reason sends nothing', async () => {
    await show(entry('PENDING'));
    await press('Reject');
    await press('Other reason');
    const input = r.root.find(n => n.type === TextInput && n.props.accessibilityLabel === 'Reason for rejecting');
    await act(async () => input.props.onChangeText('ab'));
    await press('Reject order');
    expect(textOf()).toContain('Reason must be at least 3 characters.');
    expect(api.rejectOrder).not.toHaveBeenCalled();
  });
});

describe('preparing and ready', () => {
  it('a late order says so and can be marked ready', async () => {
    api.markOrderReady.mockResolvedValue({});
    await show(entry('ACCEPTED', {}, { localAt: Date.now() - 20 * 60_000, localPrep: 15 }));
    expect(textOf()).toContain('Late by');
    await press('Mark food ready');
    expect(api.markOrderReady).toHaveBeenCalledWith('A1');
    expect(native.markLocal).toHaveBeenCalledWith('A1', 'READY', 0);
  });

  it('hand over stays locked until the rider is at the shop', async () => {
    await show(entry('READY_FOR_PICKUP'));
    expect(isDisabled('Hand over to rider')).toBe(true);
    expect(textOf()).toContain('Unlocks when the rider reaches your shop.');
    await act(async () => r.unmount());

    api.handoverOrder.mockResolvedValue({});
    await show(entry('READY_FOR_PICKUP', { assignedPartner: { orderStatus: 'ARRIVED_AT_STORE' } }));
    expect(textOf()).toContain('Rider at your shop');
    await press('Hand over to rider');
    expect(api.handoverOrder).toHaveBeenCalledWith('A1');
    expect(native.markLocal).toHaveBeenCalledWith('A1', 'CLOSED', 0);
  });

  it('shows the customer note, rider OTP and calls the rider', async () => {
    await show(
      entry('ACCEPTED', {
        orderId: 'QV-104587',
        orderDescription: 'Less spicy',
        deliveryPartnerDetails: { name: 'Ravi', mobileNumber: 98765 },
      }),
    );
    expect(textOf()).toContain('Less spicy');
    expect(textOf()).toContain('4587');
    await press('Call');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:98765');
  });

  it.each<OrderPhase>(['PENDING', 'ACCEPTED', 'READY_FOR_PICKUP'])('a bare %s order still renders', async phase => {
    await show(entry(phase));
    expect(textOf()).toContain('--');
    expect(textOf()).toContain('No items');
  });
});

describe('header', () => {
  it('going offline asks first', async () => {
    const store = fakeStore();
    await show(entry('PENDING'), store);
    expect(textOf()).toContain('Shop #7');
    await press('Store online');
    expect(textOf()).toContain('Go offline?');
    await press('Stay online');
    expect(store.setOnline).not.toHaveBeenCalled();
    await press('Store online');
    await press('Go offline');
    expect(store.setOnline).toHaveBeenCalledWith(false);
  });

  it('warns about missing phone setup and opens the alerts page', async () => {
    const onOpenAlerts = jest.fn();
    await show(entry('PENDING'), fakeStore(), { ...OK_SETUP, notifications: false }, onOpenAlerts);
    expect(textOf()).toContain('Orders may be missed');
    await press('Fix');
    expect(onOpenAlerts).toHaveBeenCalled();
  });
});
