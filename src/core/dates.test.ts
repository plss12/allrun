import {
  addDays,
  customRange,
  dayOfWeek,
  fromEpochDay,
  isInRange,
  monthRange,
  rangeLength,
  relativeDay,
  toEpochDay,
  weekRange,
  yearRange,
} from './dates';

describe('epoch days', () => {
  it('round-trips local dates', () => {
    expect(toEpochDay('1970-01-01')).toBe(0);
    expect(fromEpochDay(toEpochDay('2026-10-16'))).toBe('2026-10-16');
  });

  it('rejects malformed or impossible dates', () => {
    expect(() => toEpochDay('2026-2-1')).toThrow(RangeError);
    expect(() => toEpochDay('2026-02-30')).toThrow(RangeError);
    expect(() => toEpochDay('2025-02-29')).toThrow(RangeError);
    expect(toEpochDay('2024-02-29')).toBe(toEpochDay('2024-02-28') + 1);
  });
});

describe('addDays and dayOfWeek', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('numbers weekdays from Monday', () => {
    expect(dayOfWeek('2026-10-12')).toBe(0); // Monday
    expect(dayOfWeek('2026-10-18')).toBe(6); // Sunday
    expect(dayOfWeek('1969-12-29')).toBe(0); // before the epoch
  });
});

describe('period ranges', () => {
  it('builds the Monday-to-Sunday week, also from a Sunday', () => {
    expect(weekRange('2026-10-16')).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(weekRange('2026-10-18')).toEqual({ start: '2026-10-12', end: '2026-10-18' });
  });

  it('builds months of every length', () => {
    expect(monthRange('2026-10-16')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(monthRange('2024-02-10')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(monthRange('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('builds the calendar year', () => {
    expect(yearRange('2026-10-16')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('builds a custom range and rejects reversed ones', () => {
    expect(rangeLength(customRange('2026-08-10', '2026-10-18'))).toBe(70);
    expect(() => customRange('2026-10-18', '2026-08-10')).toThrow(RangeError);
  });

  it('checks inclusive membership', () => {
    const range = customRange('2026-10-01', '2026-10-31');
    expect(isInRange('2026-10-01', range)).toBe(true);
    expect(isInRange('2026-10-31', range)).toBe(true);
    expect(isInRange('2026-11-01', range)).toBe(false);
  });
});

describe('relativeDay', () => {
  const today = '2026-10-22'; // Thursday
  it('names today and yesterday', () => {
    expect(relativeDay('2026-10-22', today)).toBe('today');
    expect(relativeDay('2026-10-21', today)).toBe('yesterday');
  });

  it('dates the day before yesterday and earlier, and the future', () => {
    expect(relativeDay('2026-10-20', today)).toBe('date');
    expect(relativeDay('2025-10-22', today)).toBe('date');
    expect(relativeDay('2026-10-23', today)).toBe('date');
  });
});
