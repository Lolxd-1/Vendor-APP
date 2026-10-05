// Store timings, with the web dashboard's meaning (src/utils/scheduleUtils.ts): each day's entry is a CLOSURE
// window, despite the backend names openTime/closeTime. No entry = open all day; 00:00–00:00 = closed all day.

export type DayKey = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export const DAYS: readonly DayKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BY_JS_DAY: readonly DayKey[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ClosedSlot {
  openTime: string;
  closeTime: string;
}
export type Week = Partial<Record<DayKey, ClosedSlot>>;

export interface StoreSchedule {
  manualOffline: boolean;
  week: Week;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const parseWeek = (json: unknown): Week => {
  let raw: unknown = json;
  if (typeof json === 'string') {
    try {
      raw = JSON.parse(json);
    } catch {
      return {};
    }
  }
  if (typeof raw !== 'object' || raw === null) return {};
  const week: Week = {};
  for (const day of DAYS) {
    const slot = (raw as Record<string, { openTime?: unknown; closeTime?: unknown } | undefined>)[day];
    if (slot && typeof slot.openTime === 'string' && typeof slot.closeTime === 'string' && HHMM.test(slot.openTime) && HHMM.test(slot.closeTime)) {
      week[day] = { openTime: slot.openTime, closeTime: slot.closeTime };
    }
  }
  return week;
};

/** GET /v1/vendor-schedules/shop/{id} reply -> schedule. Anything unreadable means "no closures, not offline". */
export const parseSchedule = (payload: unknown): StoreSchedule => {
  const p = (payload ?? {}) as { manualOfflineOverride?: unknown; operatingHoursJson?: unknown };
  return { manualOffline: p.manualOfflineOverride === true, week: parseWeek(p.operatingHoursJson) };
};

const hhmmOf = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Exact port of the web's checkIsCurrentlyOfflineBySchedule (inclusive ends; start > end wraps past midnight). */
export const isClosedBySchedule = (week: Week, now: Date): boolean => {
  const today = week[BY_JS_DAY[now.getDay()]];
  if (!today) return false;
  if (today.openTime === '00:00' && today.closeTime === '00:00') return true;
  const t = hhmmOf(now);
  const start = today.openTime;
  const end = today.closeTime;
  return start <= end ? t >= start && t <= end : t >= start || t <= end;
};

export type StoreStatus = { online: boolean; reason: 'manual' | 'schedule' | null };

/** Same rule as the web header badge; while unknown (loading) the store counts as online, like the web. */
export const storeStatus = (s: StoreSchedule | null, now: Date): StoreStatus => {
  if (!s) return { online: true, reason: null };
  if (s.manualOffline) return { online: false, reason: 'manual' };
  if (isClosedBySchedule(s.week, now)) return { online: false, reason: 'schedule' };
  return { online: true, reason: null };
};

const NAMES: Record<DayKey, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};
export const dayName = (d: DayKey): string => NAMES[d];
export const todayKey = (now: Date): DayKey => BY_JS_DAY[now.getDay()];

/** '14:00' -> '2:00 pm', '00:30' -> '12:30 am'. */
export const hhmmLabel = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export const isAllDay = (slot: ClosedSlot) => slot.openTime === '00:00' && slot.closeTime === '00:00';

export const slotLabel = (slot: ClosedSlot | undefined): string => {
  if (!slot) return 'Open all day';
  if (isAllDay(slot)) return 'Closed all day';
  return `Closed ${hhmmLabel(slot.openTime)} – ${hhmmLabel(slot.closeTime)}`;
};

/** Moves an 'HH:mm' time by whole minutes, wrapping around midnight. */
export const shiftHHMM = (hhmm: string, minutes: number): string => {
  const [h, m] = hhmm.split(':').map(Number);
  const total = ((((h * 60 + m + minutes) % 1440) + 1440) % 1440) || 0;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
