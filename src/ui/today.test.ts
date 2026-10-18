import { fromLocalDate, todayLocal, toLocalDate } from './today';

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
