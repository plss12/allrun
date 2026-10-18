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

const HEART_RATE: readonly MetricId[] = ['averageHeartRate', 'maxHeartRate'];
const POWER: readonly MetricId[] = ['averagePower', 'weightedAveragePower'];

/**
 * Metrics offered for each modality, in the order the editor lists them.
 *
 * Each modality leads with what matters for it: pace on the road, elevation on trails and hikes,
 * speed and power on the bike, pace per 100 m in the pool. Indoor modalities skip what they
 * can't measure. `other` is the generic profile and only shows what the activity has.
 */
const PROFILES: Readonly<Record<SportModality, readonly MetricId[]>> = {
  roadRun: [
    'distance',
    'movingTime',
    'pace',
    'elevationGain',
    'maxElevation',
    ...HEART_RATE,
    'averageCadence',
    'calories',
    'elapsedTime',
  ],
  trailRun: [
    'distance',
    'elevationGain',
    'movingTime',
    'maxElevation',
    'pace',
    ...HEART_RATE,
    'averageCadence',
    'calories',
    'elapsedTime',
  ],
  treadmillRun: ['distance', 'movingTime', 'pace', ...HEART_RATE, 'averageCadence', 'calories'],
  walk: [
    'distance',
    'movingTime',
    'pace',
    'elevationGain',
    ...HEART_RATE,
    'calories',
    'elapsedTime',
  ],
  hike: [
    'distance',
    'elevationGain',
    'maxElevation',
    'movingTime',
    'elapsedTime',
    'pace',
    ...HEART_RATE,
    'calories',
  ],
  roadRide: [
    'distance',
    'movingTime',
    'speed',
    'elevationGain',
    ...POWER,
    ...HEART_RATE,
    'averageCadence',
    'maxElevation',
    'calories',
    'elapsedTime',
  ],
  mountainBikeRide: [
    'distance',
    'elevationGain',
    'movingTime',
    'maxElevation',
    'speed',
    ...HEART_RATE,
    ...POWER,
    'averageCadence',
    'calories',
    'elapsedTime',
  ],
  gravelRide: [
    'distance',
    'movingTime',
    'speed',
    'elevationGain',
    'maxElevation',
    ...POWER,
    ...HEART_RATE,
    'averageCadence',
    'calories',
    'elapsedTime',
  ],
  eBikeRide: [
    'distance',
    'movingTime',
    'speed',
    'elevationGain',
    'maxElevation',
    ...HEART_RATE,
    'calories',
    'elapsedTime',
  ],
  // Virtual platforms (Zwift and similar) simulate elevation, so it stays.
  indoorRide: [
    'movingTime',
    'distance',
    'speed',
    ...POWER,
    'elevationGain',
    ...HEART_RATE,
    'averageCadence',
    'calories',
  ],
  swim: ['distance', 'movingTime', 'swimPace', ...HEART_RATE, 'calories', 'elapsedTime'],
  // Sessions measured in time and effort; a cardio machine's distance is rarely real.
  workout: ['movingTime', ...HEART_RATE, 'calories', 'elapsedTime'],
  other: [
    'movingTime',
    'elapsedTime',
    'distance',
    'speed',
    'elevationGain',
    ...HEART_RATE,
    'averagePower',
    'calories',
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

/** Unit label key of a displayed metric; the UI translates it. */
export type MetricUnit =
  | 'km'
  | 'mi'
  | 'm'
  | 'ft'
  | 'min/km'
  | 'min/mi'
  | 'min/100m'
  | 'min/100yd'
  | '/km'
  | '/mi'
  | '/100m'
  | '/100yd'
  | 'km/h'
  | 'mph'
  | 'bpm'
  | 'W'
  | 'spm'
  | 'rpm'
  | 'kcal'
  | 'h';

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
