import { makeActivity } from '@/test-utils/make-activity';

import { customRange, monthRange, weekRange } from './dates';
import { bucketize, familiesOf, summarize, summaryPages } from './summary';

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

  describe('sport filter', () => {
    const activities = [
      makeActivity({ sportType: 'Run' }),
      makeActivity({ sportType: 'TrailRun', distanceMeters: 15_000 }),
      makeActivity({ sportType: 'VirtualRun', distanceMeters: 8000 }),
      makeActivity({ sportType: 'Hike', distanceMeters: 12_000 }),
      makeActivity({ sportType: 'Ride', distanceMeters: 60_000 }),
    ];

    it('includes a whole family, trail and treadmill runs included', () => {
      const summary = summarize(activities, week, { families: ['run'] });
      expect(summary.activityCount).toBe(3);
      expect(summary.totalDistanceMeters).toBe(33_000);
    });

    it('includes a single modality', () => {
      const summary = summarize(activities, week, { modalities: ['trailRun'] });
      expect(summary.totalDistanceMeters).toBe(15_000);
    });

    it('combines families and modalities', () => {
      const summary = summarize(activities, week, { families: ['run'], modalities: ['hike'] });
      expect(summary.activityCount).toBe(4);
      expect(summary.totalDistanceMeters).toBe(45_000);
    });

    it('includes everything without a filter and nothing with empty lists', () => {
      expect(summarize(activities, week).activityCount).toBe(5);
      expect(summarize(activities, week, { families: [], modalities: [] }).activityCount).toBe(0);
    });
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

describe('familiesOf and summaryPages', () => {
  const run = makeActivity({ localDate: '2026-10-13', sportType: 'Run' });
  const hike = makeActivity({ localDate: '2026-10-14', sportType: 'Hike' });
  const yoga = makeActivity({ localDate: '2026-10-15', sportType: 'Yoga' });
  const climb = makeActivity({ localDate: '2026-10-19', sportType: 'RockClimbing' });

  it('lists each family once, in the usual order', () => {
    expect(familiesOf([yoga, climb, run, hike, run])).toEqual(['run', 'walk', 'training', 'other']);
    expect(familiesOf([])).toEqual([]);
  });

  it('pages all sports first, then each family of the period', () => {
    expect(summaryPages([yoga, run, hike, climb], week)).toEqual([
      'all',
      'run',
      'walk',
      'training',
    ]);
  });

  it('pages a single family alone, and an empty period as all sports', () => {
    expect(summaryPages([run, run], week)).toEqual(['run']);
    expect(summaryPages([climb], week)).toEqual(['all']);
  });
});
