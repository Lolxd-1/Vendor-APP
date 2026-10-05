import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';

interface RemoteState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export const errorText = (e: unknown): string =>
  e instanceof ApiError ? e.message : 'Something went wrong. Try again.';

/**
 * Loads data for a screen and re-loads when `deps` change or `reload()` is called. Only the newest request may
 * write its result: answers to older requests, or ones arriving after the screen closed, are dropped.
 * The previous data stays visible while a reload is in flight (pull-to-refresh keeps the list on screen).
 */
export const useRemote = <T>(load: (() => Promise<T>) | null, deps: unknown[]) => {
  const [state, setState] = useState<RemoteState<T>>({ data: null, error: null, loading: load !== null });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const key = JSON.stringify(deps);

  useEffect(() => {
    const fn = loadRef.current;
    if (!fn) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    // Cleared when deps change (a newer request takes over) or the screen closes.
    let wanted = true;
    setState(s => ({ ...s, loading: true, error: null }));
    fn().then(
      data => wanted && setState({ data, error: null, loading: false }),
      e => wanted && setState(s => ({ data: s.data, error: errorText(e), loading: false })),
    );
    return () => {
      wanted = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce(n => n + 1), []);
  return { ...state, reload };
};
