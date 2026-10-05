import type { IconName } from '../ui/Icon';
import type { Tone } from '../ui/theme';
import { parseServerTime } from './time';

// Display rules shared by every screen. All of them accept anything the server might send and never throw.

const groupIndian = (int: string): string => {
  if (int.length <= 3) return int;
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
};

/** 245 -> '₹245', 245.5 -> '₹245.50', 123456.75 -> '₹1,23,456.75'. Not a number -> '--'. */
export const money = (n: unknown): string => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '--';
  const sign = n < 0 ? '-' : '';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `${sign}₹${groupIndian(int)}${dec === '00' ? '' : `.${dec}`}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const clockOf = (d: Date): string => {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
};

/** Server time -> '7:42 pm'. */
export const clockTime = (t: unknown): string => {
  const ms = parseServerTime(t);
  return ms === null ? '--' : clockOf(new Date(ms));
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** 'Today, 7:42 pm' | 'Yesterday, 7:42 pm' | '3 Oct, 7:42 pm'. */
export const dayTime = (t: unknown, now: number): string => {
  const ms = parseServerTime(t);
  if (ms === null) return '--';
  const d = new Date(ms);
  const today = new Date(now);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const day = sameDay(d, today) ? 'Today' : sameDay(d, yesterday) ? 'Yesterday' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${day}, ${clockOf(d)}`;
};

/** Seconds -> '45 sec' | '3 min' | '1 h 5 min'. Zero or not a number -> '--'. */
export const minutesLabel = (sec: unknown): string => {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) return '--';
  if (sec < 60) return `${Math.round(sec)} sec`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
};

export const paymentLabel = (method: unknown): string => {
  if (typeof method !== 'string' || !method.trim()) return 'Payment not shown';
  return /cod|cash/i.test(method) ? 'Cash on delivery' : 'Paid online';
};

const words = (s: string): string => {
  const lower = s.trim().replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

export const riderStatusLabel = (status: string | undefined): string => {
  if (!status) return 'Finding a rider';
  if (status.toUpperCase() === 'ARRIVED_AT_STORE') return 'Rider at your shop';
  return words(status);
};

const STATUS_INFO: Record<string, { label: string; tone: Tone; icon: IconName }> = {
  COMPLETED: { label: 'Delivered', tone: 'green', icon: 'circle-check' },
  IN_TRANSIT: { label: 'On the way', tone: 'blue', icon: 'bike' },
  REJECTED: { label: 'Rejected', tone: 'red', icon: 'ban' },
  CANCELLED: { label: 'Cancelled', tone: 'red', icon: 'circle-x' },
  PENDING: { label: 'New', tone: 'blue', icon: 'bell' },
  ACCEPTED: { label: 'Preparing', tone: 'amber', icon: 'chef-hat' },
  READY_FOR_PICKUP: { label: 'Ready', tone: 'green', icon: 'package-check' },
};

export const historyStatusInfo = (state: unknown): { label: string; tone: Tone; icon: IconName } => {
  const key = typeof state === 'string' ? state.trim().toUpperCase() : '';
  return STATUS_INFO[key] ?? { label: key ? words(key) : 'Unknown', tone: 'neutral', icon: 'info' };
};

/** '2 × Veg Biryani, 1 × Coke'. */
export const itemsSummary = (items: unknown): string => {
  if (!Array.isArray(items) || items.length === 0) return 'No items';
  return items
    .filter((it): it is { name?: unknown; itemCount?: unknown } => typeof it === 'object' && it !== null)
    .map(it => `${typeof it.itemCount === 'number' ? it.itemCount : 1} × ${typeof it.name === 'string' ? it.name : 'Item'}`)
    .join(', ');
};

/** 'Tasty Bites' -> 'TB'; nothing usable -> 'QV'. */
export const initials = (name: unknown): string => {
  if (typeof name !== 'string') return 'QV';
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w.charAt(0).toUpperCase())
    .join('');
  return letters || 'QV';
};
