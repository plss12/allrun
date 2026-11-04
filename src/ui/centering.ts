/** A shape's bounds. */
export interface ShapeBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * How far to move a shape so that its middle is the middle of a square of side `side` starting at
 * the origin: an icon's box says little of where its ink is (Material's trail runner is on a ground
 * of ours, low in its box).
 */
export function shiftToCenter(
  bounds: ShapeBounds,
  side: number,
): { readonly x: number; readonly y: number } {
  return {
    x: side / 2 - (bounds.x + bounds.width / 2),
    y: side / 2 - (bounds.y + bounds.height / 2),
  };
}
