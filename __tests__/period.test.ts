import {
  PRESETS,
  customPeriod,
  dayLabel,
  presetPeriod,
  queryOf,
  rangeLabel,
  settlementWeek,
  toBackendTime,
} from '../src/domain/period';

const now = new Date(2026, 9, 14, 15, 30);
const d = (day: number, month = 9, year = 2026) => new Date(year, month, day);

describe('period', () => {
  it('presets give half-open local ranges', () => {
    const r = (key: Parameters<typeof presetPeriod>[0]) => presetPeriod(key, now).range;
    expect(r('TODAY')).toEqual({ start: d(14), end: d(15) });
    expect(r('YESTERDAY')).toEqual({ start: d(13), end: d(14) });
    expect(r('LAST_7_DAYS')).toEqual({ start: d(8), end: d(15) });
    expect(r('THIS_MONTH')).toEqual({ start: d(1), end: d(1, 10) });
    expect(r('LAST_MONTH')).toEqual({ start: d(1, 8), end: d(1) });
    PRESETS.forEach((p) => expect(presetPeriod(p.key, now).label).toBe(p.label));
  });

  it('custom range covers whole days and swaps reversed picks', () => {
    const swapped = customPeriod(new Date(2026, 9, 9, 18), new Date(2026, 9, 6, 8));
    expect(swapped.key).toBe('CUSTOM');
    expect(swapped.range).toEqual({ start: d(6), end: d(10) });
    expect(swapped.label).toBe('6 Oct – 9 Oct');
    const single = customPeriod(d(6), d(6));
    expect(single.range).toEqual({ start: d(6), end: d(7) });
    expect(single.label).toBe('6 Oct');
  });

  it('backend times are local and zero padded', () => {
    expect(toBackendTime(new Date(2026, 0, 5, 7, 8, 9))).toBe('2026-01-05T07:08:09');
  });

  it('queryOf uses presets for Today and This month and CUSTOM otherwise', () => {
    expect(queryOf(presetPeriod('TODAY', now))).toEqual({ timeRange: 'TODAY' });
    expect(queryOf(presetPeriod('THIS_MONTH', now))).toEqual({ timeRange: 'THIS_MONTH' });
    expect(queryOf(presetPeriod('YESTERDAY', now))).toEqual({
      timeRange: 'CUSTOM',
      fromTime: '2026-10-13T00:00:00',
      toTime: '2026-10-13T23:59:59',
    });
  });

  it('settlement week edges', () => {
    expect(settlementWeek(new Date(2026, 9, 18, 23, 59), 0)).toEqual({ start: d(12), end: d(19) });
    expect(settlementWeek(new Date(2026, 9, 19, 0, 0), 0)).toEqual({ start: d(19), end: d(26) });
    expect(settlementWeek(d(14), -1)).toEqual({ start: d(5), end: d(12) });
  });

  it('labels', () => {
    expect(dayLabel(d(19))).toBe('Mon, 19 Oct');
    expect(rangeLabel({ start: d(12), end: d(19) })).toBe('12 Oct – 18 Oct');
    expect(rangeLabel({ start: d(6), end: d(7) })).toBe('6 Oct');
    expect(rangeLabel({ start: d(29, 11, 2025), end: d(5, 0, 2026) })).toBe('29 Dec 2025 – 4 Jan 2026');
  });
});
