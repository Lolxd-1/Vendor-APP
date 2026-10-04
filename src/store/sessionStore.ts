import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface Session {
  jwt: string;
  shopId: string;
  phone: string;
}

interface SessionState {
  session: Session | null;
  hydrated: boolean;
  saveSession: (session: Session) => void;
  clearSession: () => void;
}

const decodeBase64Url = (part: string): string => {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
};

// Compares the JWT `exp` claim (seconds) with now plus a safety skew.
// FAIL-OPEN: a null/malformed token or one without `exp` is NOT expired — never log a vendor
// out mid-shift because something could not be parsed (same rule as the web dashboard).
export const isTokenExpired = (jwt: string | null | undefined, skewSeconds = 30, now = Date.now()): boolean => {
  try {
    if (!jwt) return false;
    const parts = jwt.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= now + skewSeconds * 1000;
  } catch {
    return false;
  }
};

export const useSessionStore = create<SessionState>()(
  persist(
    set => ({
      session: null,
      hydrated: false,
      saveSession: session => set({ session }),
      clearSession: () => set({ session: null }),
    }),
    {
      name: 'quickverse-vendor-session',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({ session: state.session }),
      onRehydrateStorage: () => () => {
        useSessionStore.setState({ hydrated: true });
      },
    },
  ),
);

// Resolves once the persisted session has been read — needed in headless (push) starts,
// where no screen waits for hydration.
export const whenSessionHydrated = (): Promise<void> =>
  useSessionStore.getState().hydrated
    ? Promise.resolve()
    : new Promise(resolve => {
        const unsub = useSessionStore.subscribe(s => {
          if (s.hydrated) {
            unsub();
            resolve();
          }
        });
      });
