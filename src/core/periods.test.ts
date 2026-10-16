import { customRange } from './dates';
import { bucketForPeriod, periodContaining, shiftPeriod } from './periods';

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
