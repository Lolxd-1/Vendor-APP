import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../specs/NativeVendor', () => ({
  __esModule: true,
  default: {
    getSession: jest.fn((): string | null => null),
    getBoard: jest.fn(() => JSON.stringify({ socket: true, lastPollOk: true, lastPollAt: 1, orders: [] })),
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

// All rendered strings (the JSON tree itself can be circular through FlatList refs).
const textOf = (r: ReactTestRenderer.ReactTestRenderer): string => {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(r.toJSON());
  return out.join(' ');
};

test('shows login when there is no session', async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    r = ReactTestRenderer.create(<App />);
  });
  expect(textOf(r)).toContain('Send OTP');
  await ReactTestRenderer.act(async () => r.unmount());
});

test('shows the order board when a session exists', async () => {
  mockNative.getSession.mockReturnValueOnce(JSON.stringify({ jwt: 'a.b.c', shopId: '7', phone: '9876543210' }));
  let r!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    r = ReactTestRenderer.create(<App />);
  });
  expect(textOf(r)).toContain('Shop #');
  expect(textOf(r)).toContain('No new orders');
  await ReactTestRenderer.act(async () => r.unmount());
});
