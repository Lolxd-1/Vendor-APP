import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import { EMPTY_BOARD, type Board } from '../src/domain/board';
import { useRemote } from '../src/hooks/useRemote';
import { useShopProfile } from '../src/hooks/useShopProfile';
import { useStoreStatus } from '../src/hooks/useStoreStatus';

jest.mock('../src/api/endpoints');
const api = endpoints as jest.Mocked<typeof endpoints>;

// Renders a hook inside a throwaway component and exposes its latest return value.
const renderHook = async <P, R>(hook: (p: P) => R, props: P) => {
  const result: { current: R | null } = { current: null };
  const Probe = (p: { value: P }) => {
    result.current = hook(p.value);
    return null;
  };
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<Probe value={props} />);
  });
  return {
    result: result as { current: R },
    rerender: async (next: P) => act(async () => r.update(<Probe value={next} />)),
    unmount: async () => act(async () => r.unmount()),
  };
};

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
};

beforeEach(() => jest.resetAllMocks());

describe('useRemote', () => {
  it('loads data, then reports a readable error', async () => {
    const ok = await renderHook(({ load }) => useRemote(load, []), { load: () => Promise.resolve(5) });
    expect(ok.result.current).toMatchObject({ data: 5, loading: false, error: null });

    const bad = await renderHook(({ load }) => useRemote(load, []), { load: () => Promise.reject(new ApiError('X', 500)) });
    expect(bad.result.current).toMatchObject({ data: null, loading: false, error: 'X' });
  });

  it('drops the answer of an older request that arrives last', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const h = await renderHook(({ load, k }) => useRemote(load, [k]), { load: () => first.promise, k: 1 });
    await h.rerender({ load: () => second.promise, k: 2 });
    await act(async () => second.resolve('second'));
    await act(async () => first.resolve('first'));
    expect(h.result.current.data).toBe('second');
  });

  it('ignores answers after the screen closed', async () => {
    const late = deferred<string>();
    const h = await renderHook(({ load }) => useRemote(load, []), { load: () => late.promise });
    await h.unmount();
    await act(async () => late.resolve('late'));
    expect(h.result.current.data).toBeNull();
  });
});

describe('useStoreStatus', () => {
  it('is online with no closures, and going offline sends manualOfflineOverride=true', async () => {
    api.getSchedule.mockResolvedValue({ manualOffline: false, week: {} });
    api.setManualOffline.mockResolvedValue();
    const h = await renderHook(({ id }) => useStoreStatus(id), { id: '7' });
    expect(h.result.current.status.online).toBe(true);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await h.result.current.setOnline(false);
    });
    expect(ok).toBe(true);
    expect(api.setManualOffline).toHaveBeenCalledWith('7', true);
    h.unmount();
  });

  it('reports a failed switch without pretending it worked', async () => {
    api.getSchedule.mockResolvedValue({ manualOffline: false, week: {} });
    api.setManualOffline.mockRejectedValue(new ApiError('down', 502));
    const h = await renderHook(({ id }) => useStoreStatus(id), { id: '7' });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await h.result.current.setOnline(false);
    });
    expect(ok).toBe(false);
    expect(h.result.current.error).toBe('Could not change store status. Try again.');
    expect(h.result.current.status.online).toBe(true);
    h.unmount();
  });

  it('saving timings keeps the store offline when the vendor closed it', async () => {
    api.getSchedule.mockResolvedValue({ manualOffline: true, week: {} });
    api.saveSchedule.mockResolvedValue();
    const h = await renderHook(({ id }) => useStoreStatus(id), { id: '7' });
    const week = { Mon: { openTime: '00:00', closeTime: '00:00' } };
    await act(async () => {
      await h.result.current.save(week);
    });
    expect(api.saveSchedule).toHaveBeenCalledWith('7', week, true);
    h.unmount();
  });

  it('saving timings uses the offline switch as it is now, not as it was when the screen opened', async () => {
    api.getSchedule.mockResolvedValueOnce({ manualOffline: false, week: {} }); // screen opens: online
    api.getSchedule.mockResolvedValue({ manualOffline: true, week: {} }); // meanwhile the PC closed the store
    api.saveSchedule.mockResolvedValue();
    const h = await renderHook(({ id }) => useStoreStatus(id), { id: '7' });
    const week = { Mon: { openTime: '10:00', closeTime: '11:00' } };
    await act(async () => {
      await h.result.current.save(week);
    });
    expect(api.saveSchedule).toHaveBeenCalledWith('7', week, true);
    h.unmount();
  });
});

describe('useShopProfile', () => {
  const boardWith = (shopDetails: unknown): Board => ({
    ...EMPTY_BOARD,
    orders: [{ phase: 'PENDING', localAt: null, localPrep: null, order: { orderId: 'A1', shopDetails } as never }],
  });

  it('uses the shop details already inside a live order', async () => {
    const h = await renderHook(({ b }) => useShopProfile('11', b), { b: boardWith({ name: 'Tasty' }) });
    expect(h.result.current?.name).toBe('Tasty');
    expect(api.getOrdersPage).not.toHaveBeenCalled();
  });

  it('otherwise asks history once', async () => {
    api.getOrdersPage.mockResolvedValue({ orders: [{ orderId: 'H1', shopDetails: { name: 'From history' } }], totalPages: 1 });
    const h = await renderHook(({ b }) => useShopProfile('12', b), { b: EMPTY_BOARD });
    expect(h.result.current?.name).toBe('From history');
    expect(api.getOrdersPage).toHaveBeenCalledTimes(1);
    expect(api.getOrdersPage).toHaveBeenCalledWith('12', { timeRange: 'THIS_YEAR', page: 0 });
  });
});
