import { normalizeAngle, snapAngle } from './angles';
import type { Size } from './photo-placement';
import type { Layer } from './template';

/**
 * Moving, scaling and rotating layers with the fingers, snapping them to the canvas center and
 * edges, and finding which layer a touch lands on.
 *
 * Like `photo-placement.ts`, every function is a worklet so gestures run it on the UI thread, and
 * helpers are defined before the functions that use them (worklets aren't hoisted).
 */

export type LayerTransform = Layer['transform'];

/** Scale limits of the template schema. */
export const MIN_LAYER_SCALE = 0.1;
export const MAX_LAYER_SCALE = 10;

/**
 * Room around a layer's content, in canvas pixels (of 1080): its selection frame in the editor,
 * and the air it keeps from an edge it snaps to, so text never ends up touching the border. In
 * canvas pixels, not screen points, so exports look the same whatever the phone.
 *
 * The frame is the content box grown by this margin with corners rounded by the same radius:
 * every point within `LAYER_MARGIN` of the content. Its reach in any direction is therefore the
 * content's reach plus the margin, also when rotated, which is what edge snapping uses.
 */
export const LAYER_MARGIN = 24;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/**
 * Moves a layer by (`dx`, `dy`) canvas pixels. Its center stays on the canvas: a layer can go
 * half out of view but never be lost off-screen. Time and space O(1).
 */
export function translateLayer(
  transform: LayerTransform,
  canvas: Size,
  dx: number,
  dy: number,
): LayerTransform {
  'worklet';
  return {
    ...transform,
    x: clamp(transform.x + dx / canvas.width, 0, 1),
    y: clamp(transform.y + dy / canvas.height, 0, 1),
  };
}

/**
 * Scales a layer by `factor` around its center, within the schema limits. Factors that are not
 * positive (the first event of some pinches) leave it unchanged. Time and space O(1).
 */
export function scaleLayer(transform: LayerTransform, factor: number): LayerTransform {
  'worklet';
  if (!(factor > 0)) {
    return transform;
  }
  return {
    ...transform,
    scale: clamp(transform.scale * factor, MIN_LAYER_SCALE, MAX_LAYER_SCALE),
  };
}

/** Rotates a layer clockwise by `radians` around its center. Time and space O(1). */
export function rotateLayer(transform: LayerTransform, radians: number): LayerTransform {
  'worklet';
  return { ...transform, rotation: normalizeAngle(transform.rotation + radians) };
}

/** How close a layer must be to snap: canvas pixels for lines, radians for angles. */
export interface SnapThresholds {
  readonly distance: number;
  readonly rotation: number;
}

/**
 * Where a layer snapped on one axis: its leading edge on the canvas's leading edge (left or
 * top), its center on the canvas center, its trailing edge on the trailing edge, or nowhere.
 */
export type SnapLine = 'none' | 'start' | 'center' | 'end';

export interface SnapResult {
  readonly transform: LayerTransform;
  /** Horizontal snap: on a vertical line (left edge, center or right edge). */
  readonly x: SnapLine;
  /** Vertical snap: on a horizontal line (top edge, center or bottom edge). */
  readonly y: SnapLine;
  /** Straight: rotation at a multiple of 90°. */
  readonly rotation: boolean;
}

/**
 * Snaps the center of a layer whose half-extent on the axis is `half` (canvas pixels) to the
 * closest of the canvas center and its two edges within `threshold`.
 */
function snapAxis(
  center: number,
  half: number,
  length: number,
  threshold: number,
): { readonly center: number; readonly line: SnapLine } {
  'worklet';
  let best: { center: number; line: SnapLine } = { center, line: 'none' };
  let bestDistance = threshold;
  const candidates: readonly { center: number; line: SnapLine }[] = [
    { center: length / 2, line: 'center' },
    { center: half, line: 'start' },
    { center: length - half, line: 'end' },
  ];
  for (const candidate of candidates) {
    const distance = Math.abs(center - candidate.center);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Snaps a layer that the fingers left close to a straight angle, to the canvas center lines or
 * to the canvas edges. `size` is the layer content before scaling; `margin` (canvas pixels) is
 * the room around the scaled content, so a layer snapped to an edge keeps that much air from it
 * (see {@link LAYER_MARGIN}). Edges use how far the rotated content reaches, so a tilted text
 * touches the edge with its corner, and its rounded selection frame touches it exactly.
 *
 * Gestures keep the unsnapped transform and snap a copy every frame, so a layer leaves a snap as
 * soon as the fingers move past the threshold: it sticks to an edge, yet can still be pushed
 * out of view. Time and space O(1).
 */
export function snapLayer(
  transform: LayerTransform,
  size: Size,
  canvas: Size,
  thresholds: SnapThresholds,
  margin: number,
): SnapResult {
  'worklet';
  const angle = snapAngle(transform.rotation, thresholds.rotation);
  const cos = Math.abs(Math.cos(angle.angle));
  const sin = Math.abs(Math.sin(angle.angle));
  // Reach of the rotated content, plus the margin all around it.
  const width = size.width * transform.scale;
  const height = size.height * transform.scale;
  const halfWidth = (width * cos + height * sin) / 2 + margin;
  const halfHeight = (width * sin + height * cos) / 2 + margin;
  const x = snapAxis(transform.x * canvas.width, halfWidth, canvas.width, thresholds.distance);
  const y = snapAxis(transform.y * canvas.height, halfHeight, canvas.height, thresholds.distance);
  return {
    transform: {
      ...transform,
      x: clamp(x.center / canvas.width, 0, 1),
      y: clamp(y.center / canvas.height, 0, 1),
      rotation: angle.angle,
    },
    x: x.line,
    y: y.line,
    rotation: angle.snapped,
  };
}

/**
 * A see-through part of a layer that touches go through, to the layers under it and the photo
 * (the camera's view): a rectangle from the layer's top-left corner, before scaling.
 */
export interface HitHole {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The lines a layer draws, when only they can be grabbed (a route, which may cross its box on the
 * diagonal and leave most of it empty): each line its points as x, y pairs from the layer's
 * center, before scaling, and half the stroke's width.
 */
export interface HitLine {
  readonly routes: readonly (readonly number[])[];
  readonly halfWidth: number;
}

/**
 * A layer as the hit test sees it: its transform, its size before scaling (canvas pixels), the
 * hole touches go through, if it has one, and the lines that alone take touches, if it draws some.
 */
export interface LayerBox {
  readonly id: string;
  readonly transform: LayerTransform;
  readonly width: number;
  readonly height: number;
  readonly hole?: HitHole;
  readonly line?: HitLine;
}

/** Whether a point of a layer's frame (from its center, scaled) is in its hole. */
function inHole(box: LayerBox, localX: number, localY: number): boolean {
  'worklet';
  const { hole, transform, width, height } = box;
  if (hole === undefined) {
    return false;
  }
  const x = localX / transform.scale + width / 2;
  const y = localY / transform.scale + height / 2;
  return x > hole.x && x < hole.x + hole.width && y > hole.y && y < hole.y + hole.height;
}

/** Distance from (`x`, `y`) to the segment from (`x1`, `y1`) to (`x2`, `y2`). */
function segmentDistance(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  'worklet';
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  // The closest point of the segment, as a share of it (its ends for a point beyond them).
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((x - x1) * dx + (y - y1) * dy) / length));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/**
 * Whether a point of a layer's frame (from its center, scaled) is within `reach` canvas pixels of
 * one of its lines, plus their half width. The reach is the same on the canvas whatever the
 * layer's scale.
 */
function onLine(box: LayerBox, line: HitLine, localX: number, localY: number, reach: number) {
  'worklet';
  const { scale } = box.transform;
  const x = localX / scale;
  const y = localY / scale;
  const limit = reach / scale + line.halfWidth;
  for (const route of line.routes) {
    if (route.length === 2 && Math.hypot(x - route[0], y - route[1]) <= limit) {
      return true;
    }
    for (let i = 2; i + 1 < route.length; i += 2) {
      if (segmentDistance(x, y, route[i - 2], route[i - 1], route[i], route[i + 1]) <= limit) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Id of the topmost layer under `point` (canvas pixels), or `null` when the touch is on the
 * photo. `boxes` go bottom to top, like template layers.
 *
 * The point is taken into each layer's own frame (undoing its rotation) and compared with its
 * scaled half-size. Every layer is at least `minSize` canvas pixels wide and tall for touching,
 * so thin text or a small logo stay easy to grab. A touch in a layer's hole goes through it, and
 * so does one in a line layer's box away from its lines: a layer of lines is grabbed within
 * half of `minSize` of them. Time O(n + p) for n layers and p points of their lines, space O(1).
 */
export function hitTestLayers(
  boxes: readonly LayerBox[],
  point: { readonly x: number; readonly y: number },
  canvas: Size,
  minSize: number,
): string | null {
  'worklet';
  for (let i = boxes.length - 1; i >= 0; i--) {
    const { transform, width, height } = boxes[i];
    const dx = point.x - transform.x * canvas.width;
    const dy = point.y - transform.y * canvas.height;
    const cos = Math.cos(-transform.rotation);
    const sin = Math.sin(-transform.rotation);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const halfWidth = Math.max(width * transform.scale, minSize) / 2;
    const halfHeight = Math.max(height * transform.scale, minSize) / 2;
    const line = boxes[i].line;
    if (
      Math.abs(localX) <= halfWidth &&
      Math.abs(localY) <= halfHeight &&
      !inHole(boxes[i], localX, localY) &&
      (line === undefined || onLine(boxes[i], line, localX, localY, minSize / 2))
    ) {
      return boxes[i].id;
    }
  }
  return null;
}
