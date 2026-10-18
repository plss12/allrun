/** Distance unit chosen by the user for display. */
export type DistanceUnit = 'km' | 'mi';

const METERS_PER_UNIT: Record<DistanceUnit, number> = {
  km: 1000,
  mi: 1609.344,
};

/**
 * Converts a distance in meters to the given display unit.
 *
 * @param meters - Distance in meters, as returned by the Strava API.
 * @param unit - Target display unit.
 * @returns The distance expressed in `unit`.
 */
export function metersToUnit(meters: number, unit: DistanceUnit): number {
  return meters / METERS_PER_UNIT[unit];
}

/**
 * Formats a duration as `h:mm:ss`, or `m:ss` when it is shorter than an hour.
 *
 * @param totalSeconds - Duration in seconds; rounded to the nearest second.
 * @returns The formatted duration.
 * @throws RangeError if `totalSeconds` is negative or not finite.
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    throw new RangeError(`Invalid duration: ${totalSeconds}`);
  }
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours === 0) {
    return `${minutes}:${ss}`;
  }
  return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
}

/** A unit of a duration written in words. */
export type DurationUnit = 'hours' | 'minutes' | 'seconds';

/** One part of a duration written in words: "40" minutes. */
export interface DurationPart {
  readonly amount: number;
  readonly unit: DurationUnit;
}

const SECONDS_IN: Readonly<Record<DurationUnit, number>> = { hours: 3600, minutes: 60, seconds: 1 };
const DURATION_UNITS: readonly DurationUnit[] = ['hours', 'minutes', 'seconds'];

/**
 * Splits a duration into hours, minutes and seconds down to `smallest`, rounded to it, for
 * writing it in words ("1h 40min 30s", or "1h 41min" down to minutes). Parts that are zero are
 * left out ("1h 30s"), unless all are: then it is zero of `smallest`. Time and space O(1).
 *
 * @throws RangeError if `totalSeconds` is negative or not finite.
 */
export function durationParts(totalSeconds: number, smallest: DurationUnit): DurationPart[] {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    throw new RangeError(`Invalid duration: ${totalSeconds}`);
  }
  const step = SECONDS_IN[smallest];
  let rest = Math.round(totalSeconds / step) * step;
  const parts: DurationPart[] = [];
  for (const unit of DURATION_UNITS.slice(0, DURATION_UNITS.indexOf(smallest) + 1)) {
    const amount = Math.floor(rest / SECONDS_IN[unit]);
    rest -= amount * SECONDS_IN[unit];
    if (amount > 0) {
      parts.push({ amount, unit });
    }
  }
  return parts.length > 0 ? parts : [{ amount: 0, unit: smallest }];
}

/**
 * Formats an average speed as a running pace (time per km or per mile), e.g. `4:35`.
 *
 * @param metersPerSecond - Average speed in m/s, as returned by the Strava API.
 * @param unit - Distance unit the pace refers to.
 * @returns The formatted pace, or `null` when the speed is zero or invalid
 *   (e.g. activities without distance), since no pace can be shown.
 */
export function formatPace(metersPerSecond: number, unit: DistanceUnit): string | null {
  return formatPaceOver(metersPerSecond, METERS_PER_UNIT[unit]);
}

/**
 * Formats an average speed as the time needed to cover `meters`, e.g. pace per 100 m swimming.
 *
 * @param metersPerSecond - Average speed in m/s.
 * @param meters - Reference distance of the pace.
 * @returns The formatted pace, or `null` when the speed is zero or invalid.
 */
export function formatPaceOver(metersPerSecond: number, meters: number): string | null {
  if (!Number.isFinite(metersPerSecond) || metersPerSecond <= 0) {
    return null;
  }
  return formatDuration(meters / metersPerSecond);
}
