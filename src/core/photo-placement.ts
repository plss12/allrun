import { normalizeAngle, snapAngle } from './angles';

/**
 * Where the photo goes on the canvas, freely (ADR 009): it may be smaller than the canvas, leave
 * part of it empty (the background shows there) or reach past its edges, and turn.
 *
 * The placement is relative to the canvas, not to the photo: where the photo's center falls (as
 * fractions of the canvas), how big it is compared with just covering the canvas, and its
 * rotation. So the same placement fits any photo and any resolution of it (the editor's reduced
 * copy and the full-quality export copy alike), and a design that puts the photo in a band keeps
 * it there with another photo.
 *
 * The functions are marked as worklets so the editor's gestures can run them on the UI thread,
 * frame by frame; the directive is a plain string, so they stay ordinary pure functions here.
 * Helpers go first: the worklets Babel plugin turns worklet functions into variables, so they
 * are not hoisted.
 */
export interface PhotoPlacement {
  /** The photo's center, as a fraction of the canvas width (0..1). */
  readonly x: number;
  /** The photo's center, as a fraction of the canvas height (0..1). */
  readonly y: number;
  /** 1 = the photo, straight, just covers the canvas; smaller leaves room, larger zooms in. */
  readonly scale: number;
  /** Clockwise rotation around the photo's center, in radians, in (-π, π]. */
  readonly rotation: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A point on the canvas, in canvas pixels. */
export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

/** Where to draw the photo, in canvas pixels: centered on (`x`, `y`), turned by `rotation`. */
export interface PhotoDrawing {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

/** Centered, straight, just covering the canvas: how a photo starts. */
export const COVER_PLACEMENT: PhotoPlacement = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };

/** Smallest photo: a fifth of covering, still big enough to grab. */
export const MIN_PHOTO_SCALE = 0.2;
/**
 * Largest zoom over covering. Beyond it the full-quality copy (at most 4096 px) has fewer pixels
 * than a 1080 px wide export shows, and the photo would look soft.
 */
export const MAX_PHOTO_SCALE = 4;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/**
 * Canvas pixels per photo pixel when the straight photo just covers the canvas.
 *
 * @throws RangeError for photos or canvases without area.
 */
function coverRatio(photo: Size, canvas: Size): number {
  'worklet';
  if (photo.width <= 0 || photo.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    throw new RangeError('Photo and canvas need a positive size');
  }
  return Math.max(canvas.width / photo.width, canvas.height / photo.height);
}

/**
 * The closest placement the editor allows: the scale within its limits, the center on the canvas
 * (the photo can reach past the edges, but never get lost off them) and the rotation in (-π, π].
 * Time and space O(1).
 */
export function clampPlacement(placement: PhotoPlacement): PhotoPlacement {
  'worklet';
  return {
    x: clamp(placement.x, 0, 1),
    y: clamp(placement.y, 0, 1),
    scale: clamp(placement.scale, MIN_PHOTO_SCALE, MAX_PHOTO_SCALE),
    rotation: normalizeAngle(placement.rotation),
  };
}

/**
 * Where to draw a photo of size `photo` (any resolution of it) on `canvas`. Time and space O(1).
 *
 * @throws RangeError for photos or canvases without area.
 */
export function drawPhoto(photo: Size, canvas: Size, placement: PhotoPlacement): PhotoDrawing {
  'worklet';
  const ratio = coverRatio(photo, canvas) * placement.scale;
  return {
    x: placement.x * canvas.width,
    y: placement.y * canvas.height,
    width: photo.width * ratio,
    height: photo.height * ratio,
    rotation: placement.rotation,
  };
}

/**
 * Whether the photo covers the whole canvas, so no background shows. Idea: every corner of the
 * canvas, seen from the photo (undoing its rotation around its center), falls inside it. A hair
 * of tolerance keeps the exact cover placement covering despite rounding. Time and space O(1).
 *
 * @throws RangeError for photos or canvases without area.
 */
export function coversCanvas(photo: Size, canvas: Size, placement: PhotoPlacement): boolean {
  'worklet';
  const drawing = drawPhoto(photo, canvas, placement);
  const cos = Math.cos(drawing.rotation);
  const sin = Math.sin(drawing.rotation);
  const halfWidth = drawing.width / 2 + 1e-6;
  const halfHeight = drawing.height / 2 + 1e-6;
  const corners = [
    [0, 0],
    [canvas.width, 0],
    [0, canvas.height],
    [canvas.width, canvas.height],
  ];
  return corners.every(([cornerX, cornerY]) => {
    const dx = cornerX - drawing.x;
    const dy = cornerY - drawing.y;
    return (
      Math.abs(dx * cos + dy * sin) <= halfWidth && Math.abs(-dx * sin + dy * cos) <= halfHeight
    );
  });
}

/** Moves the photo by (`dx`, `dy`) canvas pixels, as a finger drags it. Time and space O(1). */
export function panPlacement(
  placement: PhotoPlacement,
  canvas: Size,
  dx: number,
  dy: number,
): PhotoPlacement {
  'worklet';
  return clampPlacement({
    ...placement,
    x: placement.x + dx / canvas.width,
    y: placement.y + dy / canvas.height,
  });
}

/**
 * Scales the photo by `factor` around `focal` (canvas pixels), as when pinching: the point of the
 * photo under the fingers stays under them, until a scale limit stops the photo (it neither keeps
 * growing nor drifts). Factors that are not positive (the first event of some pinches) change
 * nothing. Time and space O(1).
 */
export function zoomPlacement(
  placement: PhotoPlacement,
  canvas: Size,
  factor: number,
  focal: CanvasPoint,
): PhotoPlacement {
  'worklet';
  if (!(factor > 0)) {
    return placement;
  }
  const scale = clamp(placement.scale * factor, MIN_PHOTO_SCALE, MAX_PHOTO_SCALE);
  const applied = scale / placement.scale;
  // The center moves away from (or towards) the focal point as much as the photo grows.
  const centerX = focal.x + (placement.x * canvas.width - focal.x) * applied;
  const centerY = focal.y + (placement.y * canvas.height - focal.y) * applied;
  return clampPlacement({
    ...placement,
    x: centerX / canvas.width,
    y: centerY / canvas.height,
    scale,
  });
}

/** Turns the photo clockwise by `radians` around its center. Time and space O(1). */
export function rotatePlacement(placement: PhotoPlacement, radians: number): PhotoPlacement {
  'worklet';
  return { ...placement, rotation: normalizeAngle(placement.rotation + radians) };
}

/**
 * Where the photo snapped on one axis: its leading edge on the canvas's leading edge (left or
 * top), its center on the canvas center, its trailing edge on the trailing edge, or nowhere.
 * The same lines the layers snap to (see `layer-transform.ts`).
 */
export type PhotoSnapLine = 'none' | 'start' | 'center' | 'end';

/** How close the photo must be to snap: canvas pixels, radians and a share of its scale. */
export interface PhotoSnapThresholds {
  readonly distance: number;
  readonly rotation: number;
  readonly scale: number;
}

export interface PhotoSnap {
  readonly placement: PhotoPlacement;
  readonly x: PhotoSnapLine;
  readonly y: PhotoSnapLine;
  /** Straight: rotation at a multiple of 90°. */
  readonly rotation: boolean;
  /** At the scale that just covers the canvas. */
  readonly cover: boolean;
}

/**
 * Snaps a center at `center` (canvas pixels) of an object reaching `half` on each side to the
 * canvas center or edges, the closest within `threshold`.
 */
function snapPhotoAxis(
  center: number,
  half: number,
  length: number,
  threshold: number,
): { readonly center: number; readonly line: PhotoSnapLine } {
  'worklet';
  let best: { center: number; line: PhotoSnapLine } = { center, line: 'none' };
  let bestDistance = threshold;
  const candidates: readonly { center: number; line: PhotoSnapLine }[] = [
    { center: length / 2, line: 'center' },
    { center: half, line: 'start' },
    { center: length - half, line: 'end' },
  ];
  for (const candidate of candidates) {
    const distance = Math.abs(center - candidate.center);
    // An edge only wins when it is closer: a photo as tall as the canvas has its edges on the
    // canvas's while centered, and reads as centered.
    if (distance < bestDistance || (distance === bestDistance && best.line === 'none')) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Snaps a placement the fingers left close to a straight angle, to the scale that covers the
 * canvas, to the canvas center lines, or with an edge of the photo (of its rotated reach) on a
 * canvas edge. Together they give back the covering placement exactly.
 *
 * Gestures keep the unsnapped placement and snap a copy every frame, so the photo leaves a snap
 * as soon as the fingers move past it. Time and space O(1).
 *
 * @throws RangeError for photos or canvases without area.
 */
export function snapPlacement(
  placement: PhotoPlacement,
  photo: Size,
  canvas: Size,
  thresholds: PhotoSnapThresholds,
): PhotoSnap {
  'worklet';
  const angle = snapAngle(placement.rotation, thresholds.rotation);
  const cover = Math.abs(placement.scale - 1) <= thresholds.scale;
  const scale = cover ? 1 : placement.scale;
  const drawing = drawPhoto(photo, canvas, { ...placement, scale, rotation: angle.angle });
  const cos = Math.abs(Math.cos(angle.angle));
  const sin = Math.abs(Math.sin(angle.angle));
  const halfWidth = (drawing.width * cos + drawing.height * sin) / 2;
  const halfHeight = (drawing.width * sin + drawing.height * cos) / 2;
  const x = snapPhotoAxis(drawing.x, halfWidth, canvas.width, thresholds.distance);
  const y = snapPhotoAxis(drawing.y, halfHeight, canvas.height, thresholds.distance);
  return {
    placement: clampPlacement({
      x: x.center / canvas.width,
      y: y.center / canvas.height,
      scale,
      rotation: angle.angle,
    }),
    x: x.line,
    y: y.line,
    rotation: angle.snapped,
    cover,
  };
}

/** Whether two placements are the same, value by value. */
export function samePlacement(a: PhotoPlacement, b: PhotoPlacement): boolean {
  'worklet';
  return a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotation === b.rotation;
}
