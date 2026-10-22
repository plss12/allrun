import type { ActivityDetail, ActivitySplit, ActivityStreams } from './activity-detail';
import {
  activityChartSeries,
  availableActivityCharts,
  downsample,
  LINE_POINTS,
  splitRows,
  withoutOutliers,
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

  it('leaves stops and spikes out of the pace', () => {
    const series = activityChartSeries(detail(), 'pace', 'km');
    if (series?.kind !== 'line') {
      throw new Error('Expected a line');
    }
    expect(series.max).toBeCloseTo(3.3, 5);
    expect(series.min).toBeCloseTo(3.3, 5);
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
  it('offers the charts the activity recorded data for, in order', () => {
    expect(availableActivityCharts(detail(), 'km')).toEqual([
      'elevation',
      'pace',
      'splits',
      'heartRate',
    ]);
    expect(availableActivityCharts(detail({ streams: null }), 'mi')).toEqual([]);
  });
});

describe('splitRows', () => {
  it('makes a row per split while they fit', () => {
    expect(splitRows([split(1000, 4, 10, 150), split(1000, 5, -4)], 20)).toEqual([
      { first: 1, last: 1, speed: 4, elevationDifference: 10, heartRate: 150 },
      { first: 2, last: 2, speed: 5, elevationDifference: -4, heartRate: null },
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

describe('withoutOutliers', () => {
  it('marks stops and the extremes as left out', () => {
    const speeds = [0, 0.2, ...Array.from({ length: 98 }, () => 3), 40];
    const kept = withoutOutliers(speeds);
    expect(kept.slice(0, 2).every(Number.isNaN)).toBe(true);
    expect(Number.isNaN(kept[kept.length - 1])).toBe(true);
    expect(kept.filter((speed) => speed === 3)).toHaveLength(98);
  });
});
