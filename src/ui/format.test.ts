import { customRange, monthRange, weekRange, yearRange } from '@/core/dates';
import { bucketize } from '@/core/summary';

import { formatActivityDate, formatBucketLabels, formatMetric, formatPeriodName } from './format';

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

describe('formatActivityDate', () => {
  it('formats the local start date without shifting the day', () => {
    // 23:30 local must stay on the 15th whatever the device time zone.
    expect(formatActivityDate('2026-10-15T23:30:00', 'en')).toBe('Thursday, October 15, 2026');
    expect(formatActivityDate('2026-10-15T23:30:00', 'es')).toBe('Jueves, 15 de octubre de 2026');
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
});
