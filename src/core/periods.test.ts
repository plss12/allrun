import { customRange, rangeLength } from './dates';
import {
  bucketForPeriod,
  customRangeLimits,
  MAX_CUSTOM_DAYS,
  periodContaining,
  setCustomRangeDate,
  shiftPeriod,
  startCustomRange,
} from './periods';

describe('shiftPeriod', () => {
  it('steps weeks, months and years', () => {
    const week = periodContaining('week', '2026-10-16');
    expect(shiftPeriod('week', week, 1)).toEqual({ start: '2026-10-19', end: '2026-10-25' });
    expect(shiftPeriod('week', week, -1)).toEqual({ start: '2026-10-05', end: '2026-10-11' });

    const march = periodContaining('month', '2026-03-10');
    expect(shiftPeriod('month', march, -1)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    const december = periodContaining('month', '2026-12-01');
    expect(shiftPeriod('month', december, 1)).toEqual({ start: '2027-01-01', end: '2027-01-31' });

    const year = periodContaining('year', '2026-10-16');
    expect(shiftPeriod('year', year, -1)).toEqual({ start: '2025-01-01', end: '2025-12-31' });
  });

  it('moves custom ranges by their own length', () => {
    const block = customRange('2026-08-10', '2026-10-18'); // 70 days
    expect(shiftPeriod('custom', block, -1)).toEqual({ start: '2026-06-01', end: '2026-08-09' });
  });
});

describe('bucketForPeriod', () => {
  it('uses days for weeks and months and months for years', () => {
    expect(bucketForPeriod('week', periodContaining('week', '2026-10-16'))).toBe('day');
    expect(bucketForPeriod('month', periodContaining('month', '2026-10-16'))).toBe('day');
    expect(bucketForPeriod('year', periodContaining('year', '2026-10-16'))).toBe('month');
  });

  it('uses weeks for custom ranges longer than a month', () => {
    expect(bucketForPeriod('custom', customRange('2026-10-01', '2026-10-31'))).toBe('day');
    expect(bucketForPeriod('custom', customRange('2026-08-10', '2026-10-18'))).toBe('week');
  });
});

describe('custom ranges', () => {
  const today = '2026-10-18';

  it('start from the period on screen, cut at today and to a year', () => {
    expect(startCustomRange(periodContaining('month', today), today)).toEqual({
      start: '2026-10-01',
      end: today,
    });
    expect(startCustomRange(periodContaining('week', '2026-09-02'), today)).toEqual({
      start: '2026-08-31',
      end: '2026-09-06',
    });
    // 2024 has 366 days: a whole leap year fits.
    expect(startCustomRange(periodContaining('year', '2024-06-01'), today)).toEqual({
      start: '2024-01-01',
      end: '2024-12-31',
    });
    expect(startCustomRange(customRange('2024-01-01', '2026-01-01'), today)).toEqual({
      start: '2025-01-01',
      end: '2026-01-01',
    });
  });

  it('limit each end by the other, by today and by a year', () => {
    const range = customRange('2026-03-01', '2026-03-15');
    expect(customRangeLimits(range, today)).toEqual({
      start: { min: '2025-03-15', max: '2026-03-15' },
      end: { min: '2026-03-01', max: today },
    });
    const old = customRange('2024-01-01', '2024-01-31');
    expect(customRangeLimits(old, today).end.max).toBe('2024-12-31');
  });

  it('keep a moved end within its limits', () => {
    const range = customRange('2026-03-01', '2026-03-15');
    expect(setCustomRangeDate(range, 'start', '2026-02-20', today)).toEqual({
      start: '2026-02-20',
      end: '2026-03-15',
    });
    expect(setCustomRangeDate(range, 'start', '2026-04-01', today).start).toBe('2026-03-15');
    expect(setCustomRangeDate(range, 'end', '2026-12-25', today).end).toBe(today);
    expect(setCustomRangeDate(range, 'end', '2026-02-01', today).end).toBe('2026-03-01');
    expect(setCustomRangeDate(range, 'start', '2020-01-01', today).start).toBe('2025-03-15');
  });

  it('allow ranges of one day up to MAX_CUSTOM_DAYS', () => {
    const day = customRange('2026-05-05', '2026-05-05');
    expect(setCustomRangeDate(day, 'end', '2026-05-05', today)).toEqual(day);
    const year = setCustomRangeDate(day, 'end', '2027-01-01', today);
    expect(year.end).toBe(today);
    const longest = setCustomRangeDate(
      customRange('2025-10-01', today),
      'start',
      '2020-01-01',
      today,
    );
    expect(rangeLength(longest)).toBe(MAX_CUSTOM_DAYS);
  });
});
