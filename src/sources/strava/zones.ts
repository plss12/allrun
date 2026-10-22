import { z } from 'zod';

import type { HeartRateZones } from '@/core/heart-rate-zones';

/**
 * The athlete's zones from Strava (`GET /athlete/zones`, which needs the `profile:read_all`
 * scope): heart rate zones, custom or from Strava's estimate of the maximum heart rate. The last
 * zone has no top, written as `-1`. Power zones, also there, are not used yet.
 *
 * Reference: https://developers.strava.com/docs/reference/#api-Athletes-getLoggedInAthleteZones
 */
const zoneSchema = z.object({
  min: z.number().nonnegative(),
  max: z.number(),
});

export const stravaZonesSchema = z.object({
  heart_rate: z
    .object({
      custom_zones: z.boolean().optional(),
      zones: z.array(zoneSchema),
    })
    .nullish(),
});

export type StravaZones = z.infer<typeof stravaZonesSchema>;

/**
 * Validates the athlete's zones and maps the heart rate ones, lowest first; `null` when Strava
 * has none (an athlete who never recorded a heart rate).
 *
 * @throws Error naming each invalid field when the JSON doesn't match the schema, or when the
 *   zones don't rise one after another.
 */
export function parseStravaZones(json: unknown): HeartRateZones | null {
  const result = stravaZonesSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid Strava zones:\n${z.prettifyError(result.error)}`, {
      cause: result.error,
    });
  }
  const zones = result.data.heart_rate?.zones ?? [];
  if (zones.length === 0) {
    return null;
  }
  zones.forEach((zone, i) => {
    if (i > 0 && zone.min <= zones[i - 1].min) {
      throw new Error(`Invalid Strava zones: zone ${i + 1} starts at or under zone ${i}`);
    }
  });
  return zones.map((zone) => ({ min: zone.min, max: zone.max < 0 ? null : zone.max }));
}
