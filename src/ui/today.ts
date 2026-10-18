import type { LocalDate } from '@/core/dates';

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * The calendar day of a `Date` in the device time zone. Only for the edges with the platform
 * (the clock, the native date picker): the app itself works with `LocalDate`.
 */
export function toLocalDate(date: Date): LocalDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Midnight of a local date in the device time zone, as the native date picker reads it. */
export function fromLocalDate(date: LocalDate): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Today's date in the device time zone. */
export function todayLocal(now: Date = new Date()): LocalDate {
  return toLocalDate(now);
}

/** A moment in the device time zone as `YYYYMMDD-HHMMSS`, for file names. */
export function toLocalTimestamp(date: Date): string {
  const day = toLocalDate(date).replaceAll('-', '');
  return `${day}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
