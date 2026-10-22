/**
 * An athlete's heart rate zones, as Strava keeps them (`GET /athlete/zones`): usually five, from
 * an easy Z1 to an all-out Z5. The charts color a heart rate line by zone and count the time
 * spent in each.
 */

/** One zone: from `min` beats per minute (included) up to the next zone's `min`. */
export interface HeartRateZone {
  readonly min: number;
  /** The top of the zone, as the source gives it; `null` for the last one, which has none. */
  readonly max: number | null;
}

/** The zones, lowest first. */
export type HeartRateZones = readonly HeartRateZone[];

/**
 * Index of the zone `bpm` falls in: the highest zone whose `min` it reaches, or the first for a
 * heart rate under every zone. Time O(z) for z zones.
 */
export function zoneIndex(bpm: number, zones: HeartRateZones): number {
  let index = 0;
  zones.forEach((zone, i) => {
    if (bpm >= zone.min) {
      index = i;
    }
  });
  return index;
}

/**
 * Seconds spent in each zone: each sample counts the time since the one before it, in the zone of
 * its heart rate; samples a sensor missed (`NaN`) count in none. Time O(n · z) for n samples and z
 * zones, space O(z).
 *
 * @throws RangeError when `time` and `heartRate` differ in length.
 */
export function timeInZones(
  time: readonly number[],
  heartRate: readonly number[],
  zones: HeartRateZones,
): number[] {
  if (time.length !== heartRate.length) {
    throw new RangeError(
      `Expected as many heart rates as times, got ${heartRate.length} and ${time.length}`,
    );
  }
  const seconds = zones.map(() => 0);
  for (let i = 1; i < time.length; i++) {
    const bpm = heartRate[i];
    const elapsed = time[i] - time[i - 1];
    if (Number.isFinite(bpm) && elapsed > 0) {
      seconds[zoneIndex(bpm, zones)] += elapsed;
    }
  }
  return seconds;
}

/**
 * The beats per minute a zone spans, as the charts write them: "<112" for the first, "112–130"
 * for one in between (up to the next zone's start, excluded), "168+" for the last.
 */
export function zoneRange(index: number, zones: HeartRateZones): string {
  const zone = zones[index];
  const next = zones[index + 1];
  if (index === 0 && next !== undefined) {
    return `<${next.min}`;
  }
  return next === undefined ? `${zone.min}+` : `${zone.min}–${next.min - 1}`;
}
