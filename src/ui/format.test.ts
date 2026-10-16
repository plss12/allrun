import { customRange, monthRange, weekRange, yearRange } from '@/core/dates';

import { formatActivityDate, formatMetric, formatPeriodName } from './format';

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
