import type { Activity } from './activity';
import type { SportFamily, SportModality } from './sports';
import { type DistanceUnit, formatDuration, formatPaceOver } from './units';

/** Every metric a data widget can show for a single activity. */
export type MetricId =
  | 'distance'
  | 'movingTime'
  | 'elapsedTime'
  | 'pace'
  | 'swimPace'
  | 'speed'
  | 'elevationGain'
  | 'maxElevation'
  | 'averageHeartRate'
  | 'maxHeartRate'
  | 'averagePower'
  | 'weightedAveragePower'
  | 'averageCadence'
  | 'calories';

/** Every outdoor ride, on the road, on a mountain bike or on gravel. */
const RIDE: readonly MetricId[] = [
  'distance',
  'speed',
  'movingTime',
  'elevationGain',
  'averagePower',
  'averageHeartRate',
  'calories',
  'averageCadence',
  'maxElevation',
  'weightedAveragePower',
  'maxHeartRate',
  'elapsedTime',
];

/**
 * Metrics offered for each modality, in the order every widget writes them (most important
 * first, by the sport's family):
 *
 * - runs: distance, pace, time, elevation, average heart rate;
 * - rides: distance, speed, time, elevation, power, average heart rate;
 * - walks: distance, time, elevation, then their pace (sources don't report steps);
 * - swims: distance, pace per 100 m, time, average heart rate;
 * - training and any other sport: time, average heart rate, calories, then what else it has.
 *
 * After them come calories, cadence and the highest altitude, and last the second readings of a
 * datum already shown (weighted power, highest heart rate, elapsed time). Indoor modalities skip
 * what they can't measure. `other` is the generic profile and only shows what the activity has.
 */
const PROFILES: Readonly<Record<SportModality, readonly MetricId[]>> = {
  roadRun: [
    'distance',
    'pace',
    'movingTime',
    'elevationGain',
    'averageHeartRate',
    'calories',
    'averageCadence',
    'maxElevation',
    'maxHeartRate',
    'elapsedTime',
  ],
  trailRun: [
    'distance',
    'pace',
    'movingTime',
    'elevationGain',
    'averageHeartRate',
    'calories',
    'averageCadence',
    'maxElevation',
    'maxHeartRate',
    'elapsedTime',
  ],
  treadmillRun: [
    'distance',
    'pace',
    'movingTime',
    'averageHeartRate',
    'calories',
    'averageCadence',
    'maxHeartRate',
  ],
  walk: [
    'distance',
    'movingTime',
    'elevationGain',
    'pace',
    'averageHeartRate',
    'calories',
    'maxHeartRate',
    'elapsedTime',
  ],
  hike: [
    'distance',
    'movingTime',
    'elevationGain',
    'pace',
    'averageHeartRate',
    'calories',
    'maxElevation',
    'maxHeartRate',
    'elapsedTime',
  ],
  roadRide: RIDE,
  mountainBikeRide: RIDE,
  gravelRide: RIDE,
  eBikeRide: [
    'distance',
    'speed',
    'movingTime',
    'elevationGain',
    'averageHeartRate',
    'calories',
    'maxElevation',
    'maxHeartRate',
    'elapsedTime',
  ],
  // Virtual platforms (Zwift and similar) simulate elevation, so it stays.
  indoorRide: [
    'distance',
    'speed',
    'movingTime',
    'elevationGain',
    'averagePower',
    'averageHeartRate',
    'calories',
    'averageCadence',
    'weightedAveragePower',
    'maxHeartRate',
  ],
  swim: [
    'distance',
    'swimPace',
    'movingTime',
    'averageHeartRate',
    'calories',
    'maxHeartRate',
    'elapsedTime',
  ],
  // Sessions measured in time and effort; a cardio machine's distance is rarely real.
  workout: ['movingTime', 'averageHeartRate', 'calories', 'maxHeartRate', 'elapsedTime'],
  other: [
    'movingTime',
    'averageHeartRate',
    'calories',
    'distance',
    'speed',
    'elevationGain',
    'averagePower',
    'maxHeartRate',
    'elapsedTime',
  ],
};

/**
 * Raw value of a metric in SI units, or `null` when the activity doesn't have it.
 *
 * Pace metrics return the average speed in m/s; {@link toDisplayMetric} turns it into time per
 * distance.
 */
export function metricValue(activity: Activity, metric: MetricId): number | null {
  switch (metric) {
    case 'distance':
      return activity.distanceMeters;
    case 'movingTime':
      return activity.movingTimeSeconds;
    case 'elapsedTime':
      return activity.elapsedTimeSeconds;
    case 'pace':
    case 'swimPace':
    case 'speed':
      return activity.averageSpeed;
    case 'elevationGain':
      return activity.elevationGainMeters;
    case 'maxElevation':
      return activity.maxElevationMeters;
    case 'averageHeartRate':
      return activity.averageHeartRate;
    case 'maxHeartRate':
      return activity.maxHeartRate;
    case 'averagePower':
      return activity.averagePowerWatts;
    case 'weightedAveragePower':
      return activity.weightedAveragePowerWatts;
    case 'averageCadence':
      return activity.averageCadence;
    case 'calories':
      return activity.calories;
  }
}

/**
 * Metrics the editor can offer for `activity`: its sport profile, keeping only metrics with a
 * positive value. A zero counts as missing because sources report `0` for data they don't have
 * (distance of a gym session, elevation of a treadmill run).
 */
export function availableMetrics(activity: Activity): MetricId[] {
  return PROFILES[activity.sportModality].filter((metric) => {
    const value = metricValue(activity, metric);
    return value !== null && Number.isFinite(value) && value > 0;
  });
}

/** What a card says of an activity without distance: how long, how hard and how much it burnt. */
const EFFORT_METRICS: readonly MetricId[] = ['movingTime', 'averageHeartRate', 'calories'];
/** Second readings of a datum a card already shows, which would only repeat it. */
const REPEATED_METRICS: readonly MetricId[] = ['elapsedTime', 'maxHeartRate'];

/**
 * The three data an activity's card shows: the first three of its sport's order when it has a
 * distance (see `PROFILES`); otherwise its time, average heart rate and calories, the missing
 * ones made up with other data of its sport that don't repeat these. Time and space O(1).
 */
export function cardMetrics(activity: Activity): MetricId[] {
  const available = availableMetrics(activity);
  const first = available.includes('distance') ? [] : EFFORT_METRICS;
  const others = available.filter(
    (metric) => !first.includes(metric) && !REPEATED_METRICS.includes(metric),
  );
  return [...first.filter((metric) => available.includes(metric)), ...others].slice(0, 3);
}

/**
 * Every unit a displayed metric can carry, as a key the interface translates (`metricUnits` in
 * the locales): most read the same in every language, but heart rate is "bpm" in English and
 * "ppm" in Spanish.
 */
export const METRIC_UNITS = [
  'km',
  'mi',
  'm',
  'ft',
  'min/km',
  'min/mi',
  'min/100m',
  'min/100yd',
  '/km',
  '/mi',
  '/100m',
  '/100yd',
  'km/h',
  'mph',
  'bpm',
  'W',
  'spm',
  'rpm',
  'kcal',
  'h',
] as const;

/** Unit label key of a displayed metric; the UI translates it. */
export type MetricUnit = (typeof METRIC_UNITS)[number];

/**
 * A metric ready to render. Numbers stay numeric so the UI can format them for the user's
 * locale (decimal comma in Spanish); times are already text since `4:35` is locale-neutral.
 */
export type DisplayMetric =
  | {
      readonly kind: 'number';
      readonly amount: number;
      readonly fractionDigits: number;
      /** `null` for plain counts (number of activities). */
      readonly unit: MetricUnit | null;
    }
  | { readonly kind: 'time'; readonly text: string; readonly unit: MetricUnit | null };

/** Context that changes how a metric is displayed. */
export interface DisplayContext {
  readonly unit: DistanceUnit;
  readonly sportFamily: SportFamily;
}

const METERS_PER_MILE = 1609.344;
const METERS_PER_YARD = 0.9144;
const FEET_PER_METER = 3.280_84;

/**
 * Converts a raw metric value (see {@link metricValue}) into display units.
 *
 * @throws RangeError for pace metrics with a non-positive speed, which has no pace.
 */
export function toDisplayMetric(
  metric: MetricId,
  value: number,
  context: DisplayContext,
): DisplayMetric {
  const imperial = context.unit === 'mi';
  switch (metric) {
    case 'distance':
      return imperial
        ? { kind: 'number', amount: value / METERS_PER_MILE, fractionDigits: 2, unit: 'mi' }
        : { kind: 'number', amount: value / 1000, fractionDigits: 2, unit: 'km' };
    case 'movingTime':
    case 'elapsedTime':
      return { kind: 'time', text: formatDuration(value), unit: null };
    case 'pace':
      return {
        kind: 'time',
        text: paceText(value, imperial ? METERS_PER_MILE : 1000),
        unit: imperial ? 'min/mi' : 'min/km',
      };
    case 'swimPace':
      return {
        kind: 'time',
        text: paceText(value, imperial ? 100 * METERS_PER_YARD : 100),
        unit: imperial ? 'min/100yd' : 'min/100m',
      };
    case 'speed':
      return imperial
        ? {
            kind: 'number',
            amount: (value * 3600) / METERS_PER_MILE,
            fractionDigits: 1,
            unit: 'mph',
          }
        : { kind: 'number', amount: value * 3.6, fractionDigits: 1, unit: 'km/h' };
    case 'elevationGain':
    case 'maxElevation':
      return imperial
        ? { kind: 'number', amount: value * FEET_PER_METER, fractionDigits: 0, unit: 'ft' }
        : { kind: 'number', amount: value, fractionDigits: 0, unit: 'm' };
    case 'averageHeartRate':
    case 'maxHeartRate':
      return { kind: 'number', amount: value, fractionDigits: 0, unit: 'bpm' };
    case 'averagePower':
    case 'weightedAveragePower':
      return { kind: 'number', amount: value, fractionDigits: 0, unit: 'W' };
    case 'averageCadence':
      // Strava reports running cadence for one leg; runners think in steps per minute.
      return context.sportFamily === 'run'
        ? { kind: 'number', amount: value * 2, fractionDigits: 0, unit: 'spm' }
        : { kind: 'number', amount: value, fractionDigits: 0, unit: 'rpm' };
    case 'calories':
      return { kind: 'number', amount: value, fractionDigits: 0, unit: 'kcal' };
  }
}

/** Unit of each pace once written with marks: the marks already say "min". */
const MARKED_PACE_UNITS: Partial<Record<MetricUnit, MetricUnit>> = {
  'min/km': '/km',
  'min/mi': '/mi',
  'min/100m': '/100m',
  'min/100yd': '/100yd',
};

/**
 * A pace written with minute and second marks, as sports watches do: `5'28"`, with the unit
 * left without "min" (`/km`). A pace of an hour or more reads `1h 05'30"`. Anything that is not
 * a pace comes back as it is. Time and space O(1).
 */
export function withPaceMarks(metric: DisplayMetric): DisplayMetric {
  const unit = metric.unit === null ? undefined : MARKED_PACE_UNITS[metric.unit];
  if (metric.kind !== 'time' || unit === undefined) {
    return metric;
  }
  const [seconds, minutes, hours] = metric.text.split(':').reverse();
  const marked = `${minutes}'${seconds}"`;
  return { kind: 'time', text: hours === undefined ? marked : `${hours}h ${marked}`, unit };
}

/** Whether a displayed metric is a pace, which can be written with marks. */
export function isPace(metric: DisplayMetric): boolean {
  return withPaceMarks(metric) !== metric;
}

function paceText(metersPerSecond: number, metersPerUnit: number): string {
  const text = formatPaceOver(metersPerSecond, metersPerUnit);
  if (text === null) {
    throw new RangeError(`No pace for speed ${metersPerSecond} m/s`);
  }
  return text;
}
