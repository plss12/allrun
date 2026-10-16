import type { LocalDate } from './dates';
import type { SportFamily, SportModality } from './sports';

/**
 * Source-independent activity. Sources (Strava today, watch brands later) map their own format
 * into this shape, so the rest of the app never sees vendor fields.
 *
 * Units are SI: meters, seconds, meters per second, beats per minute, watts, kilocalories.
 * Optional measurements are `null` when the source doesn't provide them.
 */
export interface Activity {
  /** Unique across sources, e.g. `strava:123456`. */
  readonly id: string;
  readonly name: string;
  /** Raw sport type from the source (Strava `sport_type`), e.g. `TrailRun`. */
  readonly sportType: string;
  /** Decides the metrics the activity offers. */
  readonly sportModality: SportModality;
  /** Groups modalities for summaries; always `FAMILY_OF_MODALITY[sportModality]`. */
  readonly sportFamily: SportFamily;
  /** Start instant as an ISO 8601 UTC string. */
  readonly startUtc: string;
  /** Wall-clock start in the athlete's time zone, `YYYY-MM-DDTHH:mm:ss`. */
  readonly startLocal: string;
  /** Local calendar date of the start; used to group activities into periods. */
  readonly localDate: LocalDate;
  /** `0` for activities without distance (gym, yoga). */
  readonly distanceMeters: number;
  readonly movingTimeSeconds: number;
  readonly elapsedTimeSeconds: number;
  readonly elevationGainMeters: number;
  readonly maxElevationMeters: number | null;
  readonly averageSpeed: number | null;
  readonly maxSpeed: number | null;
  readonly averageHeartRate: number | null;
  readonly maxHeartRate: number | null;
  readonly averagePowerWatts: number | null;
  readonly weightedAveragePowerWatts: number | null;
  /** As reported by the source: revolutions per minute (one leg for running on Strava). */
  readonly averageCadence: number | null;
  readonly calories: number | null;
  /** Route as an encoded polyline (precision 5), or `null` without GPS (treadmill, pool). */
  readonly routePolyline: string | null;
}
