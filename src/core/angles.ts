/**
 * Angle helpers shared by layers and the photo. Worklets, so gestures run them on the UI thread.
 */

/** The same angle in (-π, π]. Time and space O(1). */
export function normalizeAngle(radians: number): number {
  'worklet';
  const turn = 2 * Math.PI;
  const angle = radians - turn * Math.floor((radians + Math.PI) / turn);
  // floor maps exactly π to -π; keep π, the closed end.
  return angle === -Math.PI ? Math.PI : angle;
}

/**
 * Snaps an angle to the nearest straight one (0°, 90°, 180°, -90°) when it is within
 * `threshold` radians of it. Time and space O(1).
 *
 * @returns The angle in (-π, π], snapped or not, and whether it snapped.
 */
export function snapAngle(
  radians: number,
  threshold: number,
): { readonly angle: number; readonly snapped: boolean } {
  'worklet';
  const quarter = Math.PI / 2;
  const straight = normalizeAngle(Math.round(radians / quarter) * quarter);
  const snapped = Math.abs(normalizeAngle(radians - straight)) <= threshold;
  return { angle: snapped ? straight : normalizeAngle(radians), snapped };
}
