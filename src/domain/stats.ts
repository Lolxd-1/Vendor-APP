// GET /quickVerse/v2/order/{shopId}/dashboard-stats — field names as the web reads them (useDashboardStats.ts).
export interface TodayStats {
  orders: number;
  revenue: number;
  avgAcceptSec: number;
  avgPrepSec: number;
  completionRate: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export const parseStats = (payload: unknown): TodayStats | null => {
  const r = (payload as { response?: unknown } | null)?.response;
  if (typeof r !== 'object' || r === null) return null;
  const d = r as Record<string, unknown>;
  return {
    orders: num(d.totalOrdersToday),
    revenue: num(d.revenueToday),
    avgAcceptSec: num(d.avgAcceptanceTimeSec),
    avgPrepSec: num(d.avgPreparationTimeSec),
    completionRate: num(d.completionRate),
  };
};
