import type { ActivityDetail, ActivitySplit, ActivityStreams } from './activity-detail';
import type { ActivityChartSeries } from './template';
import type { DistanceUnit } from './units';

/**
 * The data behind an activity's charts: its elevation profile, pace, heart rate and power along
 * the way, drawn as an area under a line, and its splits, drawn as bars.
 *
 * Streams hold a sample every second or so (thousands for a long run), far more than a chart
 * 1080 px wide can show, so lines are reduced to {@link LINE_POINTS} averages of equal stretches
 * of the activity. That also smooths the noise of single samples.
 */

/** Points of a line chart: enough for a smooth curve at any size on the canvas. */
export const LINE_POINTS = 150;

/** Below this speed (m/s) the athlete is stopped, and a pace means nothing. */
const MIN_MOVING_SPEED = 0.5;

/**
 * Share of the pace samples left out at each end, before averaging: GPS jumps and the last
 * steps of a stop make spikes that would flatten the rest of the line.
 */
const PACE_OUTLIERS = 0.02;

/** A split shorter than this share of a kilometer or mile is too short to compare. */
const MIN_SPLIT_SHARE = 0.3;

/**
 * Points averaged together to draw each one of a line (see {@link smooth}). Power changes with
 * every pedal stroke and pace with every step, so they need it most; heart rate lags behind the
 * effort and is smooth already; the elevation profile is drawn as recorded.
 */
const SMOOTHING = { pace: 5, heartRate: 3, power: 9 } as const;

/** What a line chart runs along: the distance covered, or the time for a gym session. */
export type ChartAxis = 'distance' | 'time';

/** One point of a line chart: how far along the activity (0..1) and the value there. */
export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * A line chart's data, in the stream's own units (meters, m/s, bpm, watts): the drawing scales it
 * between `min` and `max`. Pace is kept as a speed, so faster is higher, as sports apps draw it.
 */
export interface LineSeries {
  readonly kind: 'line';
  readonly points: readonly ChartPoint[];
  readonly min: number;
  readonly max: number;
  readonly average: number;
  readonly axis: ChartAxis;
  /** How far the axis runs: meters or seconds. */
  readonly axisEnd: number;
}

/** Splits as bars: the speed of each kilometer or mile, so faster is higher. */
export interface BarSeries {
  readonly kind: 'bars';
  readonly values: readonly number[];
  readonly average: number;
  /** The splits drawn, one per value. */
  readonly splits: readonly ActivitySplit[];
}

/** One row of the splits drawn as rows: a split, or several in a row of a long activity. */
export interface SplitRow {
  /** Number of the first split in the row, from 1, and of the last (the same for one split). */
  readonly first: number;
  readonly last: number;
  /** Meters per second over the row's splits. */
  readonly speed: number;
  /** Change in altitude over the row's splits, in meters. */
  readonly elevationDifference: number;
}

/**
 * The rows of splits drawn one under another: one per split, or, when there are more than
 * `maxRows`, as few groups of consecutive splits as fit (km 1–3, 4–6…), each with its overall
 * speed. Time and space O(s) for s splits.
 */
export function splitRows(splits: readonly ActivitySplit[], maxRows: number): SplitRow[] {
  const size = Math.max(1, Math.ceil(splits.length / maxRows));
  const rows: SplitRow[] = [];
  for (let start = 0; start < splits.length; start += size) {
    const group = splits.slice(start, start + size);
    const meters = group.reduce((sum, split) => sum + split.distanceMeters, 0);
    const seconds = group.reduce((sum, split) => sum + split.movingTimeSeconds, 0);
    rows.push({
      first: start + 1,
      last: start + group.length,
      speed: seconds > 0 ? meters / seconds : 0,
      elevationDifference: group.reduce((sum, split) => sum + split.elevationDifferenceMeters, 0),
    });
  }
  return rows;
}

/**
 * The data of one chart of an activity, or `null` when the activity didn't record what it needs
 * (no heart rate monitor, no altitude on a treadmill, no splits without distance). Time O(n log n)
 * for n samples (the pace sorts its samples to drop outliers), space O(n).
 */
export function activityChartSeries(
  detail: ActivityDetail,
  series: ActivityChartSeries,
  unit: DistanceUnit,
): LineSeries | BarSeries | null {
  if (series === 'splits') {
    return splitSeries(unit === 'mi' ? detail.splits.imperial : detail.splits.metric, unit);
  }
  const streams = detail.streams;
  if (streams === null) {
    return null;
  }
  switch (series) {
    case 'elevation': {
      // An elevation profile runs along the distance; a flat one (a treadmill) says nothing.
      const line = lineSeries(streams, streams.altitude, 'distance');
      return line !== null && line.max - line.min >= 1 ? line : null;
    }
    case 'pace': {
      const speed = streams.speed;
      return speed === null
        ? null
        : lineSeries(streams, withoutOutliers(speed), 'distance', SMOOTHING.pace);
    }
    case 'heartRate':
      return lineSeries(streams, streams.heartRate, axisOf(streams), SMOOTHING.heartRate);
    case 'power':
      return lineSeries(streams, streams.power, axisOf(streams), SMOOTHING.power);
  }
}

/** The charts an activity can show, in the order the editor offers them. Time O(n log n). */
export function availableActivityCharts(
  detail: ActivityDetail,
  unit: DistanceUnit,
): ActivityChartSeries[] {
  const all: readonly ActivityChartSeries[] = ['elevation', 'pace', 'splits', 'heartRate', 'power'];
  return all.filter((series) => activityChartSeries(detail, series, unit) !== null);
}

/** Distance when the activity covered any, else time. */
function axisOf(streams: ActivityStreams): ChartAxis {
  const distance = streams.distance;
  return distance !== null && distance.length > 0 && distance[distance.length - 1] > 0
    ? 'distance'
    : 'time';
}

/**
 * A stream as a line along the distance or the time: `null` for a missing stream, or one without
 * any value to draw (`NaN` marks samples left out, such as stops in a pace).
 */
function lineSeries(
  streams: ActivityStreams,
  values: readonly number[] | null,
  axis: ChartAxis,
  smoothing = 1,
): LineSeries | null {
  const along = axis === 'distance' ? streams.distance : streams.time;
  if (values === null || along === null || along.length !== values.length || along.length < 2) {
    return null;
  }
  const start = along[0];
  const end = along[along.length - 1];
  if (!(end > start)) {
    return null;
  }
  const points = smooth(downsample(along, values, start, end, LINE_POINTS), smoothing);
  if (points.length < 2) {
    return null;
  }
  const ys = points.map((point) => point.y);
  return {
    kind: 'line',
    points,
    min: Math.min(...ys),
    max: Math.max(...ys),
    average: ys.reduce((sum, y) => sum + y, 0) / ys.length,
    axis,
    axisEnd: end - start,
  };
}

/**
 * Averages of `values` over `count` equal stretches of `along` (start..end), as points with
 * their position (0..1) at the middle of each stretch. Stretches without samples (a GPS gap) are
 * skipped, as are samples marked `NaN`. Time O(n + count), space O(count).
 */
export function downsample(
  along: readonly number[],
  values: readonly number[],
  start: number,
  end: number,
  count: number,
): ChartPoint[] {
  const sums = new Array<number>(count).fill(0);
  const counts = new Array<number>(count).fill(0);
  const span = end - start;
  for (let i = 0; i < along.length; i++) {
    const value = values[i];
    if (Number.isNaN(value)) {
      continue;
    }
    const bucket = Math.min(
      count - 1,
      Math.max(0, Math.floor(((along[i] - start) / span) * count)),
    );
    sums[bucket] += value;
    counts[bucket] += 1;
  }
  const points: ChartPoint[] = [];
  for (let bucket = 0; bucket < count; bucket++) {
    if (counts[bucket] > 0) {
      points.push({ x: (bucket + 0.5) / count, y: sums[bucket] / counts[bucket] });
    }
  }
  return points;
}

/**
 * A centered moving average of `window` points (an odd number; fewer at the ends), which keeps
 * the shape and drops the jitter. Time O(n · window), space O(n).
 */
export function smooth(points: readonly ChartPoint[], window: number): ChartPoint[] {
  const half = Math.floor(window / 2);
  return points.map((point, i) => {
    const near = points.slice(Math.max(0, i - half), i + half + 1);
    return { x: point.x, y: near.reduce((sum, p) => sum + p.y, 0) / near.length };
  });
}

/**
 * Speeds with stops and the extreme {@link PACE_OUTLIERS} at each end marked `NaN`, so they
 * neither break the line nor squash it. Time O(n log n), space O(n).
 */
export function withoutOutliers(speeds: readonly number[]): number[] {
  const moving = speeds.filter((speed) => speed >= MIN_MOVING_SPEED).sort((a, b) => a - b);
  if (moving.length === 0) {
    return speeds.map(() => Number.NaN);
  }
  const low = moving[Math.floor(PACE_OUTLIERS * (moving.length - 1))];
  const high = moving[Math.ceil((1 - PACE_OUTLIERS) * (moving.length - 1))];
  return speeds.map((speed) =>
    speed >= MIN_MOVING_SPEED && speed >= low && speed <= high ? speed : Number.NaN,
  );
}

/**
 * Splits as bars, leaving out a last one too short to compare (the 80 m after the 16th km). At
 * least two bars, or `null`. Time and space O(s) for s splits.
 */
function splitSeries(splits: readonly ActivitySplit[], unit: DistanceUnit): BarSeries | null {
  const length = unit === 'mi' ? 1609.344 : 1000;
  const kept = splits.filter(
    (split, i) =>
      split.averageSpeed > 0 &&
      (i < splits.length - 1 || split.distanceMeters >= MIN_SPLIT_SHARE * length),
  );
  if (kept.length < 2) {
    return null;
  }
  const values = kept.map((split) => split.averageSpeed);
  return {
    kind: 'bars',
    values,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    splits: kept,
  };
}
