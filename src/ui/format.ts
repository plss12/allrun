import type { DateRange, LocalDate } from '@/core/dates';
import type { DisplayMetric, MetricUnit } from '@/core/metrics';
import type { PeriodKind } from '@/core/periods';

/** A metric as text: the value and its unit label. */
export interface FormattedMetric {
  readonly value: string;
  readonly unit: MetricUnit | null;
}

/** Formats a display metric for `locale`, e.g. `21,10` in Spanish and `21.10` in English. */
export function formatMetric(metric: DisplayMetric, locale: string): FormattedMetric {
  if (metric.kind === 'time') {
    return { value: metric.text, unit: metric.unit };
  }
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: metric.fractionDigits,
    maximumFractionDigits: metric.fractionDigits,
  }).format(metric.amount);
  return { value, unit: metric.unit };
}

/**
 * Local dates and wall-clock times are formatted as if they were UTC, so the device time zone
 * never shifts them to another day.
 */
const asUtc = (localDateTime: string) => new Date(`${localDateTime}Z`);

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** Activity start for display, e.g. "Thursday, October 15, 2026". */
export function formatActivityDate(startLocal: string, locale: string): string {
  return capitalize(
    new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(asUtc(startLocal)),
  );
}

/** Short date for lists, e.g. "Oct 15". */
export function formatShortDate(date: LocalDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(asUtc(`${date}T00:00:00`));
}

/**
 * Name of a summary period: "October 2026" for a month, "2026" for a year, and the day range for
 * weeks and custom ranges ("Oct 12 – Oct 18, 2026").
 */
export function formatPeriodName(kind: PeriodKind, range: DateRange, locale: string): string {
  switch (kind) {
    case 'year':
      return range.start.slice(0, 4);
    case 'month':
      return capitalize(
        new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
          asUtc(`${range.start}T00:00:00`),
        ),
      );
    case 'week':
    case 'custom': {
      const sameYear = range.start.slice(0, 4) === range.end.slice(0, 4);
      const start = sameYear
        ? formatShortDate(range.start, locale)
        : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
            asUtc(`${range.start}T00:00:00`),
          );
      const end = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
        asUtc(`${range.end}T00:00:00`),
      );
      return `${start} – ${end}`;
    }
  }
}
