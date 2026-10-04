import { DeviceEventEmitter } from 'react-native';
import NativeVendor from '../../specs/NativeVendor';
import { parseBoard, type Board } from '../domain/board';

export interface Session {
  jwt: string;
  shopId: string;
  phone: string;
}

export interface SetupStatus {
  notifications: boolean;
  fullScreen: boolean;
  batteryUnrestricted: boolean;
}

export type SettingKind = 'notifications' | 'fullScreen' | 'battery' | 'appDetails';
export type LocalAction = 'ACCEPTED' | 'READY' | 'CLOSED';

export const getSession = (): Session | null => {
  const json = NativeVendor.getSession();
  if (!json) return null;
  try {
    return JSON.parse(json) as Session;
  } catch {
    return null;
  }
};

export const startSession = (s: Session) => NativeVendor.startSession(s.jwt, s.shopId, s.phone);
export const logout = () => NativeVendor.logout();
export const getBoard = (): Board => parseBoard(NativeVendor.getBoard());
export const markLocal = (orderId: string, action: LocalAction, prepMinutes = 0) =>
  NativeVendor.markLocal(orderId, action, prepMinutes);
export const pollNow = () => NativeVendor.pollNow();
export const playTestSound = () => NativeVendor.playTestSound();
export const openSetting = (kind: SettingKind) => NativeVendor.openSetting(kind);

export const getSetupStatus = (): SetupStatus => {
  try {
    return JSON.parse(NativeVendor.getSetupStatus()) as SetupStatus;
  } catch {
    return { notifications: true, fullScreen: true, batteryUnrestricted: true };
  }
};

export const onBoardChanged = (fn: () => void) => DeviceEventEmitter.addListener('qvBoardChanged', fn);
export const onSessionEnded = (fn: (e: { expired: boolean }) => void) =>
  DeviceEventEmitter.addListener('qvSessionEnded', fn);
