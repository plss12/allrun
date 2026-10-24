import { type DateRange, type LocalDate, relativeDay } from '@/core/dates';
import type { DisplayMetric, MetricUnit } from '@/core/metrics';
import type { PeriodKind } from '@/core/periods';
import type { BucketSize, SummaryBucket } from '@/core/summary';
import type { DateFormat, PeriodFormat } from '@/core/template';
import { type DistanceUnit, metersToUnit } from '@/core/units';

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

/** What each date format of an activity shows (see `DateFormat`). */
const DATE_FORMAT_OPTIONS: Readonly<Record<DateFormat, Intl.DateTimeFormatOptions>> = {
  full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  weekday: { weekday: 'long' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  short: { day: 'numeric', month: 'short' },
  numeric: { day: '2-digit', month: '2-digit', year: 'numeric' },
  weekdayTime: { weekday: 'long', hour: 'numeric', minute: '2-digit' },
  time: { hour: 'numeric', minute: '2-digit' },
};

/**
 * Activity start for display, as `format` says: by default "Thursday, October 15, 2026"; see
 * `DateFormat` for the others. Times follow the locale's clock (24 h in Spanish).
 */
export function formatActivityDate(
  startLocal: string,
  locale: string,
  format: DateFormat = 'full',
): string {
  return capitalize(
    new Intl.DateTimeFormat(locale, { ...DATE_FORMAT_OPTIONS[format], timeZone: 'UTC' }).format(
      asUtc(startLocal),
    ),
  );
}

/**
 * The wall-clock time `seconds` after an activity's start, as its start time is written: when it
 * finished, "10:36" for an hour and five minutes after 9:31.
 */
export function formatTimeAfter(startLocal: string, seconds: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { ...DATE_FORMAT_OPTIONS.time, timeZone: 'UTC' }).format(
    new Date(asUtc(startLocal).getTime() + seconds * 1000),
  );
}

/**
 * The weekday of an activity's start, short and without the abbreviation's dot: "Wed", "Mié".
 */
export function formatShortWeekday(startLocal: string, locale: string): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
    asUtc(startLocal),
  );
  return capitalize(weekday.replace(/\.$/, ''));
}

/**
 * The short name of a day, week or month of a period, for a narrow column: a weekday ("Mié"), a
 * week's days ("6–12 oct") or a month ("Oct"), without abbreviations' dots.
 */
export function formatShortBucketName(range: DateRange, size: BucketSize, locale: string): string {
  switch (size) {
    case 'day':
      return formatShortWeekday(`${range.start}T00:00:00`, locale);
    case 'week':
      return formatDayRange(range, locale, 'short');
    case 'month':
      return capitalize(
        new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
          .format(asUtc(`${range.start}T00:00:00`))
          .replace(/\.$/, ''),
      );
  }
}

/** Short date for lists, e.g. "Oct 15". */
export function formatShortDate(date: LocalDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(asUtc(`${date}T00:00:00`));
}

/** A date with its year, as the platform writes it: "Oct 18, 2026", "18 oct 2026". */
export function formatDate(date: LocalDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    asUtc(`${date}T00:00:00`),
  );
}

/** What a month's name shows in each period format (see `PeriodFormat`). */
const MONTH_FORMATS: Readonly<Record<PeriodFormat, Intl.DateTimeFormatOptions>> = {
  full: { month: 'long', year: 'numeric' },
  noYear: { month: 'long' },
  short: { month: 'short', year: 'numeric' },
  numeric: { month: '2-digit', year: 'numeric' },
};

/**
 * Name of a summary period, as `format` says (see `PeriodFormat`). By default "October 2026"
 * for a month, "2026" for a year (in every format) and the day range for weeks and custom
 * ranges ("Oct 12 – Oct 18, 2026").
 */
export function formatPeriodName(
  kind: PeriodKind,
  range: DateRange,
  locale: string,
  format: PeriodFormat = 'full',
): string {
  switch (kind) {
    case 'year':
      return range.start.slice(0, 4);
    case 'month':
      return capitalize(
        new Intl.DateTimeFormat(locale, { ...MONTH_FORMATS[format], timeZone: 'UTC' }).format(
          asUtc(`${range.start}T00:00:00`),
        ),
      );
    case 'week':
    case 'custom':
      return formatDayRange(range, locale, format);
  }
}

/** A day of the month as a plain number, in the locale's digits. */
const dayNumber = (date: LocalDate, locale: string) =>
  new Intl.NumberFormat(locale).format(Number(date.slice(8, 10)));

/** A day and month in numbers, in the locale's order: "12/10", "10/12". */
const numericDay = (date: LocalDate, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(
    asUtc(`${date}T00:00:00`),
  );

/**
 * A range of days: in full with the year ("12 oct – 18 oct 2026"), without it ("12 oct – 18
 * oct"), short, naming the month once when it doesn't change ("12–18 oct", "Oct 12–18"), or in
 * numbers ("12/10 – 18/10"). A range across years always keeps them.
 */
function formatDayRange(range: DateRange, locale: string, format: PeriodFormat): string {
  const sameYear = range.start.slice(0, 4) === range.end.slice(0, 4);
  if (format === 'full' || !sameYear) {
    const start = sameYear ? formatShortDate(range.start, locale) : formatDate(range.start, locale);
    return `${start} – ${formatDate(range.end, locale)}`;
  }
  if (format === 'numeric') {
    return `${numericDay(range.start, locale)} – ${numericDay(range.end, locale)}`;
  }
  const start = formatShortDate(range.start, locale);
  const end = formatShortDate(range.end, locale);
  if (format === 'noYear' || range.start.slice(0, 7) !== range.end.slice(0, 7)) {
    return `${start} – ${end}`;
  }
  // Same month: the month once, where the locale puts it ("12–18 oct", "Oct 12–18").
  const dayFirst = /^\d/.test(end);
  return dayFirst
    ? `${dayNumber(range.start, locale)}–${end}`
    : `${start}–${dayNumber(range.end, locale)}`;
}

/**
 * The name of a row of a period's table (see `tableBucket`): a weekday ("Martes") when the period
 * is a `week` or shorter, otherwise its date ("12 oct"); a week by its days ("6–12 oct", "28 sept
 * – 4 oct"); a month by its name ("Octubre").
 */
export function formatBucketName(
  range: DateRange,
  size: BucketSize,
  week: boolean,
  locale: string,
): string {
  switch (size) {
    case 'day':
      return week
        ? formatActivityDate(`${range.start}T00:00:00`, locale, 'weekday')
        : formatShortDate(range.start, locale);
    case 'week':
      return formatDayRange(range, locale, 'short');
    case 'month':
      return formatPeriodName('month', range, locale, 'noYear');
  }
}

/** Above this many day bars, only the 1st and every 5th day keep their number. */
const MAX_DAY_NUMBERS = 16;
/** Above this many week bars, weeks are marked by month instead of numbered. */
const MAX_WEEK_NUMBERS = 12;

/**
 * Labels under the bars of a summary chart, one per bucket ("" for an unlabelled bar):
 * - a week of days: weekday initials ("L M X J V S D" in Spanish);
 * - longer runs of days: the day of the month, thinned to 1, 5, 10… when there are many;
 * - a few weeks (a training block): the week number within the block, from 1;
 * - many weeks (a year): the month initial on the first week of each month, the rest blank;
 * - months: the month initial ("E F M A…").
 */
export function formatBucketLabels(
  buckets: readonly SummaryBucket[],
  size: BucketSize,
  locale: string,
): string[] {
  const format = (date: LocalDate, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
      .format(asUtc(`${date}T00:00:00`))
      .toLocaleUpperCase(locale);
  switch (size) {
    case 'week':
      if (buckets.length <= MAX_WEEK_NUMBERS) {
        return buckets.map((_, i) => String(i + 1));
      }
      return buckets.map((bucket, i) => {
        const month = bucket.range.start.slice(0, 7);
        const newMonth = i === 0 || month !== buckets[i - 1].range.start.slice(0, 7);
        return newMonth ? format(bucket.range.start, { month: 'narrow' }) : '';
      });
    case 'month':
      return buckets.map((bucket) => format(bucket.range.start, { month: 'narrow' }));
    case 'day': {
      if (buckets.length <= 7) {
        return buckets.map((bucket) => format(bucket.range.start, { weekday: 'narrow' }));
      }
      return buckets.map((bucket) => {
        const day = Number(bucket.range.start.slice(8, 10));
        const shown = buckets.length <= MAX_DAY_NUMBERS || day === 1 || day % 5 === 0;
        return shown ? String(day) : '';
      });
    }
  }
}

/** What a period's chart measures: the distance of each day (week, month), or its time. */
export type ChartQuantity = 'distance' | 'time';

/**
 * A value on a period's chart, short enough for its axis and its peak: a distance in whole km or
 * miles ("61 km"), with a decimal below 10 ("4.5 km"); a time in whole hours ("3 h"), or in
 * minutes below an hour ("45 min").
 */
export function formatChartValue(
  value: number,
  quantity: ChartQuantity,
  unit: DistanceUnit,
  locale: string,
): string {
  const number = (amount: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: amount < 10 ? 1 : 0 }).format(amount);
  if (quantity === 'distance') {
    return `${number(metersToUnit(value, unit))} ${unit}`;
  }
  return value < 3600
    ? `${Math.round(value / 60)} min`
    : `${number(Math.round((value / 3600) * 10) / 10)} h`;
}

/**
 * A past day named as people do (see `relativeDay`): the translated words for today and
 * yesterday, or the short date further back ("Oct 20"), with its year when it isn't this one.
 */
export function formatRelativeDay(
  date: LocalDate,
  today: LocalDate,
  locale: string,
  words: { readonly today: string; readonly yesterday: string },
): string {
  switch (relativeDay(date, today)) {
    case 'today':
      return words.today;
    case 'yesterday':
      return words.yesterday;
    case 'date':
      return date.slice(0, 4) === today.slice(0, 4)
        ? formatShortDate(date, locale)
        : formatDate(date, locale);
  }
}
