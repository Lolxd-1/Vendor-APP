import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSchedule, saveSchedule, setManualOffline } from '../api/endpoints';
import { storeStatus, type StoreSchedule, type Week } from '../domain/schedule';
import { useRemote } from './useRemote';

/**
 * Online/Offline and store timings for one shop. After a change the server copy is re-read; until it arrives the
 * change is shown locally so the switch doesn't flick back.
 */
export const useStoreStatus = (shopId: string) => {
  const remote = useRemote(() => getSchedule(shopId), [shopId]);
  const { reload } = remote;
  const [local, setLocal] = useState<Partial<StoreSchedule> | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Store timings open and close the shop on the clock, so the status is re-checked every minute.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => setLocal(null), [remote.data]);

  const schedule = useMemo(() => (remote.data ? { ...remote.data, ...local } : null), [remote.data, local]);
  const status = useMemo(() => storeStatus(schedule, now), [schedule, now]);

  const change = useCallback(
    async (call: () => Promise<void>, next: Partial<StoreSchedule>, failure: string) => {
      setBusy(true);
      setActionError(null);
      try {
        await call();
        setLocal(next);
        reload();
        return true;
      } catch {
        setActionError(failure);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const setOnline = useCallback(
    (online: boolean) =>
      change(() => setManualOffline(shopId, !online), { manualOffline: !online }, 'Could not change store status. Try again.'),
    [change, shopId],
  );

  // The offline switch is re-read just before saving: the PC may have closed the store since this screen loaded,
  // and the save sends the whole record.
  const save = useCallback(
    (week: Week) =>
      change(
        async () => saveSchedule(shopId, week, (await getSchedule(shopId)).manualOffline),
        { week },
        'Could not save store timings. Try again.',
      ),
    [change, shopId],
  );

  return { schedule, status, busy, error: actionError ?? remote.error, loading: remote.loading, setOnline, save, reload };
};

export type StoreStatusApi = ReturnType<typeof useStoreStatus>;
