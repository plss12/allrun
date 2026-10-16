import type { Activity } from './activity';
import type { SportGroup } from './sports';
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

/**
 * Metrics offered for each sport group, in the order the editor lists them.
 *
 * Each sport shows what matters for it (pace for running, speed and power for cycling, pace per
 * 100 m for swimming); `other` is the generic profile and only shows what the activity has.
 */
const PROFILES: Readonly<Record<SportGroup, readonly MetricId[]>> = {
  run: [
    'distance',
    'movingTime',
    'pace',
    'elevationGain',
    'maxElevation',
    'averageHeartRate',
    'maxHeartRate',
    'averageCadence',
    'calories',
    'elapsedTime',
  ],
  ride: [
    'distance',
    'movingTime',
    'speed',
    'elevationGain',
    'maxElevation',
    'averagePower',
    'weightedAveragePower',
    'averageHeartRate',
    'maxHeartRate',
    'averageCadence',
    'calories',
    'elapsedTime',
  ],
  walk: [
    'distance',
    'movingTime',
    'pace',
    'elevationGain',
    'maxElevation',
    'averageHeartRate',
    'maxHeartRate',
    'calories',
    'elapsedTime',
  ],
  swim: [
    'distance',
    'movingTime',
    'swimPace',
    'averageHeartRate',
    'maxHeartRate',
    'calories',
    'elapsedTime',
  ],
  other: [
    'movingTime',
    'elapsedTime',
    'distance',
    'speed',
    'elevationGain',
    'averageHeartRate',
    'maxHeartRate',
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
  return PROFILES[activity.sportGroup].filter((metric) => {
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
  | 'km/h'
  | 'mph'
  | 'bpm'
  | 'W'
  | 'spm'
  | 'rpm'
  | 'kcal';

/**
 * A metric ready to render. Numbers stay numeric so the UI can format them for the user's
 * locale (decimal comma in Spanish); times are already text since `4:35` is locale-neutral.
 */
export type DisplayMetric =
  | {
      readonly kind: 'number';
      readonly amount: number;
      readonly fractionDigits: number;
      readonly unit: MetricUnit;
    }
  | { readonly kind: 'time'; readonly text: string; readonly unit: MetricUnit | null };

/** Context that changes how a metric is displayed. */
export interface DisplayContext {
  readonly unit: DistanceUnit;
  readonly sportGroup: SportGroup;
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
      return context.sportGroup === 'run'
        ? { kind: 'number', amount: value * 2, fractionDigits: 0, unit: 'spm' }
        : { kind: 'number', amount: value, fractionDigits: 0, unit: 'rpm' };
    case 'calories':
      return { kind: 'number', amount: value, fractionDigits: 0, unit: 'kcal' };
  }
}

function paceText(metersPerSecond: number, metersPerUnit: number): string {
  const text = formatPaceOver(metersPerSecond, metersPerUnit);
  if (text === null) {
    throw new RangeError(`No pace for speed ${metersPerSecond} m/s`);
  }
  return text;
}
