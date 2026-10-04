// Port of the web's useOrderTimer parsing: digits-only = epoch ms; otherwise ISO, where the
// backend's "yyyy-MM-dd HH:mm:ss" form is accepted by turning the first space into "T".
export const parseServerTime = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const s = value.trim();
  if (/^\d+$/.test(s)) return Number(s);
  const t = Date.parse(s.replace(' ', 'T'));
  return Number.isNaN(t) ? null : t;
};

/** mm:ss, or h:mm:ss from one hour. Negative clamps to 00:00. */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

export const elapsedLabel = (since: unknown, now: number): string => {
  const t = parseServerTime(since);
  return t === null ? '--:--' : formatDuration(now - t);
};

/** Prep time left: from this phone's accept time, else the server's acceptedDate. */
export const prepRemainingMs = (
  acceptedAt: number | null,
  prepMinutes: number | undefined | null,
  now: number,
): number | null => {
  if (acceptedAt === null || !prepMinutes || prepMinutes <= 0) return null;
  return acceptedAt + prepMinutes * 60_000 - now;
};
