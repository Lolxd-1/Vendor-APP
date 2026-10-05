import React from 'react';
import { Alert, Text, ToastAndroid } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { EMPTY_BOARD } from '../src/domain/board';
import type { StoreStatusApi } from '../src/hooks/useStoreStatus';
import * as vendor from '../src/native/vendor';
import { AccountScreen } from '../src/screens/AccountScreen';
import { AlertsScreen } from '../src/screens/AlertsScreen';
import { StoreTimingsScreen } from '../src/screens/StoreTimingsScreen';

jest.mock('../src/native/vendor', () => ({ logout: jest.fn(), playTestSound: jest.fn(), openSetting: jest.fn() }));
const native = vendor as jest.Mocked<typeof vendor>;

const SESSION = { jwt: 'j', shopId: '7', phone: '9876543210' };
const OK_SETUP = { notifications: true, fullScreen: true, batteryUnrestricted: true };

let r: ReactTestRenderer.ReactTestRenderer;
const show = async (el: React.ReactElement) => {
  await act(async () => {
    r = ReactTestRenderer.create(el);
  });
};
const textOf = () => r.root.findAllByType(Text).map(t => [t.props.children].flat().join('')).join(' ');
const press = async (label: string | RegExp) =>
  act(async () =>
    r.root
      .find(
        n =>
          typeof n.props?.onPress === 'function' &&
          typeof n.props.accessibilityLabel === 'string' &&
          (typeof label === 'string' ? n.props.accessibilityLabel === label : label.test(n.props.accessibilityLabel)),
      )
      .props.onPress(),
  );

const fakeStore = (over: Partial<StoreStatusApi> = {}): StoreStatusApi => ({
  schedule: { manualOffline: false, week: {} },
  status: { online: true, reason: null },
  busy: false,
  error: null,
  loading: false,
  setOnline: jest.fn(async () => true),
  save: jest.fn(async () => true),
  reload: jest.fn(),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(ToastAndroid, 'show').mockReturnValue(undefined);
});
afterEach(async () => act(async () => r?.unmount()));

describe('Account', () => {
  it('shows the shop profile', async () => {
    await show(<AccountScreen session={SESSION} profile={{ name: 'Tasty Bites', owner: 'Ravi' }} setup={OK_SETUP} onOpen={jest.fn()} />);
    expect(textOf()).toContain('Tasty Bites');
    expect(textOf()).toContain('Ravi');
    expect(textOf()).toContain('TB');
  });

  it('falls back to the shop number without a profile', async () => {
    await show(<AccountScreen session={SESSION} profile={null} setup={OK_SETUP} onOpen={jest.fn()} />);
    expect(textOf()).toContain('Shop #7');
  });

  it('log out asks first, with the same warning as before', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockReturnValue(undefined);
    await show(<AccountScreen session={SESSION} profile={null} setup={OK_SETUP} onOpen={jest.fn()} />);
    await press('Log out');
    expect(alert).toHaveBeenCalledWith(
      'Log out?',
      'New orders will NOT ring on this phone until you log in again.',
      expect.any(Array),
    );
    expect(native.logout).not.toHaveBeenCalled();
  });

  it('flags missing phone setup and opens the alerts page', async () => {
    const onOpen = jest.fn();
    await show(<AccountScreen session={SESSION} profile={null} setup={{ ...OK_SETUP, fullScreen: false }} onOpen={onOpen} />);
    await press('Order alerts & phone setup, Fix needed');
    expect(onOpen).toHaveBeenCalledWith('alerts');
  });
});

describe('Store timings', () => {
  it('lists every day as open when nothing is set', async () => {
    await show(<StoreTimingsScreen store={fakeStore()} onBack={jest.fn()} />);
    expect(textOf().match(/Open all day/g)).toHaveLength(7);
  });

  it('closing Monday all day saves the whole week', async () => {
    const store = fakeStore();
    await show(<StoreTimingsScreen store={store} onBack={jest.fn()} />);
    await press(/^Monday/);
    await press('Closed all day');
    await press('Save');
    expect(store.save).toHaveBeenCalledWith({ Mon: { openTime: '00:00', closeTime: '00:00' } });
  });

  it('closing Monday for some hours uses the steppers', async () => {
    const store = fakeStore({ schedule: { manualOffline: false, week: { Sun: { openTime: '00:00', closeTime: '00:00' } } } });
    await show(<StoreTimingsScreen store={store} onBack={jest.fn()} />);
    await press(/^Monday/);
    await press('Closed for some hours');
    await press('Closed from later');
    expect(textOf()).toContain('2:30 pm');
    await press('Save');
    expect(store.save).toHaveBeenCalledWith({
      Sun: { openTime: '00:00', closeTime: '00:00' },
      Mon: { openTime: '14:30', closeTime: '16:00' },
    });
  });
});

describe('Order alerts', () => {
  it('a missing setting has a Fix button that opens Android settings', async () => {
    await show(<AlertsScreen board={EMPTY_BOARD} setup={{ ...OK_SETUP, notifications: false }} onBack={jest.fn()} />);
    expect(textOf()).toContain('Not checked yet');
    await press('Fix');
    expect(native.openSetting).toHaveBeenCalledWith('notifications');
  });

  it('plays the test sound', async () => {
    await show(<AlertsScreen board={EMPTY_BOARD} setup={OK_SETUP} onBack={jest.fn()} />);
    await press('Play test sound');
    expect(native.playTestSound).toHaveBeenCalled();
  });
});
