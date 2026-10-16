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
    expect(toDisplaySummaryMetric('averagePace', 1000 / 300, 'km')).toMatchObject({
      text: '5:00',
      unit: 'min/km',
    });
  });

  it('shows time totals as hours and minutes, without seconds', () => {
    expect(toDisplaySummaryMetric('totalMovingTime', 9600, 'km')).toEqual({
      kind: 'time',
      text: '2:40',
      unit: 'h',
    });
    // A year of training: 272 h 13 min 57 s rounds to 272:14.
    expect(
      toDisplaySummaryMetric('totalMovingTime', 272 * 3600 + 13 * 60 + 57, 'km'),
    ).toMatchObject({ text: '272:14' });
    expect(toDisplaySummaryMetric('totalMovingTime', 45 * 60, 'km')).toMatchObject({
      text: '0:45',
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
