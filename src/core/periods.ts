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
 * Whether `range` is the calendar week, month or year in progress on `today`, which reads as "this
 * week" rather than its dates. A custom range never is. Time and space O(1).
 */
export function isCurrentPeriod(kind: PeriodKind, range: DateRange, today: LocalDate): boolean {
  if (kind === 'custom') {
    return false;
  }
  const current = periodContaining(kind, today);
  return current.start === range.start && current.end === range.end;
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

/**
 * Longest custom range, in days: a year, leap day included. Longer ranges would chart more than
 * 52 bars and fetch years of activities from Strava at once.
 */
export const MAX_CUSTOM_DAYS = 366;

const earlier = (a: LocalDate, b: LocalDate): LocalDate => (a <= b ? a : b);
const later = (a: LocalDate, b: LocalDate): LocalDate => (a >= b ? a : b);

/**
 * The custom range a summary switches to from the period on screen: the same days, cut at
 * `today` (a month in progress ends today) and to {@link MAX_CUSTOM_DAYS} counting back from the
 * end.
 */
export function startCustomRange(range: DateRange, today: LocalDate): DateRange {
  const end = earlier(range.end, today);
  const start = later(earlier(range.start, end), addDays(end, -(MAX_CUSTOM_DAYS - 1)));
  return { start, end };
}

/** Earliest and latest date one end of a custom range can take. */
export interface DateLimits {
  readonly min: LocalDate;
  readonly max: LocalDate;
}

/**
 * Dates each end of a custom range can move to while the other stays: the start up to the end
 * and at most {@link MAX_CUSTOM_DAYS} before it; the end from the start, up to `today` and at
 * most {@link MAX_CUSTOM_DAYS} after the start.
 */
export function customRangeLimits(
  range: DateRange,
  today: LocalDate,
): { readonly start: DateLimits; readonly end: DateLimits } {
  return {
    start: { min: addDays(range.end, -(MAX_CUSTOM_DAYS - 1)), max: range.end },
    end: { min: range.start, max: earlier(today, addDays(range.start, MAX_CUSTOM_DAYS - 1)) },
  };
}

/**
 * Moves one end of a custom range to `date`, kept within {@link customRangeLimits} (the pickers
 * already stop there; this guards the range whatever they send).
 */
export function setCustomRangeDate(
  range: DateRange,
  which: 'start' | 'end',
  date: LocalDate,
  today: LocalDate,
): DateRange {
  const limits = customRangeLimits(range, today)[which];
  return { ...range, [which]: later(limits.min, earlier(date, limits.max)) };
}

/** Fewest and most bars a chart may have for a bar size to be offered. */
const MIN_BARS = 3;
const MAX_BARS = 62;

/**
 * Bar sizes worth offering for a chart of `range`: every size that gives between 3 and 62 bars,
 * so a week offers only days, a month days or weeks, and a year weeks or months. The gallery
 * offers a chart of each. Time and space O(1).
 */
export function chartBucketOptions(range: DateRange): BucketSize[] {
  return (['day', 'week', 'month'] as const).filter((size) => {
    const count = bucketCount(range, size);
    return count >= MIN_BARS && count <= MAX_BARS;
  });
}

/**
 * Number of bars of a chart of `range` in bars of `size`: its days, its 7-day blocks (the last
 * may be shorter) or the calendar months it touches, as `bucketize` splits it. Time and space
 * O(1).
 */
export function bucketCount(range: DateRange, size: BucketSize): number {
  const days = rangeLength(range);
  switch (size) {
    case 'day':
      return days;
    case 'week':
      return Math.ceil(days / 7);
    case 'month': {
      const [startYear, startMonth] = range.start.split('-').map(Number);
      const [endYear, endMonth] = range.end.split('-').map(Number);
      return (endYear - startYear) * 12 + endMonth - startMonth + 1;
    }
  }
}
