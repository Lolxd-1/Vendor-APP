import React from 'react';
import { DeviceEventEmitter, Text, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import { backAction } from '../src/app/MainShell';
import { TabBar } from '../src/app/TabBar';

jest.mock('../specs/NativeVendor', () => ({
  __esModule: true,
  default: {
    getSession: jest.fn((): string | null => null),
    getBoard: jest.fn(),
    getSetupStatus: jest.fn(() => JSON.stringify({ notifications: true, fullScreen: true, batteryUnrestricted: true })),
    startSession: jest.fn(),
    logout: jest.fn(),
    markLocal: jest.fn(),
    pollNow: jest.fn(),
    playTestSound: jest.fn(),
    openSetting: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));
const mockNative = jest.requireMock('../specs/NativeVendor').default;

const board = (orders: { phase: string; id: string }[]) =>
  JSON.stringify({
    socket: true,
    lastPollOk: true,
    lastPollAt: 1,
    orders: orders.map(o => ({ phase: o.phase, localAt: null, localPrep: null, order: { orderId: o.id } })),
  });

const serverNow = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    if (!String(url).includes('/orders')) return Promise.reject(new TypeError('offline'));
    const H1 = { orderId: 'H1', state: 'COMPLETED', amountExcludingDeliveryFee: 99, creationTime: serverNow() };
    return Promise.resolve({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ response: { orders: [H1], totalPages: 1 } }),
    });
  });
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  mockNative.getBoard.mockReturnValue(board([]));
});

const textOf = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map(t => [t.props.children].flat().join('')).join(' ');
const byLabel = (r: ReactTestRenderer.ReactTestRenderer, label: string) =>
  r.root.find(n => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');

const renderApp = async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
  });
  return r;
};
const tabBars = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(TabBar);
const openH1 = async (r: ReactTestRenderer.ReactTestRenderer) => {
  await act(async () => byLabel(r, 'History').props.onPress());
  await act(async () => byLabel(r, 'Order H1, Delivered, ₹99').props.onPress());
};
const loggedIn = () =>
  mockNative.getSession.mockReturnValueOnce(JSON.stringify({ jwt: 'a.b.c', shopId: '7', phone: '9876543210' }));

describe('backAction', () => {
  it('closes an open page first', () => {
    expect(backAction({ tab: 'history', stack: ['timings'] })).toEqual({ tab: 'history', stack: [] });
  });
  it('then returns to Orders', () => {
    expect(backAction({ tab: 'history', stack: [] })).toEqual({ tab: 'orders', stack: [] });
  });
  it('lets Android handle back on Orders', () => {
    expect(backAction({ tab: 'orders', stack: [] })).toBeNull();
  });
});

describe('tabs', () => {
  it('shows the pending count on the Orders tab', async () => {
    loggedIn();
    mockNative.getBoard.mockReturnValue(board([{ phase: 'PENDING', id: 'A1' }]));
    const r = await renderApp();
    expect(byLabel(r, 'Orders, 1 new').props.accessibilityState).toEqual({ selected: true });
    expect(textOf(r)).toContain('Insights');
    await act(async () => r.unmount());
  });

  it('a new order brings Orders to the front from another tab', async () => {
    loggedIn();
    const r = await renderApp();
    await act(async () => byLabel(r, 'History').props.onPress());
    expect(byLabel(r, 'History').props.accessibilityState).toEqual({ selected: true });

    mockNative.getBoard.mockReturnValue(board([{ phase: 'PENDING', id: 'A1' }]));
    await act(async () => {
      DeviceEventEmitter.emit('qvBoardChanged');
    });
    expect(byLabel(r, 'Orders, 1 new').props.accessibilityState).toEqual({ selected: true });
    expect(byLabel(r, 'History').props.accessibilityState).toEqual({ selected: false });
    await act(async () => r.unmount());
  });

  it('shows five tabs', async () => {
    loggedIn();
    const r = await renderApp();
    const labels = r.root
      .findByType(TabBar)
      .findAll(n => n.props?.accessibilityRole === 'tab' && typeof n.props.onPress === 'function')
      .map(n => n.props.accessibilityLabel);
    expect(labels).toEqual(['Orders', 'History', 'Earnings', 'Insights', 'Account']);
    await act(async () => r.unmount());
  });

  it('opens an order from History and goes back', async () => {
    loggedIn();
    const r = await renderApp();
    await openH1(r);
    expect(textOf(r)).toContain('Order #H1');
    expect(tabBars(r)).toHaveLength(0);

    await act(async () => byLabel(r, 'Back').props.onPress());
    expect(textOf(r)).not.toContain('Order #H1');
    expect(byLabel(r, 'History').props.accessibilityState).toEqual({ selected: true });
    expect(tabBars(r)).toHaveLength(1);
    await act(async () => r.unmount());
  });

  it('a new order closes the order page', async () => {
    loggedIn();
    const r = await renderApp();
    await openH1(r);
    expect(textOf(r)).toContain('Order #H1');

    mockNative.getBoard.mockReturnValue(board([{ phase: 'PENDING', id: 'A1' }]));
    await act(async () => {
      DeviceEventEmitter.emit('qvBoardChanged');
    });
    expect(textOf(r)).not.toContain('Order #H1');
    expect(byLabel(r, 'Orders, 1 new').props.accessibilityState).toEqual({ selected: true });
    await act(async () => r.unmount());
  });
});

describe('login', () => {
  it('rejects a short number without calling the backend', async () => {
    const r = await renderApp();
    const input = r.root.find(n => n.type === TextInput && n.props.accessibilityLabel === 'Mobile number');
    await act(async () => input.props.onChangeText('12345'));
    await act(async () => byLabel(r, 'Send OTP').props.onPress());
    expect(textOf(r)).toContain('Enter a valid 10-digit mobile number');
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
});
