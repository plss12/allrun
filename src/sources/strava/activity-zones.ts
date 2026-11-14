import { z } from 'zod';

import type { ActivityZones, ZoneDistribution } from '@/core/activity-detail';

/**
 * An activity's time in zones from Strava (`GET /activities/{id}/zones`, a subscriber's feature):
 * one entry per measure (`heartrate`, `pace`, `power`), each with its buckets, their limits and
 * the seconds spent in each, only while moving. The heart rate's are the athlete's zones as they
 * were counted ("0–143", "144–162", …); the pace's, the athlete's six pace zones, in m/s;
 * a ride's power, with a power meter and the athlete's FTP, its seven power zones; a run's power
 * comes as a histogram of 50 W buckets instead, which aren't zones.
 *
 * Reference: https://developers.strava.com/docs/reference/#api-Activities-getZonesByActivityId
 */
const bucketSchema = z.object({
  min: z.number(),
  max: z.number(),
  time: z.number().nonnegative(),
});

const activityZoneSchema = z.object({
  type: z.string(),
  distribution_buckets: z.array(bucketSchema).nullish(),
});

export const stravaActivityZonesSchema = z.array(activityZoneSchema);

export type StravaActivityZones = z.infer<typeof stravaActivityZonesSchema>;

/** Most buckets a power distribution has when it is the athlete's zones, not a histogram. */
const MAX_POWER_ZONES = 7;

/**
 * Validates an activity's zones and maps its heart rate, pace and power zones, lowest first (the
 * slowest pace, the least power), each with the seconds spent in it; a measure Strava has no
 * zones of (no heart rate monitor, no pace zones, a run's power histogram) is `null`.
 *
 * @throws Error naming each invalid field when the JSON doesn't match the schema, or when a
 *   measure's zones don't rise one after another.
 */
export function parseStravaActivityZones(json: unknown): ActivityZones {
  const result = stravaActivityZonesSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid Strava activity zones:\n${z.prettifyError(result.error)}`, {
      cause: result.error,
    });
  }
  const of = (type: string) =>
    result.data.find((zone) => zone.type === type)?.distribution_buckets ?? [];
  const power = of('power');
  return {
    heartRate: distribution(of('heartrate'), 'heart rate'),
    pace: distribution(of('pace'), 'pace'),
    power: power.length <= MAX_POWER_ZONES ? distribution(power, 'power') : null,
  };
}

/**
 * Buckets as zones, lowest first: each from its `min` up to the next one's; the last has no top
 * when Strava writes none (`-1`, or a top under its bottom). `null` with fewer than two.
 */
function distribution(
  buckets: readonly z.infer<typeof bucketSchema>[],
  measure: string,
): ZoneDistribution | null {
  if (buckets.length < 2) {
    return null;
  }
  const sorted = [...buckets].sort((a, b) => a.min - b.min);
  sorted.forEach((bucket, i) => {
    if (i > 0 && bucket.min <= sorted[i - 1].min) {
      throw new Error(
        `Invalid Strava ${measure} zones: zone ${i + 1} starts at or under zone ${i}`,
      );
    }
  });
  return {
    zones: sorted.map((bucket, i) => ({
      min: bucket.min,
      max: i === sorted.length - 1 && !(bucket.max > bucket.min) ? null : bucket.max,
    })),
    seconds: sorted.map((bucket) => bucket.time),
  };
}
