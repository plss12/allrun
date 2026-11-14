import type {
  ActivityDetail,
  ActivityLap,
  ActivitySplit,
  ActivityStreams,
} from './activity-detail';
import type { ActivityChartSeries } from './template';
import type { DistanceUnit } from './units';

/**
 * The data behind an activity's charts: its elevation profile, pace, heart rate and power along
 * the way, drawn as an area under a line, and its splits, drawn as bars.
 *
 * Streams hold a sample every second or so (thousands for a long run), far more than a chart
 * 1080 px wide can show, so lines are reduced to {@link LINE_POINTS} averages of equal stretches
 * of the activity. That also smooths the noise of single samples, and nothing more is smoothed:
 * every line shows its changes as Strava draws them (the owner's choice, the same for all).
 */

/**
 * Points of a line chart: a stretch of some 25 m in a 7.7 km run, so that a 15 s stride still
 * shows its pace (with 150, the owner's strides peaked at 2'49" against Strava's 2'36"); as cheap
 * to draw as 150 (the owner's choice: detail over smoothing).
 */
export const LINE_POINTS = 300;

/**
 * Below this speed (m/s) the athlete is stopped, and a pace means nothing: for streams without
 * Strava's own flag of when the athlete moved (`moving`).
 */
const MIN_MOVING_SPEED = 0.5;

/** A split shorter than this share of a kilometer or mile is too short to compare. */
const MIN_SPLIT_SHARE = 0.3;

/**
 * How a line's values go up its chart: `linear`, as they are; `pace`, speeds placed by their pace
 * (time per distance), the faster higher, as Strava draws a pace: a minute per kilometer is as
 * tall at 4:00 as at 7:00, where by speed the slow stretches would look flatter and the fast ones
 * steeper.
 */
export type LineScale = 'linear' | 'pace';

/**
 * How high a value goes on a line chart running from `min` to `max` (its series'), as a share of
 * its height: 0 at the bottom, 1 at `max`, with `floor` of the line's range left under `min` so
 * the area under it keeps some body; a flat line sits halfway. With the `pace` scale, values are
 * speeds (above 0) placed by their pace. Time and space O(1).
 */
export function lineLevel(
  value: number,
  { min, max }: { readonly min: number; readonly max: number },
  scale: LineScale,
  floor: number,
): number {
  const placed = (speedOrValue: number) =>
    scale === 'pace' ? -1 / Math.max(speedOrValue, Number.MIN_VALUE) : speedOrValue;
  const low = placed(min);
  const range = placed(max) - low;
  if (!(range > 0)) {
    return 0.5;
  }
  return (placed(value) - low + range * floor) / (range * (1 + floor));
}

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
  /**
   * The highest sample of the stream as drawn, before averaging (stops left out): a value the
   * activity really reached, for the chart's header when the source gives no maximum.
   */
  readonly peak: number;
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
  /** Meters and moving seconds of the row's splits together. */
  readonly distanceMeters: number;
  readonly movingTimeSeconds: number;
  /** Meters per second over the row's splits. */
  readonly speed: number;
  /** Change in altitude over the row's splits, in meters (0 for laps, which don't give it). */
  readonly elevationDifference: number;
  /** Beats per minute over the row's splits, or `null` when none of them has a heart rate. */
  readonly heartRate: number | null;
}

/**
 * The rows of splits drawn one under another: one per split, or, when there are more than
 * `maxRows`, as few groups of consecutive splits as fit (km 1–3, 4–6…), each with its overall
 * speed and its heart rate averaged over the time of the splits that have one. Time and space
 * O(s) for s splits.
 */
export function splitRows(
  splits: readonly (ActivityLap | ActivitySplit)[],
  maxRows: number,
): SplitRow[] {
  const size = Math.max(1, Math.ceil(splits.length / maxRows));
  const rows: SplitRow[] = [];
  for (let start = 0; start < splits.length; start += size) {
    const group = splits.slice(start, start + size);
    const meters = group.reduce((sum, split) => sum + split.distanceMeters, 0);
    const seconds = group.reduce((sum, split) => sum + split.movingTimeSeconds, 0);
    const timed = group.filter((split) => split.averageHeartRate !== null);
    const timedSeconds = timed.reduce((sum, split) => sum + split.movingTimeSeconds, 0);
    rows.push({
      first: start + 1,
      last: start + group.length,
      distanceMeters: meters,
      movingTimeSeconds: seconds,
      speed: seconds > 0 ? meters / seconds : 0,
      elevationDifference: group.reduce(
        (sum, split) =>
          sum + ('elevationDifferenceMeters' in split ? split.elevationDifferenceMeters : 0),
        0,
      ),
      heartRate:
        timedSeconds > 0
          ? timed.reduce(
              (sum, split) => sum + (split.averageHeartRate ?? 0) * split.movingTimeSeconds,
              0,
            ) / timedSeconds
          : null,
    });
  }
  return rows;
}

/**
 * The data of one chart of an activity, or `null` when the activity didn't record what it needs
 * (no heart rate monitor, no altitude on a treadmill, no splits without distance). A heart rate
 * runs along the time moving; the others along the distance, or the time without one. Time and
 * space O(n) for n samples.
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
        : lineSeries(streams, withoutStops(speed, streams.moving), 'distance');
    }
    case 'heartRate':
      // Along the time moving, as Strava counts its time in zones: each zone's stretch of the
      // line is as wide as the time spent in it.
      return streams.heartRate === null
        ? null
        : lineSeries(
            { ...streams, time: movingTime(streams.time, streams.moving) },
            whileMoving(streams.heartRate, streams.moving),
            'time',
          );
    case 'power':
      return lineSeries(streams, streams.power, axisOf(streams));
    case 'cadence':
      return lineSeries(streams, cadenceWhileMoving(streams), axisOf(streams));
  }
}

/**
 * The cadence where the athlete moved: stops (Strava's `moving`, when it has it) and samples
 * without a cadence (0: standing, coasting on a bike) are left out (`NaN`), so they don't drag
 * the line down. `null` without a cadence, or with none above 0. Time and space O(n).
 */
function cadenceWhileMoving(streams: ActivityStreams): number[] | null {
  const { cadence, moving } = streams;
  if (cadence === null) {
    return null;
  }
  const kept = cadence.map((value, i) =>
    value > 0 && (moving === null || moving.length !== cadence.length || moving[i])
      ? value
      : Number.NaN,
  );
  return kept.some((value) => !Number.isNaN(value)) ? kept : null;
}

/**
 * The charts an activity can show, in the order the editor offers them: the splits' bars first,
 * then the lines together, its pace, elevation, heart rate, power and cadence (the owner's
 * choice). Time O(n) for n samples.
 */
export function availableActivityCharts(
  detail: ActivityDetail,
  unit: DistanceUnit,
): ActivityChartSeries[] {
  const all: readonly ActivityChartSeries[] = [
    'splits',
    'pace',
    'elevation',
    'heartRate',
    'power',
    'cadence',
  ];
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
  const points = downsample(along, values, start, end, LINE_POINTS);
  if (points.length < 2) {
    return null;
  }
  const ys = points.map((point) => point.y);
  let peak = -Infinity;
  for (const value of values) {
    if (value > peak) {
      peak = value;
    }
  }
  return {
    kind: 'line',
    points,
    min: Math.min(...ys),
    max: Math.max(...ys),
    peak,
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
 * Speeds with the stops marked `NaN`, so they don't break the line; nothing else is left out, so
 * every change of pace keeps its zone's color (the owner's choice: the stream as it is). Stops
 * are where Strava says the athlete wasn't moving (`moving`, its own criterion, as its pace
 * leaves them out), or, without it, under {@link MIN_MOVING_SPEED}. Time and space O(n).
 *
 * @throws RangeError when `moving` and `speeds` differ in length.
 */
export function withoutStops(
  speeds: readonly number[],
  moving: readonly boolean[] | null = null,
): number[] {
  if (moving !== null && moving.length !== speeds.length) {
    throw new RangeError(
      `Expected as many moving flags as speeds, got ${moving.length} and ${speeds.length}`,
    );
  }
  return speeds.map((speed, i) =>
    (moving === null ? speed >= MIN_MOVING_SPEED : moving[i] && speed > 0) ? speed : Number.NaN,
  );
}

/**
 * Seconds moving up to each sample: each sample adds the time since the one before it when
 * Strava says the athlete moved then (`moving`), as Strava counts its time in zones; `time` as
 * it is without that flag. Time and space O(n).
 *
 * @throws RangeError when `moving` and `time` differ in length.
 */
export function movingTime(
  time: readonly number[],
  moving: readonly boolean[] | null,
): readonly number[] {
  if (moving === null) {
    return time;
  }
  if (moving.length !== time.length) {
    throw new RangeError(
      `Expected as many moving flags as times, got ${moving.length} and ${time.length}`,
    );
  }
  const along = [0];
  for (let i = 1; i < time.length; i++) {
    along.push(along[i - 1] + (moving[i] ? time[i] - time[i - 1] : 0));
  }
  return along;
}

/** `values` with the samples where Strava says the athlete stopped marked `NaN`. Time O(n). */
function whileMoving(values: readonly number[], moving: readonly boolean[] | null): number[] {
  return values.map((value, i) => (moving === null || moving[i] ? value : Number.NaN));
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
