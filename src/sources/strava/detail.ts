import { z } from 'zod';

import {
  type ActivityDetail,
  type ActivityLap,
  type ActivitySplit,
  BEST_EFFORT_DISTANCES,
  type BestEffort,
  type BestEffortDistance,
} from '@/core/activity-detail';

import { parseStravaActivityZones } from './activity-zones';

/**
 * Strava's activity streams (`GET /activities/{id}/streams?keys=…&key_by_type=true`): one series
 * per measurement, every series as long as `time`. A sample a sensor missed comes as `null`.
 *
 * Reference: https://developers.strava.com/docs/reference/#api-Streams-getActivityStreams
 */
const streamSchema = z.object({ data: z.array(z.number().nullable()) });
const flagStreamSchema = z.object({ data: z.array(z.boolean().nullable()) });

export const stravaStreamsSchema = z
  .object({
    time: streamSchema,
    distance: streamSchema.optional(),
    altitude: streamSchema.optional(),
    velocity_smooth: streamSchema.optional(),
    heartrate: streamSchema.optional(),
    watts: streamSchema.optional(),
    cadence: streamSchema.optional(),
    moving: flagStreamSchema.optional(),
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

/**
 * A run's best effort (`best_efforts` of a run's detail): its fastest stretch of a standard
 * distance, and its rank among the athlete's own (`pr_rank`: 1 to 3, or none).
 *
 * Reference: https://developers.strava.com/docs/reference/#api-models-DetailedSegmentEffort
 */
const bestEffortSchema = z.object({
  /** "400m", "1/2 mile", "1k", "1 mile", "2 mile", "5k", …, "Half-Marathon", "Marathon", "50k". */
  name: z.string().nullish(),
  distance: z.number().positive(),
  elapsed_time: z.number().positive(),
  pr_rank: z.number().int().nullish(),
});

export const stravaDetailedActivitySchema = z.object({
  splits_metric: z.array(splitSchema).nullish(),
  splits_standard: z.array(splitSchema).nullish(),
  laps: z.array(lapSchema).nullish(),
  best_efforts: z.array(bestEffortSchema).nullish(),
});

export type StravaDetailedActivity = z.infer<typeof stravaDetailedActivitySchema>;

/**
 * Validates an activity's streams (`null` when it recorded none), its detail's splits, laps and
 * best efforts, and its zones (`null` when Strava gave none: not a subscriber), and maps them to
 * the source-independent {@link ActivityDetail}. A sample a sensor missed becomes `NaN`, which
 * the charts skip.
 *
 * @throws Error naming each invalid field when the JSON doesn't match the schemas.
 */
export function parseStravaDetail(
  streamsJson: unknown,
  activityJson: unknown,
  zonesJson: unknown = null,
): ActivityDetail {
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
            cadence: series(streams.cadence),
            // A sample without the flag counts as moving: only Strava's stops are left out.
            moving:
              streams.moving === undefined
                ? null
                : streams.moving.data.map((value) => value ?? true),
          },
    splits: {
      metric: (splits.splits_metric ?? []).map(toSplit),
      imperial: (splits.splits_standard ?? []).map(toSplit),
    },
    laps: (splits.laps ?? []).map(toLap),
    zones: zonesJson === null ? null : parseStravaActivityZones(zonesJson),
    bestEfforts: [...(splits.best_efforts ?? [])]
      .sort((a, b) => a.distance - b.distance)
      .map(toBestEffort),
  };
}

/** Strava's names of its best efforts' distances, lower case and without spaces or dashes. */
const BEST_EFFORT_NAMES: Readonly<Record<string, BestEffortDistance>> = {
  '400m': 'm400',
  '1/2mile': 'halfMile',
  '1k': 'k1',
  '1mile': 'mile',
  '2mile': 'twoMiles',
  '5k': 'k5',
  '10k': 'k10',
  '15k': 'k15',
  '10mile': 'tenMiles',
  '20k': 'k20',
  halfmarathon: 'half',
  '30k': 'k30',
  marathon: 'marathon',
  '50k': 'k50',
};

/** Share of a distance its measured length may be off by and still be it, without a name. */
const DISTANCE_TOLERANCE = 0.01;

/**
 * Which standard distance a best effort is: by Strava's name for it, which is exact whatever
 * length its measured distance came out at (an effort "10 mile" may measure 16,090 m), or, without
 * a name, by its length within 1 %. `null` for neither. Time O(d) for d distances.
 */
function bestEffortDistance(
  name: string | null | undefined,
  meters: number,
): BestEffortDistance | null {
  const named =
    name == null ? undefined : BEST_EFFORT_NAMES[name.toLowerCase().replace(/[\s-]/g, '')];
  if (named !== undefined) {
    return named;
  }
  const near = (Object.keys(BEST_EFFORT_DISTANCES) as BestEffortDistance[]).find(
    (key) =>
      Math.abs(BEST_EFFORT_DISTANCES[key] - meters) <=
      BEST_EFFORT_DISTANCES[key] * DISTANCE_TOLERANCE,
  );
  return near ?? null;
}

function toBestEffort(effort: z.infer<typeof bestEffortSchema>): BestEffort {
  const rank = effort.pr_rank;
  return {
    distance: bestEffortDistance(effort.name, effort.distance),
    distanceMeters: effort.distance,
    elapsedTimeSeconds: effort.elapsed_time,
    prRank: rank === 1 || rank === 2 || rank === 3 ? rank : null,
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
