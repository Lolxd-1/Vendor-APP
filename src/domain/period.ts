import type { TimeRange } from './order';

export interface Range {
  start: Date;
  end: Date;
}
export type PresetKey = 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'LAST_MONTH';

export const PRESETS: readonly { key: PresetKey; label: string }[] = [
  { key: 'TODAY', label: 'Today' },
  { key: 'YESTERDAY', label: 'Yesterday' },
  { key: 'LAST_7_DAYS', label: 'Last 7 days' },
  { key: 'THIS_MONTH', label: 'This month' },
  { key: 'LAST_MONTH', label: 'Last month' },
];

export interface Period {
  key: PresetKey | 'CUSTOM';
  label: string;
  range: Range;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Calendar-day arithmetic keeps midnight exact across DST changes.
export const addDays = (d: Date, days: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

const dayMonth = (d: Date): string => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

export const dayLabel = (d: Date): string => `${WEEKDAYS[d.getDay()]}, ${dayMonth(d)}`;

export const rangeLabel = (r: Range): string => {
  const first = startOfDay(r.start);
  const last = startOfDay(new Date(r.end.getTime() - 1));
  if (first.getTime() === last.getTime()) return dayMonth(first);
  if (first.getFullYear() === last.getFullYear()) return `${dayMonth(first)} – ${dayMonth(last)}`;
  return `${dayMonth(first)} ${first.getFullYear()} – ${dayMonth(last)} ${last.getFullYear()}`;
};

export const presetPeriod = (key: PresetKey, now: Date): Period => {
  const t = startOfDay(now);
  const y = now.getFullYear();
  const m = now.getMonth();
  const ranges: Record<PresetKey, Range> = {
    TODAY: { start: t, end: addDays(t, 1) },
    YESTERDAY: { start: addDays(t, -1), end: t },
    LAST_7_DAYS: { start: addDays(t, -6), end: addDays(t, 1) },
    THIS_MONTH: { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) },
    LAST_MONTH: { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) },
  };
  const label = PRESETS.find((p) => p.key === key)?.label ?? key;
  return { key, label, range: ranges[key] };
};

export const customPeriod = (a: Date, b: Date): Period => {
  const da = startOfDay(a);
  const db = startOfDay(b);
  const [lo, hi] = da.getTime() <= db.getTime() ? [da, db] : [db, da];
  const range = { start: lo, end: addDays(hi, 1) };
  return { key: 'CUSTOM', label: rangeLabel(range), range };
};

export const settlementWeek = (now: Date, offset: number): Range => {
  const t = startOfDay(now);
  const sinceMonday = (t.getDay() + 6) % 7;
  const start = addDays(t, -sinceMonday + offset * 7);
  return { start, end: addDays(start, 7) };
};

export const toBackendTime = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export interface OrdersQuery {
  timeRange: TimeRange;
  fromTime?: string;
  toTime?: string;
}

export const rangeQuery = (r: Range): OrdersQuery => ({
  timeRange: 'CUSTOM',
  fromTime: toBackendTime(r.start),
  toTime: toBackendTime(new Date(r.end.getTime() - 1000)),
});

export const queryOf = (p: Period): OrdersQuery => {
  if (p.key === 'TODAY') return { timeRange: 'TODAY' };
  if (p.key === 'THIS_MONTH') return { timeRange: 'THIS_MONTH' };
  return rangeQuery(p.range);
};
