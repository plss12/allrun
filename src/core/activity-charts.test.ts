import type { ActivityDetail, ActivitySplit, ActivityStreams } from './activity-detail';
import {
  activityChartSeries,
  availableActivityCharts,
  downsample,
  lineLevel,
  LINE_POINTS,
  movingTime,
  splitRows,
  withoutStops,
} from './activity-charts';

/** A steady 10 km run in 3000 samples: a hill in the middle, a stop at 5 km, a GPS spike. */
function streams(overrides: Partial<ActivityStreams> = {}): ActivityStreams {
  const count = 3000;
  const time = Array.from({ length: count }, (_, i) => i);
  const distance = time.map((t) => (t * 10_000) / (count - 1));
  return {
    time,
    distance,
    altitude: distance.map((meters) => 20 + 30 * Math.sin((Math.PI * meters) / 10_000)),
    speed: time.map((t) => (t === 1500 ? 30 : t >= 1490 && t < 1500 ? 0 : 3.3)),
    heartRate: time.map(() => 150),
    power: null,
    cadence: null,
    moving: null,
    ...overrides,
  };
}

const split = (
  distanceMeters: number,
  averageSpeed: number,
  elevationDifferenceMeters = 0,
  averageHeartRate: number | null = null,
): ActivitySplit => ({
  distanceMeters,
  movingTimeSeconds: distanceMeters / averageSpeed,
  elevationDifferenceMeters,
  averageSpeed,
  averageHeartRate,
});

function detail(overrides: Partial<ActivityDetail> = {}): ActivityDetail {
  return {
    streams: streams(),
    splits: {
      metric: [split(1000, 3.3), split(1000, 3.5), split(80, 2)],
      imperial: [split(1609.344, 3.4), split(400, 3.4)],
    },
    laps: [],
    ...overrides,
  };
}

describe('activityChartSeries', () => {
  it('draws the elevation profile along the distance, in fewer points', () => {
    const series = activityChartSeries(detail(), 'elevation', 'km');
    if (series?.kind !== 'line') {
      throw new Error('Expected a line');
    }
    expect(series.points).toHaveLength(LINE_POINTS);
    expect(series.axis).toBe('distance');
    expect(series.axisEnd).toBe(10_000);
    expect(series.min).toBeCloseTo(20, 0);
    expect(series.max).toBeCloseTo(50, 0);
  });

  it('leaves the stops out of the pace, and keeps the rest as it is, a spike too', () => {
    const series = activityChartSeries(detail(), 'pace', 'km');
    if (series?.kind !== 'line') {
      throw new Error('Expected a line');
    }
    expect(series.min).toBeCloseTo(3.3, 5);
    // The spike of 30 m/s, averaged with the 9 other samples of its stretch; the stream's own
    // highest sample is the spike itself.
    expect(series.max).toBeCloseTo((9 * 3.3 + 30) / 10, 5);
    expect(series.peak).toBe(30);
  });

  it('runs heart rate along the time moving, without the stops', () => {
    // Ten seconds stopped at 5 km, at 100 bpm, Strava's `moving` false.
    const moving = Array.from({ length: 3000 }, (_, t) => t < 1490 || t >= 1500);
    const heartRate = Array.from({ length: 3000 }, (_, t) => (moving[t] ? 150 : 100));
    const series = activityChartSeries(
      detail({ streams: streams({ moving, heartRate }) }),
      'heartRate',
      'km',
    );
    expect(series).toMatchObject({ kind: 'line', axis: 'time', axisEnd: 2989, min: 150 });
  });

  it('runs heart rate along the time when there is no distance', () => {
    const gym = detail({ streams: streams({ distance: null, altitude: null, speed: null }) });
    const series = activityChartSeries(gym, 'heartRate', 'km');
    expect(series).toMatchObject({ kind: 'line', axis: 'time', axisEnd: 2999 });
  });

  it('has nothing to draw without the stream, or with a flat profile', () => {
    expect(activityChartSeries(detail(), 'power', 'km')).toBeNull();
    expect(activityChartSeries(detail({ streams: null }), 'pace', 'km')).toBeNull();
    const treadmill = detail({ streams: streams({ altitude: streams().time.map(() => 12) }) });
    expect(activityChartSeries(treadmill, 'elevation', 'km')).toBeNull();
  });

  it('draws the splits of the unit, without a last one too short to compare', () => {
    expect(activityChartSeries(detail(), 'splits', 'km')).toMatchObject({
      kind: 'bars',
      values: [3.3, 3.5],
      average: 3.4,
    });
    // A single mile and 400 m: too few to compare.
    expect(activityChartSeries(detail(), 'splits', 'mi')).toBeNull();
  });
});

describe('availableActivityCharts', () => {
  it('offers the charts the activity recorded data for, the splits first, then the lines', () => {
    expect(availableActivityCharts(detail(), 'km')).toEqual([
      'splits',
      'pace',
      'elevation',
      'heartRate',
    ]);
    expect(availableActivityCharts(detail({ streams: null }), 'mi')).toEqual([]);
  });

  it('offers the cadence last, when the activity recorded one', () => {
    const cadence = Array.from({ length: 3000 }, () => 86);
    expect(availableActivityCharts(detail({ streams: streams({ cadence }) }), 'km')).toEqual([
      'splits',
      'pace',
      'elevation',
      'heartRate',
      'cadence',
    ]);
  });
});

describe('the cadence chart', () => {
  it('leaves out the stops and the samples without a cadence, which would drag it down', () => {
    const cadence = Array.from({ length: 3000 }, (_, t) => (t >= 1490 && t < 1500 ? 0 : 86));
    const moving = Array.from({ length: 3000 }, (_, t) => t < 1000 || t >= 1100);
    const strided = Array.from({ length: 3000 }, (_, t) => (t >= 1000 && t < 1100 ? 40 : 86));
    for (const series of [
      activityChartSeries(detail({ streams: streams({ cadence }) }), 'cadence', 'km'),
      activityChartSeries(
        detail({ streams: streams({ cadence: strided, moving }) }),
        'cadence',
        'km',
      ),
    ]) {
      expect(series?.kind).toBe('line');
      expect(series?.kind === 'line' ? series.min : 0).toBeCloseTo(86, 6);
      expect(series?.kind === 'line' ? series.axis : null).toBe('distance');
    }
  });

  it('has nothing to draw without a cadence, or with none above 0', () => {
    expect(activityChartSeries(detail(), 'cadence', 'km')).toBeNull();
    const still = Array.from({ length: 3000 }, () => 0);
    expect(
      activityChartSeries(detail({ streams: streams({ cadence: still }) }), 'cadence', 'km'),
    ).toBeNull();
  });
});

describe('splitRows', () => {
  it('makes a row per split while they fit', () => {
    expect(splitRows([split(1000, 4, 10, 150), split(1000, 5, -4)], 20)).toEqual([
      {
        first: 1,
        last: 1,
        distanceMeters: 1000,
        movingTimeSeconds: 250,
        speed: 4,
        elevationDifference: 10,
        heartRate: 150,
      },
      {
        first: 2,
        last: 2,
        distanceMeters: 1000,
        movingTimeSeconds: 200,
        speed: 5,
        elevationDifference: -4,
        heartRate: null,
      },
    ]);
  });

  it("averages a group's heart rate over the time of the splits that have one", () => {
    // 250 s at 140 and 200 s at 160; the split without a heart rate doesn't count.
    const [row] = splitRows([split(1000, 4, 0, 140), split(1000, 5, 0, 160), split(1000, 5)], 1);
    expect(row.heartRate).toBeCloseTo((250 * 140 + 200 * 160) / 450);
  });

  it('groups consecutive splits of a long activity, with their overall speed', () => {
    const rows = splitRows(
      Array.from({ length: 59 }, (_, i) => split(1000, i < 3 ? 10 : 8, 1)),
      20,
    );
    expect(rows).toHaveLength(20);
    expect(rows[0]).toEqual({
      first: 1,
      last: 3,
      distanceMeters: 3000,
      movingTimeSeconds: 300,
      speed: 10,
      elevationDifference: 3,
      heartRate: null,
    });
    expect(rows[19]).toMatchObject({ first: 58, last: 59, elevationDifference: 2 });
  });
});

describe('downsample', () => {
  it('averages equal stretches and skips gaps and left-out samples', () => {
    const along = [0, 1, 2, 3, 8, 9, 10];
    const values = [1, 3, Number.NaN, 5, 7, 9, 11];
    expect(downsample(along, values, 0, 10, 5)).toEqual([
      { x: 0.1, y: 2 },
      { x: 0.3, y: 5 },
      { x: 0.9, y: 9 },
    ]);
  });
});

describe('withoutStops', () => {
  it('marks the stops as left out, and nothing else', () => {
    const speeds = [0, 0.2, ...Array.from({ length: 98 }, () => 3), 40];
    const kept = withoutStops(speeds);
    expect(kept.slice(0, 2).every(Number.isNaN)).toBe(true);
    expect(kept.slice(2)).toEqual(speeds.slice(2));
  });

  it("leaves out the stops Strava marks, whatever the speed, and walks it doesn't", () => {
    const speeds = [0.3, 0.4, ...Array.from({ length: 96 }, () => 3), 2.9, 3.1];
    // A slow walk up a steep climb is moving; a GPS drift while stopped is not.
    const moving = speeds.map((_, i) => i !== 50);
    const kept = withoutStops(speeds, moving);
    expect(kept[0]).toBe(0.3);
    expect(kept[1]).toBe(0.4);
    expect(Number.isNaN(kept[50])).toBe(true);
    expect(kept.filter((speed) => speed === 3)).toHaveLength(95);
    expect(() => withoutStops(speeds, [true])).toThrow(RangeError);
  });

  it("uses Strava's stops for the pace chart when it has them", () => {
    // The test run stops at 5 km (speed 0); Strava flags those ten seconds and two more after.
    const moving = Array.from({ length: 3000 }, (_, t) => t < 1490 || t >= 1502);
    const flagged = activityChartSeries(detail({ streams: streams({ moving }) }), 'pace', 'km');
    const unflagged = activityChartSeries(detail(), 'pace', 'km');
    expect(flagged?.kind).toBe('line');
    expect(unflagged?.kind).toBe('line');
    // Both leave the stop out: the slowest point is as fast as the steady pace.
    expect(flagged?.kind === 'line' ? flagged.min : 0).toBeCloseTo(3.3, 6);
  });
});

describe('movingTime', () => {
  it('adds the time since the sample before only while moving', () => {
    expect(movingTime([0, 1, 2, 5, 6], [true, true, false, false, true])).toEqual([0, 1, 1, 1, 2]);
  });

  it('keeps the time as it is without the flag, and rejects one of another length', () => {
    const time = [0, 1, 2];
    expect(movingTime(time, null)).toBe(time);
    expect(() => movingTime(time, [true])).toThrow(RangeError);
  });
});

describe('lineLevel', () => {
  /** Meters per second of a pace of `minutes`:`seconds` per kilometer. */
  const pace = (minutes: number, seconds = 0) => 1000 / (minutes * 60 + seconds);

  it('puts the lowest value over the floor and the highest at the top', () => {
    const range = { min: 10, max: 20 };
    expect(lineLevel(20, range, 'linear', 0.15)).toBeCloseTo(1, 12);
    expect(lineLevel(10, range, 'linear', 0.15)).toBeCloseTo(0.15 / 1.15, 12);
    expect(lineLevel(15, range, 'linear', 0)).toBeCloseTo(0.5, 12);
  });

  it('places a pace by its time per kilometer, the faster higher, as Strava does', () => {
    const range = { min: pace(7), max: pace(4) };
    // A minute per kilometer is as tall at any pace: 5:00 and 6:00 split the range in thirds.
    expect(lineLevel(pace(4), range, 'pace', 0)).toBeCloseTo(1, 12);
    expect(lineLevel(pace(5), range, 'pace', 0)).toBeCloseTo(2 / 3, 12);
    expect(lineLevel(pace(6), range, 'pace', 0)).toBeCloseTo(1 / 3, 12);
    expect(lineLevel(pace(7), range, 'pace', 0)).toBeCloseTo(0, 12);
    // By speed, 6:00 sits lower, closer to 7:00: the slow stretches look flatter.
    expect(lineLevel(pace(6), range, 'linear', 0)).toBeCloseTo(2 / 9, 12);
  });

  it('sits a flat line halfway', () => {
    expect(lineLevel(3, { min: 3, max: 3 }, 'pace', 0.15)).toBe(0.5);
    expect(lineLevel(3, { min: 3, max: 3 }, 'linear', 0.15)).toBe(0.5);
  });
});
