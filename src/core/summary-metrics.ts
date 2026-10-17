import type { DisplayMetric } from './metrics';
import { toDisplayMetric } from './metrics';
import type { PeriodSummary } from './summary';
import { SUMMARY_METRIC_IDS, type SummaryMetricId } from './template';
import type { DistanceUnit } from './units';

/**
 * Raw value of a summary total, or `null` when the period has nothing to show for it (no
 * activities, or no distance for the average pace).
 */
export function summaryMetricValue(summary: PeriodSummary, metric: SummaryMetricId): number | null {
  switch (metric) {
    case 'totalDistance':
      return summary.totalDistanceMeters;
    case 'totalMovingTime':
      return summary.totalMovingTimeSeconds;
    case 'activityCount':
      return summary.activityCount;
    case 'totalElevationGain':
      return summary.totalElevationGainMeters;
    case 'averagePace':
      return summary.averageSpeed;
    case 'longestDistance':
      return summary.longestActivity?.distanceMeters ?? null;
  }
}

/**
 * Converts a summary total into display units, reusing the single-activity formatting (a total
 * distance looks like any distance). Activity counts are plain integers.
 *
 * Time totals drop the seconds and read as hours (`272:14 h`): a year of training runs into the
 * hundreds of hours, and `272:13:57` is both too long for the canvas and needlessly precise.
 */
export function toDisplaySummaryMetric(
  metric: SummaryMetricId,
  value: number,
  unit: DistanceUnit,
): DisplayMetric {
  const context = { unit, sportFamily: 'run' } as const;
  switch (metric) {
    case 'totalDistance':
    case 'longestDistance':
      return toDisplayMetric('distance', value, context);
    case 'totalMovingTime': {
      const minutes = Math.round(value / 60);
      const text = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
      return { kind: 'time', text, unit: 'h' };
    }
    case 'totalElevationGain':
      return toDisplayMetric('elevationGain', value, context);
    case 'averagePace':
      return toDisplayMetric('pace', value, context);
    case 'activityCount':
      return { kind: 'number', amount: value, fractionDigits: 0, unit: null };
  }
}

/** Totals measured over distance, meaningless when no activity of the period has any. */
const DISTANCE_METRICS: ReadonlySet<SummaryMetricId> = new Set([
  'totalDistance',
  'averagePace',
  'longestDistance',
]);

/**
 * Whether any activity of the period covered a distance. A month of gym sessions has none, and
 * showing "0.00 km" for it would only be noise. Time and space O(1).
 */
export function summaryHasDistance(summary: PeriodSummary): boolean {
  return summary.totalDistanceMeters > 0;
}

/**
 * The headline totals of a period: distance (when there is any), time and number of activities.
 * Both the summary preview and its default design show these. Time and space O(1).
 */
export function defaultSummaryMetrics(summary: PeriodSummary): SummaryMetricId[] {
  return summaryHasDistance(summary)
    ? ['totalDistance', 'totalMovingTime', 'activityCount']
    : ['totalMovingTime', 'activityCount'];
}

/**
 * Totals worth offering for a period, in the editor's order: distance-based ones only when it
 * has distance, elevation only when it climbed. Time and space O(1).
 */
export function availableSummaryMetrics(summary: PeriodSummary): SummaryMetricId[] {
  return SUMMARY_METRIC_IDS.filter((metric) => {
    if (DISTANCE_METRICS.has(metric)) {
      return summaryHasDistance(summary);
    }
    return metric !== 'totalElevationGain' || summary.totalElevationGainMeters > 0;
  });
}
