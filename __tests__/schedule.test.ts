import {
  hhmmLabel,
  isClosedBySchedule,
  parseSchedule,
  shiftHHMM,
  slotLabel,
  storeStatus,
} from '../src/domain/schedule';

// 6 Oct 2026 is a Tuesday.
const tue = (h: number, m: number) => new Date(2026, 9, 6, h, m);
const wed = (h: number, m: number) => new Date(2026, 9, 7, h, m);

describe('isClosedBySchedule (same rule as the web dashboard)', () => {
  it('no entry for today means open', () => {
    expect(isClosedBySchedule({}, tue(12, 0))).toBe(false);
  });
  it('00:00–00:00 means closed all day', () => {
    expect(isClosedBySchedule({ Tue: { openTime: '00:00', closeTime: '00:00' } }, tue(9, 0))).toBe(true);
  });
  it('a window is a closure, ends included', () => {
    const week = { Tue: { openTime: '14:00', closeTime: '16:00' } };
    expect(isClosedBySchedule(week, tue(15, 0))).toBe(true);
    expect(isClosedBySchedule(week, tue(16, 0))).toBe(true);
    expect(isClosedBySchedule(week, tue(16, 1))).toBe(false);
  });
  it('a window can run past midnight on the same day entry', () => {
    const week = { Tue: { openTime: '22:00', closeTime: '02:00' } };
    expect(isClosedBySchedule(week, tue(23, 0))).toBe(true);
    expect(isClosedBySchedule(week, wed(1, 0))).toBe(false);
  });
});

describe('storeStatus', () => {
  it('unknown counts as online, like the web', () => {
    expect(storeStatus(null, tue(12, 0))).toEqual({ online: true, reason: null });
  });
  it('manual offline wins', () => {
    expect(storeStatus({ manualOffline: true, week: {} }, tue(12, 0))).toEqual({ online: false, reason: 'manual' });
  });
  it('store timings can close the store', () => {
    expect(
      storeStatus({ manualOffline: false, week: { Tue: { openTime: '00:00', closeTime: '00:00' } } }, tue(12, 0)),
    ).toEqual({ online: false, reason: 'schedule' });
  });
});

describe('parseSchedule', () => {
  it('reads the backend reply', () => {
    expect(
      parseSchedule({ manualOfflineOverride: true, operatingHoursJson: '{"Mon":{"openTime":"10:00","closeTime":"11:00"}}' }),
    ).toEqual({ manualOffline: true, week: { Mon: { openTime: '10:00', closeTime: '11:00' } } });
  });
  it('survives bad data', () => {
    expect(parseSchedule({ operatingHoursJson: 'not json' })).toEqual({ manualOffline: false, week: {} });
    expect(parseSchedule(null)).toEqual({ manualOffline: false, week: {} });
    expect(parseSchedule({ operatingHoursJson: '{"Mon":{"openTime":"9am","closeTime":1}}' }).week).toEqual({});
  });
});

describe('labels and time steps', () => {
  it('describes a day', () => {
    expect(slotLabel(undefined)).toBe('Open all day');
    expect(slotLabel({ openTime: '00:00', closeTime: '00:00' })).toBe('Closed all day');
    expect(slotLabel({ openTime: '14:00', closeTime: '16:00' })).toBe('Closed 2:00 pm – 4:00 pm');
    expect(hhmmLabel('00:30')).toBe('12:30 am');
  });
  it('steps times around midnight', () => {
    expect(shiftHHMM('23:30', 30)).toBe('00:00');
    expect(shiftHHMM('00:00', -30)).toBe('23:30');
    expect(shiftHHMM('14:00', 30)).toBe('14:30');
  });
});
