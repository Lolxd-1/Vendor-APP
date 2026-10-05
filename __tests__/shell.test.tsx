import React from 'react';
import { DeviceEventEmitter, Text, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import { backAction } from '../src/app/MainShell';

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

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.reject(new TypeError('offline')));
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
