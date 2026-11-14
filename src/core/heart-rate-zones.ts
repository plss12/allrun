/**
 * Zones of a measure (a heart rate, a pace, a power), as Strava writes an activity's time in
 * them (`GET /activities/{id}/zones`): each from its lowest to its highest value, lowest zone
 * first. A heart rate's are whole beats a minute that don't overlap ("0–143", "144–162", …, the
 * last "185+"); a pace's or a power's share their edges (2.558–3.049 m/s, then 3.049–3.356).
 * The charts color a line by zone and count the time spent in each.
 */

/** One zone: from `min` to `max`, both included, as the source writes them. */
export interface HeartRateZone {
  readonly min: number;
  /** The top of the zone; `null` for the last one, which has none. */
  readonly max: number | null;
}

/** The zones, lowest first. */
export type HeartRateZones = readonly HeartRateZone[];

/**
 * Where each zone ends and the next begins, one fewer than the zones: halfway between a zone's
 * top and the next one's bottom (143.5 between "0–143" and "144–162"), or their shared edge (a
 * pace's 3.049 m/s), which belongs to the lower zone, as Strava counts it. So any value, also an
 * average between two whole beats, falls in exactly one zone. Time and space O(z) for z zones.
 */
export function zoneEdges(zones: HeartRateZones): number[] {
  return zones.slice(0, -1).map((zone, i) => {
    const next = zones[i + 1].min;
    return zone.max === null ? next : (zone.max + next) / 2;
  });
}

/**
 * Index of the zone `value` falls in: past as many edges ({@link zoneEdges}) as it is over. A
 * value on an edge is in the lower zone; one under every zone, in the first. Time O(z).
 */
export function zoneIndex(value: number, edges: readonly number[]): number {
  let index = 0;
  while (index < edges.length && value > edges[index]) {
    index++;
  }
  return index;
}

/**
 * Seconds spent in each zone, as Strava counts them: each sample counts the time since the one
 * before it, in the zone of its value, only while moving (Strava's `moving`, when given: its
 * time in zones adds up to the moving time); samples a sensor missed (`NaN`) count in none. Time
 * O(n · z) for n samples and z zones, space O(z).
 *
 * @throws RangeError when `time`, `values` and `moving` differ in length.
 */
export function timeInZones(
  time: readonly number[],
  values: readonly number[],
  zones: HeartRateZones,
  moving: readonly boolean[] | null = null,
): number[] {
  if (time.length !== values.length || (moving !== null && moving.length !== time.length)) {
    throw new RangeError(
      `Expected as many values and moving flags as times, got ${values.length}, ` +
        `${moving?.length ?? 'no'} and ${time.length}`,
    );
  }
  const edges = zoneEdges(zones);
  const seconds = zones.map(() => 0);
  for (let i = 1; i < time.length; i++) {
    const value = values[i];
    const elapsed = time[i] - time[i - 1];
    if (Number.isFinite(value) && elapsed > 0 && (moving === null || moving[i])) {
      seconds[zoneIndex(value, edges)] += elapsed;
    }
  }
  return seconds;
}

/**
 * The values a zone spans, as the charts write them: "<144" for the first, "144–162" for one in
 * between (up to the next one's start, excluded, when they share an edge: "138–187" before
 * "188+"), "185+" for the last.
 */
export function zoneRange(index: number, zones: HeartRateZones): string {
  const zone = zones[index];
  const next = zones[index + 1];
  if (index === 0 && next !== undefined) {
    return `<${next.min}`;
  }
  if (next === undefined) {
    return `${zone.min}+`;
  }
  const top = zone.max === null || zone.max >= next.min ? next.min - 1 : zone.max;
  return `${zone.min}–${top}`;
}
