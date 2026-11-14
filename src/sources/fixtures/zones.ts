import type { Activity } from '@/core/activity';
import { type HeartRateZones, timeInZones } from '@/core/heart-rate-zones';
import type { StravaActivityZones } from '@/sources/strava/activity-zones';
import type { StravaStreams } from '@/sources/strava/detail';
import type { StravaZones } from '@/sources/strava/zones';

/** Maximum heart rate of the synthetic athlete. */
const MAX_HEART_RATE = 187;

/** Where each zone starts, as a share of the maximum heart rate (the usual five-zone model). */
const ZONE_STARTS = [0.6, 0.7, 0.8, 0.9] as const;

/**
 * Where the synthetic athlete's six pace zones start, in m/s (from 0: slower than 6:24/km, then
 * 5:22, 4:50, 4:30 and 4:13/km), as Strava's pace zones go from recovery to anaerobic.
 */
const PACE_ZONE_STARTS = [0, 2.6, 3.1, 3.45, 3.7, 3.95] as const;

/** Where the synthetic athlete's seven power zones start, in watts: Coggan's, for an FTP of 250. */
const POWER_ZONE_STARTS = [0, 138, 188, 225, 263, 300, 375] as const;

/** A run's power, as Strava gives it: a histogram of 50 W buckets, not zones. */
const RUN_POWER_BUCKET = 50;
const RUN_POWER_BUCKETS = 10;

/**
 * The synthetic activity's time in zones, in the shape of Strava's `GET /activities/{id}/zones`:
 * its heart rate in the athlete's zones as Strava writes them (0–112, 113–131, …), a run's pace
 * in the athlete's six pace zones (and its power as Strava's histogram), a ride's power in seven
 * zones; counted on the activity's streams while moving, as Strava counts them. `null` without
 * anything to count, as Strava answers anyone but a subscriber. Time O(n · z) for n samples and
 * z zones.
 */
export function generateStravaActivityZones(
  activity: Activity,
  streams: StravaStreams | null,
): StravaActivityZones | null {
  if (streams === null) {
    return null;
  }
  const time = streams.time.data.map((value) => value ?? 0);
  const moving = streams.moving?.data.map((value) => value === true) ?? null;
  const buckets = (values: readonly (number | null)[], zones: HeartRateZones) => {
    const seconds = timeInZones(
      time,
      values.map((value) => value ?? Number.NaN),
      zones,
      moving,
    );
    return zones.map((zone, i) => ({ min: zone.min, max: zone.max ?? -1, time: seconds[i] }));
  };
  // Zones sharing their edges, as a pace's and a power's are.
  const shared = (starts: readonly number[]): HeartRateZones =>
    starts.map((min, i) => ({ min, max: starts[i + 1] ?? null }));
  const zones: StravaActivityZones = [];
  const heartRate = streams.heartrate?.data;
  if (heartRate !== undefined) {
    zones.push({ type: 'heartrate', distribution_buckets: buckets(heartRate, HEART_RATE_ZONES) });
  }
  const speed = streams.velocity_smooth?.data;
  if (activity.sportFamily === 'run' && speed !== undefined) {
    zones.push({
      type: 'pace',
      distribution_buckets: buckets(speed, shared(PACE_ZONE_STARTS)),
    });
  }
  const watts = streams.watts?.data;
  if (watts !== undefined) {
    const starts =
      activity.sportFamily === 'ride'
        ? POWER_ZONE_STARTS
        : Array.from({ length: RUN_POWER_BUCKETS }, (_, i) => i * RUN_POWER_BUCKET);
    zones.push({ type: 'power', distribution_buckets: buckets(watts, shared(starts)) });
  }
  return zones.length === 0 ? null : zones;
}

/** Where the synthetic athlete's heart rate zones start, from a maximum of 187 bpm. */
const HEART_RATE_STARTS = [0, ...ZONE_STARTS.map((share) => Math.round(MAX_HEART_RATE * share))];

/** The athlete's heart rate zones as Strava writes an activity's: 0–112, 113–131, …, 169+. */
const HEART_RATE_ZONES: HeartRateZones = HEART_RATE_STARTS.map((min, i) => ({
  min: i === 0 ? min : min + 1,
  max: HEART_RATE_STARTS[i + 1] ?? null,
}));

/**
 * The synthetic athlete's zones, in the shape of Strava's `GET /athlete/zones`: five heart rate
 * zones from a maximum of 187 bpm, sharing their edges (0–112, 112–131, …, 168 and over), the
 * last without a top (`-1`).
 */
export function generateStravaZones(): StravaZones {
  const starts = HEART_RATE_STARTS;
  return {
    heart_rate: {
      custom_zones: false,
      zones: starts.map((min, i) => ({ min, max: starts[i + 1] ?? -1 })),
    },
  };
}
