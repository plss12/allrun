import type { Activity } from '@/core/activity';
import type { StravaSplits, StravaStreams } from '@/sources/strava/detail';

import { mulberry32, type Random } from './random';

/** Seconds between two samples: Strava records about one a second; this is plenty to draw. */
const SAMPLE_SECONDS = 5;
const MAX_SAMPLES = 3000;
const METERS_PER_MILE = 1609.344;

/**
 * Synthetic streams and splits for a synthetic activity, in the shape of Strava's API, so the
 * activity charts can be built and tested without real data. They agree with the activity's
 * totals: the distance and moving time, the elevation gain (climbs and descents with that much
 * going up), the average heart rate and power. The same activity and seed always give the same
 * result.
 *
 * - Speed wanders around the average (slower on climbs), and the distance is what it adds up to.
 * - Altitude is a few overlapping hills along the distance, scaled to the elevation gain; only
 *   activities with a route have one (a treadmill or a pool doesn't).
 * - Heart rate warms up over the first minutes and follows the effort; power wanders around its
 *   average.
 * - Splits are measured on the streams, every kilometer and every mile.
 *
 * Time and space O(n) for n samples.
 */
export function generateStravaDetail(
  activity: Activity,
  seed: number,
): { readonly streams: StravaStreams | null; readonly splits: StravaSplits } {
  const random = mulberry32(seed);
  const count = Math.min(
    MAX_SAMPLES,
    Math.max(50, Math.round(activity.movingTimeSeconds / SAMPLE_SECONDS)),
  );
  const time = Array.from(
    { length: count },
    (_, i) => (i * activity.movingTimeSeconds) / (count - 1),
  );
  const hasDistance = activity.distanceMeters > 0;

  const hills = hillShape(random);
  const effort = wave(random, 0.03);
  const hilly = activity.routePolyline !== null && activity.elevationGainMeters > 0;
  // How much a climb slows down (and a descent speeds up): more on a bike.
  const climbing = !hilly ? 0 : activity.sportFamily === 'ride' ? 0.3 : 0.12;
  // Speed before scaling to the distance: around 1, slower on climbs. The time stands in for the
  // distance to place the hills: close enough for the speed to follow them.
  const rawSpeed = time.map((_, i) => {
    const along = i / (count - 1);
    return Math.max(
      0.3,
      1 + effort(along) - climbing * hills.slope(along) + 0.03 * (random() - 0.5),
    );
  });
  const distance = hasDistance ? cumulative(rawSpeed, time, activity.distanceMeters) : null;
  const scale =
    distance === null ? 0 : activity.distanceMeters / activity.movingTimeSeconds / mean(rawSpeed);
  const speed = distance === null ? null : rawSpeed.map((value) => round(value * scale, 3));

  const altitude =
    distance !== null && activity.routePolyline !== null && activity.elevationGainMeters > 0
      ? altitudes(distance, activity, hills)
      : null;

  const heartRate =
    activity.averageHeartRate === null
      ? null
      : heartRates(time, rawSpeed, activity.averageHeartRate, random);
  const power =
    activity.averagePowerWatts === null
      ? null
      : powers(rawSpeed, activity.averagePowerWatts, random);

  const stream = (data: readonly number[] | null) =>
    data === null ? undefined : { data: [...data] };
  return {
    streams: {
      time: { data: time.map(Math.round) },
      distance: stream(distance),
      altitude: stream(altitude),
      velocity_smooth: stream(speed),
      heartrate: stream(heartRate),
      watts: stream(power),
    },
    splits:
      distance === null
        ? { splits_metric: null, splits_standard: null }
        : {
            splits_metric: splits(distance, time, altitude, 1000),
            splits_standard: splits(distance, time, altitude, METERS_PER_MILE),
          },
  };
}

/** A smooth wander around 0 of about `size`, as a function of the position (0..1). */
function wave(random: Random, size: number): (along: number) => number {
  const parts = Array.from({ length: 3 }, (_, i) => ({
    cycles: 1 + i * 2 + random() * 2,
    phase: random() * 2 * Math.PI,
    weight: size / (i + 1),
  }));
  return (along) =>
    parts.reduce(
      (sum, part) => sum + part.weight * Math.sin(2 * Math.PI * part.cycles * along + part.phase),
      0,
    );
}

/**
 * A few hills of different sizes along the way, and how steep they are at each point, from -1
 * (the steepest descent) to 1 (the steepest climb).
 */
function hillShape(random: Random) {
  const hills = Array.from({ length: 4 }, () => ({
    cycles: 0.5 + random() * 3,
    phase: random() * 2 * Math.PI,
    height: 0.3 + random(),
  }));
  const height = (along: number) =>
    hills.reduce(
      (sum, hill) => sum + hill.height * Math.sin(2 * Math.PI * hill.cycles * along + hill.phase),
      0,
    );
  const STEP = 0.005;
  const rawSlope = (along: number) => height(along + STEP) - height(along);
  const steepest = Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(rawSlope(i / 199))));
  const slope = (along: number) => rawSlope(along) / steepest;
  return { height, slope };
}

/** Distance covered at each sample, scaled so it ends at `total`. */
function cumulative(speeds: readonly number[], time: readonly number[], total: number): number[] {
  const steps = speeds.map((speed, i) => (i === 0 ? 0 : speed * (time[i] - time[i - 1])));
  const sum = steps.reduce((acc, step) => acc + step, 0);
  let covered = 0;
  return steps.map((step) => {
    covered += step;
    return round((covered / sum) * total, 1);
  });
}

/**
 * Altitude along the distance: the hill shape scaled so everything it climbs adds up to the
 * activity's elevation gain, topping out at its highest point when it has one.
 */
function altitudes(
  distance: readonly number[],
  activity: Activity,
  hills: { height: (along: number) => number },
): number[] {
  const total = distance[distance.length - 1];
  const shape = distance.map((meters) => hills.height(meters / total));
  const climbed = shape.reduce(
    (sum, value, i) => sum + (i > 0 ? Math.max(0, value - shape[i - 1]) : 0),
    0,
  );
  const scale = activity.elevationGainMeters / climbed;
  const lowest = Math.min(...shape) * scale;
  const highest = Math.max(...shape) * scale;
  const top = activity.maxElevationMeters ?? 12 + highest - lowest;
  return shape.map((value) => round(top - highest + value * scale, 1));
}

/** Heart rate warming up over the first tenth and following the effort, averaging `average`. */
function heartRates(
  time: readonly number[],
  effort: readonly number[],
  average: number,
  random: Random,
): number[] {
  const raw = time.map((_, i) => {
    const along = i / (time.length - 1);
    const warmUp = along < 0.1 ? -25 * (1 - along / 0.1) : 0;
    return average + warmUp + 40 * (effort[i] - 1) + 3 * (random() - 0.5);
  });
  const shift = average - mean(raw);
  return raw.map((value) => Math.round(value + shift));
}

/** Power wandering with the effort around `average`, never below zero. */
function powers(effort: readonly number[], average: number, random: Random): number[] {
  const raw = effort.map((value) => Math.max(0, average * (value + 0.25 * (random() - 0.5))));
  const ratio = average / mean(raw);
  return raw.map((value) => Math.round(value * ratio));
}

/**
 * Splits every `length` meters, measured on the streams the way Strava does: the time to cover
 * each stretch, its average speed and its change in altitude, plus the shorter last one.
 */
function splits(
  distance: readonly number[],
  time: readonly number[],
  altitude: readonly number[] | null,
  length: number,
) {
  const total = distance[distance.length - 1];
  const result = [];
  let start = { meters: 0, seconds: 0, altitude: altitude?.[0] ?? 0 };
  for (let mark = length; start.meters < total - 1; mark += length) {
    const at = Math.min(mark, total);
    const end = sampleAt(distance, time, altitude, at);
    const seconds = end.seconds - start.seconds;
    result.push({
      distance: round(at - start.meters, 1),
      moving_time: Math.round(seconds),
      elevation_difference: altitude === null ? null : round(end.altitude - start.altitude, 1),
      average_speed: seconds > 0 ? round((at - start.meters) / seconds, 3) : 0,
    });
    start = end;
  }
  return result;
}

/** Time and altitude when the distance reached `meters`, interpolating between samples. */
function sampleAt(
  distance: readonly number[],
  time: readonly number[],
  altitude: readonly number[] | null,
  meters: number,
) {
  const after = distance.findIndex((value) => value >= meters);
  const i = after <= 0 ? Math.max(0, after) : after;
  const j = Math.max(0, i - 1);
  const span = distance[i] - distance[j];
  const share = span > 0 ? (meters - distance[j]) / span : 0;
  const lerp = (values: readonly number[]) => values[j] + (values[i] - values[j]) * share;
  return { meters, seconds: lerp(time), altitude: altitude === null ? 0 : lerp(altitude) };
}

const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
