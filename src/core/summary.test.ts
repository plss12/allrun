import { makeActivity } from '@/test-utils/make-activity';

import { customRange, monthRange, weekRange } from './dates';
import { bucketize, summarize } from './summary';

const week = weekRange('2026-10-14'); // Mon 12 to Sun 18 October 2026

describe('summarize', () => {
  it('returns zeros and no pace for an empty period', () => {
    expect(summarize([], week)).toEqual({
      range: week,
      activityCount: 0,
      totalDistanceMeters: 0,
      totalMovingTimeSeconds: 0,
      totalElevationGainMeters: 0,
      averageSpeed: null,
      longestActivity: null,
      routes: [],
    });
  });

  it('adds up the activities of the period, including both boundary days', () => {
    const activities = [
      makeActivity({ localDate: '2026-10-12', distanceMeters: 8000, movingTimeSeconds: 2400 }),
      makeActivity({ localDate: '2026-10-18', distanceMeters: 21_000, movingTimeSeconds: 6300 }),
      makeActivity({ localDate: '2026-10-11' }), // previous Sunday
      makeActivity({ localDate: '2026-10-19' }), // next Monday
    ];
    const summary = summarize(activities, week);
    expect(summary.activityCount).toBe(2);
    expect(summary.totalDistanceMeters).toBe(29_000);
    expect(summary.totalMovingTimeSeconds).toBe(8700);
    expect(summary.totalElevationGainMeters).toBe(100);
    expect(summary.averageSpeed).toBeCloseTo(29_000 / 8700);
    expect(summary.longestActivity?.distanceMeters).toBe(21_000);
  });

  it('keeps sessions without distance out of the average pace', () => {
    const summary = summarize(
      [
        makeActivity({ distanceMeters: 10_000, movingTimeSeconds: 3000 }),
        makeActivity({ sportType: 'WeightTraining', distanceMeters: 0, movingTimeSeconds: 3600 }),
      ],
      week,
    );
    expect(summary.totalMovingTimeSeconds).toBe(6600);
    expect(summary.averageSpeed).toBeCloseTo(10_000 / 3000);
  });

  it('picks the longest by time when nothing has distance', () => {
    const summary = summarize(
      [
        makeActivity({ sportType: 'Yoga', distanceMeters: 0, movingTimeSeconds: 1800 }),
        makeActivity({ sportType: 'WeightTraining', distanceMeters: 0, movingTimeSeconds: 4200 }),
      ],
      week,
    );
    expect(summary.longestActivity?.sportType).toBe('WeightTraining');
    expect(summary.averageSpeed).toBeNull();
  });

  it('filters by sport group', () => {
    const activities = [
      makeActivity({ sportType: 'Run' }),
      makeActivity({ sportType: 'TrailRun' }),
      makeActivity({ sportType: 'Ride', distanceMeters: 60_000 }),
    ];
    const summary = summarize(activities, week, { sportGroups: ['run'] });
    expect(summary.activityCount).toBe(2);
    expect(summary.totalDistanceMeters).toBe(20_000);
  });

  it('lists routes oldest first and skips activities without GPS', () => {
    const summary = summarize(
      [
        makeActivity({ localDate: '2026-10-15', routePolyline: 'second' }),
        makeActivity({ localDate: '2026-10-13', routePolyline: 'first' }),
        makeActivity({ localDate: '2026-10-14', routePolyline: null }),
      ],
      week,
    );
    expect(summary.routes).toEqual(['first', 'second']);
  });
});

describe('bucketize', () => {
  it('makes one bar per day, keeping empty days', () => {
    const buckets = bucketize(
      [
        makeActivity({ localDate: '2026-10-13', distanceMeters: 5000 }),
        makeActivity({ localDate: '2026-10-13', distanceMeters: 7000 }),
      ],
      week,
      'day',
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[1]).toMatchObject({ activityCount: 2, distanceMeters: 12_000 });
    expect(buckets[0]).toMatchObject({ activityCount: 0, distanceMeters: 0 });
  });

  it('counts weeks from the start of a custom training block', () => {
    const block = customRange('2026-08-12', '2026-10-18'); // Wednesday start, 68 days
    const buckets = bucketize(
      [
        makeActivity({ localDate: '2026-08-18', distanceMeters: 1000 }), // last day of week 1
        makeActivity({ localDate: '2026-08-19', distanceMeters: 2000 }), // first day of week 2
        makeActivity({ localDate: '2026-10-18', distanceMeters: 21_097 }), // race day
      ],
      block,
      'week',
    );
    expect(buckets).toHaveLength(10);
    expect(buckets[0]).toMatchObject({
      range: { start: '2026-08-12', end: '2026-08-18' },
      distanceMeters: 1000,
    });
    expect(buckets[1].distanceMeters).toBe(2000);
    expect(buckets[9]).toMatchObject({
      range: { start: '2026-10-14', end: '2026-10-18' }, // shorter last block
      distanceMeters: 21_097,
    });
  });

  it('splits by calendar month, clipped to the range', () => {
    const buckets = bucketize(
      [makeActivity({ localDate: '2026-02-28' }), makeActivity({ localDate: '2026-03-01' })],
      customRange('2026-01-15', '2026-03-10'),
      'month',
    );
    expect(buckets.map((bucket) => bucket.range)).toEqual([
      { start: '2026-01-15', end: '2026-01-31' },
      { start: '2026-02-01', end: '2026-02-28' },
      { start: '2026-03-01', end: '2026-03-10' },
    ]);
    expect(buckets.map((bucket) => bucket.activityCount)).toEqual([0, 1, 1]);
  });

  it('makes one bar per day for a whole month', () => {
    expect(bucketize([], monthRange('2026-02-10'), 'day')).toHaveLength(28);
  });
});
