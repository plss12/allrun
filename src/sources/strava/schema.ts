import { z } from 'zod';

import type { Activity } from '@/core/activity';
import { FAMILY_OF_MODALITY, modalityOfStravaType } from '@/core/sports';

/**
 * The fields AllRun uses from Strava's `SummaryActivity` (`GET /athlete/activities`), plus
 * `calories` from `DetailedActivity`. Unknown fields are stripped.
 *
 * Reference: https://developers.strava.com/docs/reference/#api-models-SummaryActivity
 */
export const stravaActivitySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  sport_type: z.string().min(1),
  start_date: z.iso.datetime(),
  // Local wall-clock time, although Strava suffixes it with "Z".
  start_date_local: z.iso.datetime(),
  distance: z.number().nonnegative(),
  moving_time: z.number().int().nonnegative(),
  elapsed_time: z.number().int().nonnegative(),
  total_elevation_gain: z.number().nonnegative(),
  elev_high: z.number().nullish(),
  average_speed: z.number().nonnegative(),
  max_speed: z.number().nonnegative(),
  average_heartrate: z.number().positive().nullish(),
  max_heartrate: z.number().positive().nullish(),
  average_watts: z.number().nonnegative().nullish(),
  weighted_average_watts: z.number().nonnegative().nullish(),
  average_cadence: z.number().nonnegative().nullish(),
  calories: z.number().nonnegative().nullish(),
  map: z.object({ summary_polyline: z.string().nullish() }).nullish(),
});

/** A Strava activity as validated by {@link stravaActivitySchema}. */
export type StravaActivity = z.infer<typeof stravaActivitySchema>;

/** Maps a validated Strava activity to the source-independent {@link Activity}. */
export function stravaToActivity(strava: StravaActivity): Activity {
  const polyline = strava.map?.summary_polyline;
  const modality = modalityOfStravaType(strava.sport_type);
  return {
    id: `strava:${strava.id}`,
    name: strava.name,
    sportType: strava.sport_type,
    sportModality: modality,
    sportFamily: FAMILY_OF_MODALITY[modality],
    startUtc: strava.start_date,
    startLocal: strava.start_date_local.slice(0, 19),
    localDate: strava.start_date_local.slice(0, 10),
    distanceMeters: strava.distance,
    movingTimeSeconds: strava.moving_time,
    elapsedTimeSeconds: strava.elapsed_time,
    elevationGainMeters: strava.total_elevation_gain,
    maxElevationMeters: strava.elev_high ?? null,
    averageSpeed: strava.average_speed > 0 ? strava.average_speed : null,
    maxSpeed: strava.max_speed > 0 ? strava.max_speed : null,
    averageHeartRate: strava.average_heartrate ?? null,
    maxHeartRate: strava.max_heartrate ?? null,
    averagePowerWatts: strava.average_watts ?? null,
    weightedAveragePowerWatts: strava.weighted_average_watts ?? null,
    averageCadence: strava.average_cadence ?? null,
    calories: strava.calories ?? null,
    routePolyline: polyline ? polyline : null,
  };
}

/**
 * Validates a page of Strava activities (raw JSON) and maps it to {@link Activity}.
 *
 * @throws Error naming each invalid field when the payload doesn't match the schema.
 */
export function parseStravaActivities(json: unknown): Activity[] {
  const result = z.array(stravaActivitySchema).safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid Strava activities payload:\n${z.prettifyError(result.error)}`, {
      cause: result.error,
    });
  }
  return result.data.map(stravaToActivity);
}
