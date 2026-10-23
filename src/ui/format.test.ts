import { customRange, monthRange, weekRange, yearRange } from '@/core/dates';
import { bucketize } from '@/core/summary';

import {
  formatActivityDate,
  formatTimeAfter,
  formatBucketLabels,
  formatChartValue,
  formatMetric,
  formatPeriodName,
  formatRelativeDay,
  formatShortWeekday,
} from './format';

describe('formatMetric', () => {
  const distance = { kind: 'number', amount: 21.0975, fractionDigits: 2, unit: 'km' } as const;

  it('uses the locale decimal separator and fixed decimals', () => {
    expect(formatMetric(distance, 'es')).toEqual({ value: '21,10', unit: 'km' });
    expect(formatMetric(distance, 'en')).toEqual({ value: '21.10', unit: 'km' });
  });

  it('passes times through', () => {
    expect(formatMetric({ kind: 'time', text: '4:35', unit: 'min/km' }, 'es')).toEqual({
      value: '4:35',
      unit: 'min/km',
    });
  });
});

describe('formatTimeAfter', () => {
  it('writes when an activity ended, by the clock of the locale', () => {
    // 1h 5min 22s after 9:31.
    expect(formatTimeAfter('2026-10-15T09:31:00', 3922, 'es')).toBe('10:36');
    expect(formatTimeAfter('2026-10-15T09:31:00', 3922, 'en')).toBe('10:36 AM');
  });

  it('goes past midnight without the device time zone moving it', () => {
    expect(formatTimeAfter('2026-10-15T23:30:00', 3600, 'es')).toBe('0:30');
  });
});

describe('formatActivityDate', () => {
  it('formats the local start date without shifting the day', () => {
    // 23:30 local must stay on the 15th whatever the device time zone.
    expect(formatActivityDate('2026-10-15T23:30:00', 'en')).toBe('Thursday, October 15, 2026');
    expect(formatActivityDate('2026-10-15T23:30:00', 'es')).toBe('Jueves, 15 de octubre de 2026');
  });

  it('writes the date in each format, with the locale clock for times', () => {
    const start = '2026-10-14T07:05:00';
    const es = (format: Parameters<typeof formatActivityDate>[2]) =>
      formatActivityDate(start, 'es', format);
    expect(es('full')).toBe('Miércoles, 14 de octubre de 2026');
    expect(es('weekday')).toBe('Miércoles');
    expect(es('long')).toBe('14 de octubre de 2026');
    expect(es('short')).toBe('14 oct');
    expect(es('numeric')).toBe('14/10/2026');
    expect(es('weekdayTime')).toBe('Miércoles, 7:05');
    expect(es('time')).toBe('7:05');
    expect(formatActivityDate(start, 'en', 'numeric')).toBe('10/14/2026');
    expect(formatActivityDate(start, 'en', 'time')).toMatch(/^7:05\sAM$/);
  });
});

describe('formatShortWeekday', () => {
  it('writes the short weekday of the local start, without a dot', () => {
    expect(formatShortWeekday('2026-10-14T23:30:00', 'en')).toBe('Wed');
    expect(formatShortWeekday('2026-10-14T23:30:00', 'es')).toBe('Mié');
    expect(formatShortWeekday('2026-10-18T07:00:00', 'es')).toBe('Dom');
  });
});

describe('formatPeriodName', () => {
  it('names months and years', () => {
    expect(formatPeriodName('month', monthRange('2026-10-16'), 'en')).toBe('October 2026');
    expect(formatPeriodName('month', monthRange('2026-10-16'), 'es')).toBe('Octubre de 2026');
    expect(formatPeriodName('year', yearRange('2026-10-16'), 'es')).toBe('2026');
  });

  it('names weeks and custom ranges by their days', () => {
    expect(formatPeriodName('week', weekRange('2026-10-16'), 'en')).toBe('Oct 12 – Oct 18, 2026');
    expect(formatPeriodName('custom', customRange('2025-12-29', '2026-01-04'), 'en')).toBe(
      'Dec 29, 2025 – Jan 4, 2026',
    );
  });

  it('writes a week in each format, naming the month once where the locale puts it', () => {
    const week = weekRange('2026-10-16');
    const es = (format: Parameters<typeof formatPeriodName>[3]) =>
      formatPeriodName('week', week, 'es', format);
    expect(es('full')).toBe('12 oct – 18 oct 2026');
    expect(es('noYear')).toBe('12 oct – 18 oct');
    expect(es('short')).toBe('12–18 oct');
    expect(es('numeric')).toBe('12/10 – 18/10');
    expect(formatPeriodName('week', week, 'en', 'short')).toBe('Oct 12–18');
    expect(formatPeriodName('week', week, 'en', 'numeric')).toBe('10/12 – 10/18');
  });

  it('keeps both months of a week across two, and the years of a range across two', () => {
    expect(formatPeriodName('week', weekRange('2026-10-01'), 'es', 'short')).toBe(
      '28 sept – 4 oct',
    );
    expect(
      formatPeriodName('custom', customRange('2025-12-29', '2026-01-04'), 'en', 'numeric'),
    ).toBe('Dec 29, 2025 – Jan 4, 2026');
  });

  it('writes a month in each format, and a year always alike', () => {
    const month = monthRange('2026-10-16');
    expect(formatPeriodName('month', month, 'es', 'noYear')).toBe('Octubre');
    expect(formatPeriodName('month', month, 'es', 'short')).toBe('Oct 2026');
    expect(formatPeriodName('month', month, 'es', 'numeric')).toBe('10/2026');
    expect(formatPeriodName('year', yearRange('2026-10-16'), 'es', 'numeric')).toBe('2026');
  });
});

describe('formatBucketLabels', () => {
  const days = (start: string, end: string) => bucketize([], customRange(start, end), 'day');

  it('uses weekday initials for a week', () => {
    const week = days('2026-10-12', '2026-10-18'); // Monday to Sunday
    expect(formatBucketLabels(week, 'day', 'es')).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
    expect(formatBucketLabels(week, 'day', 'en')).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });

  it('numbers the days of a month, thinned to 1, 5, 10…', () => {
    const labels = formatBucketLabels(days('2026-10-01', '2026-10-31'), 'day', 'es');
    expect(labels).toHaveLength(31);
    expect(labels.filter((label) => label !== '')).toEqual([
      '1',
      '5',
      '10',
      '15',
      '20',
      '25',
      '30',
    ]);
  });

  it('numbers every day of a short custom range', () => {
    expect(formatBucketLabels(days('2026-10-03', '2026-10-12'), 'day', 'es')).toEqual([
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
    ]);
  });

  it('uses month initials for a year and week numbers for a training block', () => {
    const year = bucketize([], customRange('2026-01-01', '2026-12-31'), 'month');
    expect(formatBucketLabels(year, 'month', 'es').join('')).toBe('EFMAMJJASOND');
    const block = bucketize([], customRange('2026-08-10', '2026-10-18'), 'week');
    expect(formatBucketLabels(block, 'week', 'es')).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i + 1)),
    );
  });

  it('marks a year of weeks with the initial of each month, on its first week', () => {
    const year = bucketize([], customRange('2026-01-01', '2026-12-31'), 'week');
    const labels = formatBucketLabels(year, 'week', 'es');
    expect(labels).toHaveLength(53);
    expect(labels.filter((label) => label !== '').join('')).toBe('EFMAMJJASOND');
    // Weeks run from Thursday 1 January: the one from 29 January is still January's,
    // the one from 5 February is February's first.
    expect(labels[4]).toBe('');
    expect(labels[5]).toBe('F');
  });
});

describe('formatChartValue', () => {
  it('writes distances in whole units, with a decimal for small ones', () => {
    expect(formatChartValue(61_400, 'distance', 'km', 'en')).toBe('61 km');
    expect(formatChartValue(4_520, 'distance', 'km', 'es')).toBe('4,5 km');
    expect(formatChartValue(16_093.44, 'distance', 'mi', 'en')).toBe('10 mi');
    expect(formatChartValue(0, 'distance', 'km', 'en')).toBe('0 km');
  });

  it('writes times in hours, or in minutes below an hour', () => {
    expect(formatChartValue(13_860, 'time', 'km', 'en')).toBe('3.9 h');
    expect(formatChartValue(43_200, 'time', 'km', 'en')).toBe('12 h');
    expect(formatChartValue(2_700, 'time', 'km', 'en')).toBe('45 min');
  });
});

describe('formatRelativeDay', () => {
  const words = { today: 'Hoy', yesterday: 'Ayer' };
  it('names today and yesterday, and dates older days', () => {
    expect(formatRelativeDay('2026-10-22', '2026-10-22', 'es', words)).toBe('Hoy');
    expect(formatRelativeDay('2026-10-21', '2026-10-22', 'es', words)).toBe('Ayer');
    expect(formatRelativeDay('2026-10-20', '2026-10-22', 'en', words)).toBe('Oct 20');
    expect(formatRelativeDay('2026-10-01', '2026-10-22', 'en', words)).toBe('Oct 1');
  });

  it('adds the year to days of another year', () => {
    expect(formatRelativeDay('2025-12-30', '2026-01-02', 'en', words)).toBe('Dec 30, 2025');
  });
});
