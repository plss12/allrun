import type { DisplayMetric } from './metrics';
import { toDisplayMetric } from './metrics';
import type { PeriodSummary } from './summary';
import type { SummaryMetricId } from './template';
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
 * Time totals use hours and minutes (`h:mm:ss`), which reads well up to several hundred hours.
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
    case 'totalMovingTime':
      return toDisplayMetric('movingTime', value, context);
    case 'totalElevationGain':
      return toDisplayMetric('elevationGain', value, context);
    case 'averagePace':
      return toDisplayMetric('pace', value, context);
    case 'activityCount':
      return { kind: 'number', amount: value, fractionDigits: 0, unit: null };
  }
}
