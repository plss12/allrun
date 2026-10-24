import { makeActivity } from '@/test-utils/make-activity';

import { weekRange } from './dates';
import { summarize } from './summary';
import {
  availableSummaryMetrics,
  defaultSummaryMetrics,
  periodTotals,
  summaryHasDistance,
  summaryMetricValue,
  toDisplaySummaryMetric,
} from './summary-metrics';

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

describe('which totals a summary shows', () => {
  const run = makeActivity({ distanceMeters: 10_000, elevationGainMeters: 120 });
  const gym = makeActivity({
    sportType: 'WeightTraining',
    distanceMeters: 0,
    elevationGainMeters: 0,
    routePolyline: null,
    localDate: '2026-10-16',
  });
  const flatSwim = makeActivity({
    sportType: 'Swim',
    distanceMeters: 2000,
    elevationGainMeters: 0,
    routePolyline: null,
  });

  it('shows distance, time and count, the distance only when some activity has it', () => {
    expect(defaultSummaryMetrics(summarize([run, gym], week))).toEqual([
      'totalDistance',
      'totalMovingTime',
      'activityCount',
    ]);
    expect(summaryHasDistance(summarize([gym], week))).toBe(false);
    expect(defaultSummaryMetrics(summarize([gym], week))).toEqual([
      'totalMovingTime',
      'activityCount',
    ]);
  });

  it('offers distance totals only with distance, and elevation only when there is some', () => {
    expect(availableSummaryMetrics(summarize([run], week))).toEqual([
      'totalDistance',
      'totalMovingTime',
      'activityCount',
      'totalElevationGain',
      'longestDistance',
    ]);
    expect(availableSummaryMetrics(summarize([flatSwim], week))).toEqual([
      'totalDistance',
      'totalMovingTime',
      'activityCount',
      'longestDistance',
    ]);
    expect(availableSummaryMetrics(summarize([gym], week))).toEqual([
      'totalMovingTime',
      'activityCount',
    ]);
  });

  it('never offers the average pace, which means nothing over mixed activities', () => {
    expect(availableSummaryMetrics(summarize([run, flatSwim], week))).not.toContain('averagePace');
  });

  it('writes the three most important totals the period has over its charts', () => {
    expect(periodTotals(summarize([run], week))).toEqual([
      'totalDistance',
      'totalMovingTime',
      'totalElevationGain',
    ]);
    expect(periodTotals(summarize([flatSwim], week))).toEqual([
      'totalDistance',
      'totalMovingTime',
      'activityCount',
    ]);
    expect(periodTotals(summarize([gym], week))).toEqual(['totalMovingTime', 'activityCount']);
  });

  it('writes first the total of what the chart draws', () => {
    expect(periodTotals(summarize([run], week), 'totalMovingTime')).toEqual([
      'totalMovingTime',
      'totalDistance',
      'totalElevationGain',
    ]);
    // A lead the period hasn't is left out.
    expect(periodTotals(summarize([gym], week), 'totalDistance')).toEqual([
      'totalMovingTime',
      'activityCount',
    ]);
  });
});
