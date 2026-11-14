/**
 * What an activity recorded along the way, fetched on demand for its charts (Strava's activity
 * streams, splits and laps). Source-independent and in SI units, like `Activity`.
 */

import type { HeartRateZones } from './heart-rate-zones';

/**
 * Samples recorded during an activity, one per point in time: every array has the same length
 * as `time`. A measurement the activity didn't record is `null`.
 */
export interface ActivityStreams {
  /** Seconds since the start. */
  readonly time: readonly number[];
  /** Meters from the start; `null` without distance (a gym session). */
  readonly distance: readonly number[] | null;
  /** Meters above sea level. */
  readonly altitude: readonly number[] | null;
  /** Meters per second, smoothed by the source. */
  readonly speed: readonly number[] | null;
  /** Beats per minute. */
  readonly heartRate: readonly number[] | null;
  /** Watts. */
  readonly power: readonly number[] | null;
  /**
   * Steps a minute of one leg on foot (Strava's running cadence: twice it is the steps a minute),
   * or the cranks' turns a minute on a bike.
   */
  readonly cadence: readonly number[] | null;
  /** Whether the athlete was moving at each sample, by Strava's own reckoning of stops. */
  readonly moving: readonly boolean[] | null;
}

/** One split: a kilometer or a mile of the activity (the last one usually shorter). */
export interface ActivitySplit {
  readonly distanceMeters: number;
  readonly movingTimeSeconds: number;
  readonly elevationDifferenceMeters: number;
  /** Meters per second over the split. */
  readonly averageSpeed: number;
  /** Beats per minute over the split; `null` without a heart rate monitor. */
  readonly averageHeartRate: number | null;
}

/**
 * One lap: a stretch the athlete marked with the watch's lap button (an interval, its recovery)
 * or that the watch marked by itself (every kilometer). An activity without either has one lap.
 */
export interface ActivityLap {
  readonly distanceMeters: number;
  readonly movingTimeSeconds: number;
  /** Meters per second over the lap. */
  readonly averageSpeed: number;
  /** Beats per minute over the lap; `null` without a heart rate monitor. */
  readonly averageHeartRate: number | null;
}

/**
 * Time in each zone of a measure, as the source counts it: the zones lowest first (the slowest
 * pace, the least power), in the measure's unit (bpm, m/s, watts), and the seconds in each.
 */
export interface ZoneDistribution {
  /** As the source writes them (see `HeartRateZones`); the last's `max` is `null`, no top. */
  readonly zones: HeartRateZones;
  readonly seconds: readonly number[];
}

/** An activity's time in zones, when the source has it (Strava's subscribers). */
export interface ActivityZones {
  readonly heartRate: ZoneDistribution | null;
  readonly pace: ZoneDistribution | null;
  readonly power: ZoneDistribution | null;
}

/**
 * The distances Strava finds a run's best efforts over, each with its length in meters: every one
 * the run covered, from 400 m to 50 km.
 */
export const BEST_EFFORT_DISTANCES = {
  m400: 400,
  halfMile: 804.672,
  k1: 1000,
  mile: 1609.344,
  twoMiles: 3218.688,
  k5: 5000,
  k10: 10_000,
  k15: 15_000,
  tenMiles: 16_093.44,
  k20: 20_000,
  half: 21_097.5,
  k30: 30_000,
  marathon: 42_195,
  k50: 50_000,
} as const;

export type BestEffortDistance = keyof typeof BEST_EFFORT_DISTANCES;

/**
 * One of a run's best efforts: its fastest stretch of a standard distance (400 m, 1 km, a mile,
 * 5K…) within the activity, and how it ranks among the athlete's own.
 */
export interface BestEffort {
  /** Which standard distance it is, by the name the source gives it; `null` if none. */
  readonly distance: BestEffortDistance | null;
  readonly distanceMeters: number;
  readonly elapsedTimeSeconds: number;
  /** 1 for the athlete's record at that distance, 2 and 3 for their second and third best. */
  readonly prRank: 1 | 2 | 3 | null;
}

export interface ActivityDetail {
  /** `null` when the activity recorded no streams (a manual entry). */
  readonly streams: ActivityStreams | null;
  /** Splits by kilometer and by mile; empty without distance. */
  readonly splits: {
    readonly metric: readonly ActivitySplit[];
    readonly imperial: readonly ActivitySplit[];
  };
  /** Its laps, in order; one for an activity nobody split. */
  readonly laps: readonly ActivityLap[];
  /** Its time in pace and power zones; absent or `null` when the source has none. */
  readonly zones?: ActivityZones | null;
  /** A run's best efforts, shortest first; absent or empty for any other activity. */
  readonly bestEfforts?: readonly BestEffort[];
}
