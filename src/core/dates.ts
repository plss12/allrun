/**
 * Calendar date in the athlete's local time, formatted `YYYY-MM-DD`.
 *
 * Activities are grouped by the local date on which they started, so a run at 23:30 counts for
 * that day wherever the athlete was. All calendar math goes through "epoch days" (days since
 * 1970-01-01 in UTC), which keeps it free of time zones and daylight saving changes.
 */
export type LocalDate = string;

/** Inclusive range of local dates. */
export interface DateRange {
  readonly start: LocalDate;
  readonly end: LocalDate;
}

const MS_PER_DAY = 86_400_000;
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converts a local date to days since 1970-01-01.
 *
 * @throws RangeError if `date` is not a valid `YYYY-MM-DD` calendar date (e.g. `2026-02-30`).
 */
export function toEpochDay(date: LocalDate): number {
  const match = LOCAL_DATE_PATTERN.exec(date);
  if (match === null) {
    throw new RangeError(`Invalid local date: "${date}"`);
  }
  const [, year, month, day] = match;
  const epochDay = Date.UTC(Number(year), Number(month) - 1, Number(day)) / MS_PER_DAY;
  if (fromEpochDay(epochDay) !== date) {
    throw new RangeError(`Invalid local date: "${date}"`);
  }
  return epochDay;
}

/** Converts days since 1970-01-01 back to a local date. */
export function fromEpochDay(epochDay: number): LocalDate {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Returns `date` shifted by `days` (negative to go back). */
export function addDays(date: LocalDate, days: number): LocalDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Day of the week with Monday = 0 and Sunday = 6. */
export function dayOfWeek(date: LocalDate): number {
  // 1970-01-01 was a Thursday (3 with Monday = 0).
  return (((toEpochDay(date) + 3) % 7) + 7) % 7;
}

/** Monday-to-Sunday week that contains `date`. */
export function weekRange(date: LocalDate): DateRange {
  const start = addDays(date, -dayOfWeek(date));
  return { start, end: addDays(start, 6) };
}

/** Calendar month that contains `date`. */
export function monthRange(date: LocalDate): DateRange {
  toEpochDay(date);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const start = `${date.slice(0, 7)}-01`;
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start, end: `${date.slice(0, 7)}-${String(lastDay).padStart(2, '0')}` };
}

/** Calendar year that contains `date`. */
export function yearRange(date: LocalDate): DateRange {
  toEpochDay(date);
  const year = date.slice(0, 4);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/**
 * Builds a custom inclusive range, e.g. the 10 weeks of a half-marathon block.
 *
 * @throws RangeError if a date is invalid or `start` is after `end`.
 */
export function customRange(start: LocalDate, end: LocalDate): DateRange {
  if (toEpochDay(start) > toEpochDay(end)) {
    throw new RangeError(`Range start ${start} is after its end ${end}`);
  }
  return { start, end };
}

/** Whether `date` falls within the inclusive `range`. */
export function isInRange(date: LocalDate, range: DateRange): boolean {
  // `YYYY-MM-DD` strings sort chronologically, so plain comparison is enough.
  return date >= range.start && date <= range.end;
}

/** Number of days in the inclusive `range`. */
export function rangeLength(range: DateRange): number {
  return toEpochDay(range.end) - toEpochDay(range.start) + 1;
}
