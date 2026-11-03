import { dayOfMoment, fromLocalDate, todayLocal, toLocalDate, toLocalTimestamp } from './today';

describe('local dates and Date', () => {
  it('reads the calendar day in the device time zone', () => {
    expect(toLocalDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayLocal(new Date(2026, 9, 18, 0, 0))).toBe('2026-10-18');
  });

  it('round-trips through midnight of the day', () => {
    for (const date of ['2026-01-01', '2024-02-29', '2026-03-29', '2026-10-25', '2026-12-31']) {
      const midnight = fromLocalDate(date);
      expect(midnight.getHours()).toBe(0);
      expect(toLocalDate(midnight)).toBe(date);
    }
  });
});

describe('toLocalTimestamp', () => {
  it('writes the moment in the device time zone, padded', () => {
    expect(toLocalTimestamp(new Date(2026, 0, 5, 7, 3, 9))).toBe('20260105-070309');
    expect(toLocalTimestamp(new Date(2026, 9, 18, 15, 30, 12))).toBe('20261018-153012');
  });
});

describe('dayOfMoment', () => {
  it('names the local day of a moment in milliseconds, as the photo library gives it', () => {
    expect(dayOfMoment(new Date(2026, 10, 3, 12).getTime())).toBe('2026-11-03');
  });

  // A photo's date only labels it for screen readers: a wrong one must not break the grid.
  it('gives nothing for a moment that is not a day we can write', () => {
    expect(dayOfMoment(new Date(2026, 10, 3, 12).getTime() * 1000)).toBeNull();
    expect(dayOfMoment(Number.NaN)).toBeNull();
    expect(dayOfMoment(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
