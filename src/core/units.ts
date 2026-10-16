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

/**
 * Formats an average speed as a running pace (time per km or per mile), e.g. `4:35`.
 *
 * @param metersPerSecond - Average speed in m/s, as returned by the Strava API.
 * @param unit - Distance unit the pace refers to.
 * @returns The formatted pace, or `null` when the speed is zero or invalid
 *   (e.g. activities without distance), since no pace can be shown.
 */
export function formatPace(metersPerSecond: number, unit: DistanceUnit): string | null {
  if (!Number.isFinite(metersPerSecond) || metersPerSecond <= 0) {
    return null;
  }
  return formatDuration(METERS_PER_UNIT[unit] / metersPerSecond);
}
