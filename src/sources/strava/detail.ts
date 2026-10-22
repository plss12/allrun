import { z } from 'zod';

import type { ActivityDetail, ActivityLap, ActivitySplit } from '@/core/activity-detail';

/**
 * Strava's activity streams (`GET /activities/{id}/streams?keys=…&key_by_type=true`): one series
 * per measurement, every series as long as `time`. A sample a sensor missed comes as `null`.
 *
 * Reference: https://developers.strava.com/docs/reference/#api-Streams-getActivityStreams
 */
const streamSchema = z.object({ data: z.array(z.number().nullable()) });

export const stravaStreamsSchema = z
  .object({
    time: streamSchema,
    distance: streamSchema.optional(),
    altitude: streamSchema.optional(),
    velocity_smooth: streamSchema.optional(),
    heartrate: streamSchema.optional(),
    watts: streamSchema.optional(),
  })
  .superRefine((streams, context) => {
    const length = streams.time.data.length;
    for (const [key, stream] of Object.entries(streams)) {
      if (stream !== undefined && stream.data.length !== length) {
        context.addIssue({
          code: 'custom',
          path: [key, 'data'],
          message: `Expected ${length} samples, like time, got ${stream.data.length}`,
        });
      }
    }
  });

export type StravaStreams = z.infer<typeof stravaStreamsSchema>;

/**
 * The splits and laps of Strava's `DetailedActivity` (`GET /activities/{id}`): splits by kilometer
 * (`splits_metric`) and by mile (`splits_standard`), missing for activities without distance, and
 * its laps.
 *
 * Reference: https://developers.strava.com/docs/reference/#api-models-Split and
 * https://developers.strava.com/docs/reference/#api-models-Lap
 */
const splitSchema = z.object({
  distance: z.number().nonnegative(),
  moving_time: z.number().nonnegative(),
  elevation_difference: z.number().nullish(),
  average_speed: z.number().nonnegative(),
  average_heartrate: z.number().positive().nullish(),
});

const lapSchema = z.object({
  distance: z.number().nonnegative(),
  moving_time: z.number().nonnegative(),
  average_speed: z.number().nonnegative(),
  average_heartrate: z.number().positive().nullish(),
});

export const stravaDetailedActivitySchema = z.object({
  splits_metric: z.array(splitSchema).nullish(),
  splits_standard: z.array(splitSchema).nullish(),
  laps: z.array(lapSchema).nullish(),
});

export type StravaDetailedActivity = z.infer<typeof stravaDetailedActivitySchema>;

/**
 * Validates an activity's streams (`null` when it recorded none) and its detail's splits and laps,
 * and maps them to the source-independent {@link ActivityDetail}. A sample a sensor missed becomes
 * `NaN`, which the charts skip.
 *
 * @throws Error naming each invalid field when the JSON doesn't match the schemas.
 */
export function parseStravaDetail(streamsJson: unknown, activityJson: unknown): ActivityDetail {
  const streams =
    streamsJson === null ? null : parseOrThrow(stravaStreamsSchema, streamsJson, 'streams');
  const splits = parseOrThrow(stravaDetailedActivitySchema, activityJson, 'activity detail');
  const series = (stream: { data: (number | null)[] } | undefined) =>
    stream === undefined ? null : stream.data.map((value) => value ?? Number.NaN);
  return {
    streams:
      streams === null
        ? null
        : {
            time: series(streams.time) ?? [],
            distance: series(streams.distance),
            altitude: series(streams.altitude),
            speed: series(streams.velocity_smooth),
            heartRate: series(streams.heartrate),
            power: series(streams.watts),
          },
    splits: {
      metric: (splits.splits_metric ?? []).map(toSplit),
      imperial: (splits.splits_standard ?? []).map(toSplit),
    },
    laps: (splits.laps ?? []).map(toLap),
  };
}

function toLap(lap: z.infer<typeof lapSchema>): ActivityLap {
  return {
    distanceMeters: lap.distance,
    movingTimeSeconds: lap.moving_time,
    averageSpeed: lap.average_speed,
    averageHeartRate: lap.average_heartrate ?? null,
  };
}

function toSplit(split: z.infer<typeof splitSchema>): ActivitySplit {
  return {
    distanceMeters: split.distance,
    movingTimeSeconds: split.moving_time,
    elevationDifferenceMeters: split.elevation_difference ?? 0,
    averageSpeed: split.average_speed,
    averageHeartRate: split.average_heartrate ?? null,
  };
}

function parseOrThrow<T>(schema: z.ZodType<T>, json: unknown, what: string): T {
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid Strava ${what}:\n${z.prettifyError(result.error)}`, {
      cause: result.error,
    });
  }
  return result.data;
}
