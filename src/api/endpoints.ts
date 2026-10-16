import { mergeOrders } from '../domain/history';
import type { HistoryStatus, Order, TimeRange } from '../domain/order';
import { parseSchedule, type StoreSchedule, type Week } from '../domain/schedule';
import { parseStats, type TodayStats } from '../domain/stats';
import { ApiError, request } from './client';

// Contract copied from the web dashboard (src/apis/*.ts). Do not change paths or param names.
// The board poll and push registration run natively (Api.kt) so they work without JS.

export const requestOtp = async (phone: string): Promise<string> => {
  const res = await request<{ response?: { verificationId?: string } }>('POST', '/quickVerse/v1/requestOtp', {
    body: { phone },
  });
  const verificationId = res?.response?.verificationId;
  if (!verificationId) throw new ApiError('Could not send OTP. Please try again.', null);
  return verificationId;
};

export interface LoginResult {
  jwt: string;
  shopId: string;
  phone: string;
}

export const login = async (phone: string, otp: string, verificationId: string): Promise<LoginResult> => {
  const res = await request<{ jwt?: unknown; shopId?: unknown; phone?: unknown }>('POST', '/quickVerse/v1/login', {
    body: { phone, otp, verificationId },
  });
  if (typeof res?.jwt !== 'string' || res.shopId === undefined || res.shopId === null) {
    throw new ApiError('Login failed. Please try again.', null);
  }
  return { jwt: res.jwt, shopId: String(res.shopId), phone: typeof res.phone === 'string' ? res.phone : phone };
};

const orderPath = (orderId: string, action: string) =>
  `/quickVerse/v2/order/${encodeURIComponent(orderId)}/${action}`;

export const acceptOrder = (orderId: string, preparationTime: number) =>
  request<unknown>('PATCH', orderPath(orderId, 'accept'), { query: { preparationTime } });

export const rejectOrder = (orderId: string, reason: string) =>
  request<unknown>('PATCH', orderPath(orderId, 'reject'), { query: { reason } });

export const markOrderReady = (orderId: string) => request<unknown>('PATCH', orderPath(orderId, 'ready'));

export const handoverOrder = (orderId: string) => request<unknown>('PATCH', orderPath(orderId, 'handover'));

// --- Read-mostly screens (Insights, History, Store timings). Same contract as the web dashboard. ---

export const getDashboardStats = async (shopId: string): Promise<TodayStats> => {
  const stats = parseStats(await request<unknown>('GET', `/quickVerse/v2/order/${encodeURIComponent(shopId)}/dashboard-stats`));
  if (!stats) throw new ApiError("Could not load today's numbers", null);
  return stats;
};

export interface OrdersFilter {
  statuses?: HistoryStatus[];
  timeRange?: TimeRange;
  fromTime?: string;
  toTime?: string;
}

export interface OrdersPage {
  orders: Order[];
  totalPages: number;
  totalElements?: number;
}

// 50 orders per page, newest first; pages start at 0. fromTime/toTime are only sent for CUSTOM.
export const getOrdersPage = async (shopId: string, f: OrdersFilter & { page: number }): Promise<OrdersPage> => {
  const custom = f.timeRange === 'CUSTOM';
  const res = await request<{ response?: { orders?: unknown; totalPages?: unknown; totalElements?: unknown } }>(
    'GET',
    `/quickVerse/v2/order/${encodeURIComponent(shopId)}/orders`,
    {
      query: {
        orderStatus: f.statuses?.length ? f.statuses : undefined,
        timeRange: f.timeRange,
        fromTime: custom ? f.fromTime : undefined,
        toTime: custom ? f.toTime : undefined,
        page: f.page,
      },
    },
  );
  const orders = Array.isArray(res?.response?.orders)
    ? (res.response.orders as Order[]).filter(o => typeof o?.orderId === 'string')
    : [];
  const page: OrdersPage = { orders, totalPages: Number(res?.response?.totalPages) || 0 };
  const totalElements = res?.response?.totalElements;
  if (typeof totalElements === 'number' && Number.isFinite(totalElements)) page.totalElements = totalElements;
  return page;
};

// Pages are fetched one after another (production backend), never more than maxPages (web fetchAllOrderPages).
export const getAllOrders = async (
  shopId: string,
  f: OrdersFilter,
  maxPages = 20,
): Promise<{ orders: Order[]; complete: boolean }> => {
  const first = await getOrdersPage(shopId, { ...f, page: 0 });
  const total = Math.max(1, first.totalPages);
  let orders = mergeOrders([], first.orders);
  for (let page = 1; page < Math.min(total, maxPages); page++) {
    const next = await getOrdersPage(shopId, { ...f, page });
    if (next.orders.length === 0) break;
    orders = mergeOrders(orders, next.orders);
  }
  return { orders, complete: total <= maxPages };
};

const schedulePath = (shopId: string) => `/v1/vendor-schedules/shop/${encodeURIComponent(shopId)}`;

// A shop that never saved store timings has no record yet: the read answers 404 with the backend's code '404-1'
// ("No configuration ... found linked with shopId") and the manual-offline PATCH fails with a 500.
// Only that exact reply counts: any other 404 (moved route, proxy page) stays an error, so timings are never
// taken as empty and overwritten.
const isNoRecord = (e: unknown) => e instanceof ApiError && e.status === 404 && e.code === '404-1';

const readSchedule = (shopId: string) => request<unknown>('GET', schedulePath(shopId));

export const getSchedule = async (shopId: string): Promise<StoreSchedule> => {
  try {
    return parseSchedule(await readSchedule(shopId));
  } catch (e) {
    if (isNoRecord(e)) return parseSchedule(null); // no record: open, no closures
    throw e;
  }
};

// Read first, then switch: the PATCH only works on an existing record. With no record, going offline creates
// one holding just the switch (no timetable); a record that exists is never replaced, so timings are kept.
export const setManualOffline = async (shopId: string, offline: boolean): Promise<void> => {
  let exists = true;
  try {
    await readSchedule(shopId);
  } catch (e) {
    if (!isNoRecord(e)) throw e;
    exists = false;
  }
  if (exists) {
    await request<unknown>('PATCH', `${schedulePath(shopId)}/manual-offline`, { query: { manualOfflineOverride: offline } });
    return;
  }
  if (!offline) return; // no record means online already
  await request<unknown>('POST', '/v1/vendor-schedules/configure', {
    // scheduleActive true + '{}' is what the web writes for "no closures" (its delete-last-day); never send false.
    body: { shopId, manualOfflineOverride: true, scheduleActive: true, operatingHours: '{}' },
  });
};

// The web always sends manualOfflineOverride:false here, which would silently re-open a store the vendor closed;
// the current value is passed through instead.
export const saveSchedule = async (shopId: string, week: Week, manualOffline: boolean): Promise<void> => {
  await request<unknown>('POST', '/v1/vendor-schedules/configure', {
    body: { shopId, manualOfflineOverride: manualOffline, scheduleActive: true, operatingHours: JSON.stringify(week) },
  });
};
