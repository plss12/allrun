import {
  addDays,
  type DateRange,
  type LocalDate,
  monthRange,
  rangeLength,
  weekRange,
  yearRange,
} from './dates';
import type { BucketSize } from './summary';

/** How a summary period was chosen: a calendar week, month or year, or a custom range. */
export type PeriodKind = 'week' | 'month' | 'year' | 'custom';

/** The calendar period of `kind` that contains `date`. */
export function periodContaining(kind: Exclude<PeriodKind, 'custom'>, date: LocalDate): DateRange {
  switch (kind) {
    case 'week':
      return weekRange(date);
    case 'month':
      return monthRange(date);
    case 'year':
      return yearRange(date);
  }
}

/**
 * The previous (`step` = -1) or next (`step` = 1) period of the same kind. Custom ranges move by
 * their own length, so a 10-week block steps to the previous or next 10 weeks.
 */
export function shiftPeriod(kind: PeriodKind, range: DateRange, step: -1 | 1): DateRange {
  if (kind === 'custom') {
    const days = rangeLength(range) * step;
    return { start: addDays(range.start, days), end: addDays(range.end, days) };
  }
  // Step just outside the current period and take the period containing that day.
  return periodContaining(kind, step === 1 ? addDays(range.end, 1) : addDays(range.start, -1));
}

/**
 * Bar size of the summary chart for a period: days for a week or a month, months for a year,
 * and for custom ranges days up to a month and weeks beyond (a 10-week block gets 10 bars).
 */
export function bucketForPeriod(kind: PeriodKind, range: DateRange): BucketSize {
  switch (kind) {
    case 'week':
    case 'month':
      return 'day';
    case 'year':
      return 'month';
    case 'custom':
      return rangeLength(range) <= 31 ? 'day' : 'week';
  }
}
