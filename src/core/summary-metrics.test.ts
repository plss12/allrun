import { makeActivity } from '@/test-utils/make-activity';

import { weekRange } from './dates';
import { summarize } from './summary';
import { summaryMetricValue, toDisplaySummaryMetric } from './summary-metrics';

const week = weekRange('2026-10-14');

describe('summaryMetricValue', () => {
  const summary = summarize(
    [
      makeActivity({ distanceMeters: 10_000, movingTimeSeconds: 3000 }),
      makeActivity({ distanceMeters: 21_100, movingTimeSeconds: 6600, localDate: '2026-10-18' }),
    ],
    week,
  );

  it('reads every total from the period summary', () => {
    expect(summaryMetricValue(summary, 'totalDistance')).toBe(31_100);
    expect(summaryMetricValue(summary, 'totalMovingTime')).toBe(9600);
    expect(summaryMetricValue(summary, 'activityCount')).toBe(2);
    expect(summaryMetricValue(summary, 'totalElevationGain')).toBe(100);
    expect(summaryMetricValue(summary, 'averagePace')).toBeCloseTo(31_100 / 9600);
    expect(summaryMetricValue(summary, 'longestDistance')).toBe(21_100);
  });

  it('has no pace or longest activity for an empty period', () => {
    const empty = summarize([], week);
    expect(summaryMetricValue(empty, 'averagePace')).toBeNull();
    expect(summaryMetricValue(empty, 'longestDistance')).toBeNull();
    expect(summaryMetricValue(empty, 'activityCount')).toBe(0);
  });
});

describe('toDisplaySummaryMetric', () => {
  it('formats totals like single-activity metrics', () => {
    expect(toDisplaySummaryMetric('totalDistance', 31_100, 'km')).toMatchObject({
      amount: 31.1,
      unit: 'km',
    });
    expect(toDisplaySummaryMetric('totalMovingTime', 9600, 'km')).toEqual({
      kind: 'time',
      text: '2:40:00',
      unit: null,
    });
    expect(toDisplaySummaryMetric('averagePace', 1000 / 300, 'km')).toMatchObject({
      text: '5:00',
      unit: 'min/km',
    });
  });

  it('shows activity counts as plain integers', () => {
    expect(toDisplaySummaryMetric('activityCount', 12, 'mi')).toEqual({
      kind: 'number',
      amount: 12,
      fractionDigits: 0,
      unit: null,
    });
  });
});
