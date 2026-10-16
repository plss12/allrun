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
