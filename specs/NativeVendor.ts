import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

// Bridge to the native order watcher (android/app/src/main/java/com/quickverse/vendor).
// Events (DeviceEventEmitter): 'qvBoardChanged', 'qvSessionEnded' ({ expired: boolean }).
export interface Spec extends TurboModule {
  startSession(jwt: string, shopId: string, phone: string): void;
  logout(): void;
  /** JSON `{jwt, shopId, phone}` or null. */
  getSession(): string | null;
  /** JSON `{socket, lastPollOk, lastPollAt, orders:[{phase, localAt, localPrep, order}]}`. */
  getBoard(): string;
  /** After a successful PATCH: 'ACCEPTED' | 'READY' | 'CLOSED' (rejected / handed over). */
  markLocal(orderId: string, action: string, prepMinutes: number): void;
  pollNow(): void;
  playTestSound(): void;
  /** JSON `{notifications, fullScreen, batteryUnrestricted}` (booleans). */
  getSetupStatus(): string;
  /** 'notifications' | 'fullScreen' | 'battery' | 'appDetails' */
  openSetting(kind: string): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeVendor');
