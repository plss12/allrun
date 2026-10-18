/**
 * What an activity recorded along the way, fetched on demand for its charts (Strava's activity
 * streams and splits). Source-independent and in SI units, like `Activity`.
 */

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
}

/** One split: a kilometer or a mile of the activity (the last one usually shorter). */
export interface ActivitySplit {
  readonly distanceMeters: number;
  readonly movingTimeSeconds: number;
  readonly elevationDifferenceMeters: number;
  /** Meters per second over the split. */
  readonly averageSpeed: number;
}

export interface ActivityDetail {
  /** `null` when the activity recorded no streams (a manual entry). */
  readonly streams: ActivityStreams | null;
  /** Splits by kilometer and by mile; empty without distance. */
  readonly splits: {
    readonly metric: readonly ActivitySplit[];
    readonly imperial: readonly ActivitySplit[];
  };
}
