import { normalizeAngle, snapAngle } from './angles';
import type { Size } from './photo-framing';
import type { Layer } from './template';

/**
 * Moving, scaling and rotating layers with the fingers, snapping them to the canvas center and
 * edges, and finding which layer a touch lands on.
 *
 * Like `photo-framing.ts`, every function is a worklet so gestures run it on the UI thread, and
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

/** A layer as the hit test sees it: its transform and its size before scaling (canvas pixels). */
export interface LayerBox {
  readonly id: string;
  readonly transform: LayerTransform;
  readonly width: number;
  readonly height: number;
}

/**
 * Id of the topmost layer under `point` (canvas pixels), or `null` when the touch is on the
 * photo. `boxes` go bottom to top, like template layers.
 *
 * The point is taken into each layer's own frame (undoing its rotation) and compared with its
 * scaled half-size. Every layer is at least `minSize` canvas pixels wide and tall for touching,
 * so thin text or a small logo stay easy to grab. Time O(n) for n layers, space O(1).
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
    if (Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight) {
      return boxes[i].id;
    }
  }
  return null;
}
