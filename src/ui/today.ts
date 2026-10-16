import type { LocalDate } from '@/core/dates';

/** Today's date in the device time zone. */
export function todayLocal(now: Date = new Date()): LocalDate {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
