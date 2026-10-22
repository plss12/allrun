import type { Point } from './route-projection';

/**
 * Where each value of a line chart goes in a `width` × `height` box: evenly spaced from the left
 * edge to the right one (a single value in the middle), from zero at the bottom to the highest
 * value at the top. With nothing above zero, every point sits on the bottom.
 * Time and space O(n).
 */
export function lineChartPoints(values: readonly number[], width: number, height: number): Point[] {
  const max = Math.max(0, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((value, i) => ({
    x: values.length > 1 ? i * step : width / 2,
    y: max > 0 ? height - (Math.max(0, value) / max) * height : height,
  }));
}

/**
 * Index of the highest value, the first one on a tie, to mark it on the chart; `null` when no
 * value is above zero. Time O(n), space O(1).
 */
export function peakIndex(values: readonly number[]): number | null {
  let peak: number | null = null;
  values.forEach((value, i) => {
    if (value > 0 && (peak === null || value > values[peak])) {
      peak = i;
    }
  });
  return peak;
}
