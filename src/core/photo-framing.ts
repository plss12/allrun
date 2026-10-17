import { normalizeAngle } from './angles';

/**
 * How the background photo is framed on the canvas.
 *
 * The framing is stored as proportions of the photo, not pixels: the point of the photo shown at
 * the center of the canvas, a zoom over the "cover" fit and a rotation around the canvas center.
 * The same framing therefore gives the same result whatever resolution of the photo is drawn
 * (the reduced editor copy on screen or the full-quality export copy), so exports match exactly
 * what the user framed.
 *
 * The photo always covers the whole canvas, rotated or not: "cover" is measured against the
 * canvas as the rotated photo sees it, so tilting the photo zooms it in just enough to leave no
 * empty corner, and straightening it again gives back the same framing.
 *
 * Idea: a rotated rectangle (the canvas, seen from the photo) lies inside an axis-aligned one
 * (the photo) exactly when its bounding box does. That box has half-extents
 * (w·|cos θ| + h·|sin θ|) / 2 and (w·|sin θ| + h·|cos θ|) / 2, so both the cover scale and the
 * allowed centers stay as simple as without rotation.
 *
 * The functions are marked as worklets so the editor's gestures can run them on the UI thread,
 * frame by frame; the directive is a plain string, so they stay ordinary pure functions here.
 */
export interface PhotoFraming {
  /** Point of the photo (0..1 of its width) at the center of the canvas. */
  readonly centerX: number;
  /** Point of the photo (0..1 of its height) at the center of the canvas. */
  readonly centerY: number;
  /** 1 = the photo just covers the canvas; larger values zoom in. */
  readonly zoom: number;
  /** Clockwise rotation of the photo around the canvas center, in radians, in (-π, π]. */
  readonly rotation: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Where to draw the photo: rotate by `rotation` around the canvas center, then draw the whole
 * photo in this rectangle, relative to the canvas center.
 */
export interface PhotoPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

/** A point on the canvas, in canvas pixels. */
export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

/** Centered, straight, covering the canvas: how a photo starts. */
export const DEFAULT_FRAMING: PhotoFraming = { centerX: 0.5, centerY: 0.5, zoom: 1, rotation: 0 };

/**
 * Largest zoom over the cover fit. Beyond it the full-quality copy (at most 4096 px) has fewer
 * pixels than a 1080 px wide export shows, and the photo would look soft.
 */
export const MAX_ZOOM = 4;

// Helpers go first: the worklets Babel plugin turns worklet functions into variables, so they are
// not hoisted and must be defined before the functions that use them.

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/** Half-size of the canvas's bounding box as seen from a photo rotated by `rotation`. */
function canvasHalfExtents(canvas: Size, rotation: number): Size {
  'worklet';
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  return {
    width: (canvas.width * cos + canvas.height * sin) / 2,
    height: (canvas.width * sin + canvas.height * cos) / 2,
  };
}

/**
 * Canvas pixels per photo pixel: the cover fit at this rotation, times `zoom`.
 *
 * @throws RangeError for photos or canvases without area, or a zoom below 1.
 */
function photoScale(photo: Size, canvas: Size, zoom: number, rotation: number): number {
  'worklet';
  if (photo.width <= 0 || photo.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    throw new RangeError('Photo and canvas need a positive size');
  }
  if (!(zoom >= 1)) {
    throw new RangeError(`Zoom must be at least 1, got ${zoom}`);
  }
  const half = canvasHalfExtents(canvas, rotation);
  return Math.max((2 * half.width) / photo.width, (2 * half.height) / photo.height) * zoom;
}

/** A canvas offset (pixels) turned into the photo's own axes, undoing its rotation. */
function toPhotoAxes(dx: number, dy: number, rotation: number): CanvasPoint {
  'worklet';
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

/**
 * The closest framing to `framing` that the canvas can actually show: zoom within 1..`MAX_ZOOM`,
 * rotation in (-π, π] and a center that keeps the photo covering the canvas.
 *
 * Gestures clamp after every step, so a drag past an edge never builds up an overshoot that the
 * next drag would have to undo before the photo moves again. Time and space O(1).
 *
 * @throws RangeError for photos or canvases without area, or a zoom that is not a number.
 */
export function clampFraming(photo: Size, canvas: Size, framing: PhotoFraming): PhotoFraming {
  'worklet';
  const zoom = clamp(framing.zoom, 1, MAX_ZOOM);
  const rotation = normalizeAngle(framing.rotation);
  const scale = photoScale(photo, canvas, zoom, rotation);
  const half = canvasHalfExtents(canvas, rotation);
  // Half of the visible box, as a fraction of the whole photo.
  const halfX = half.width / (photo.width * scale);
  const halfY = half.height / (photo.height * scale);
  return {
    centerX: clamp(framing.centerX, halfX, 1 - halfX),
    centerY: clamp(framing.centerY, halfY, 1 - halfY),
    zoom,
    rotation,
  };
}

/**
 * Where to draw the photo so that it follows `framing`, clamped to keep it covering the canvas.
 * Time and space O(1).
 *
 * @throws RangeError for photos or canvases without area, or a zoom below 1.
 */
export function framePhoto(photo: Size, canvas: Size, framing: PhotoFraming): PhotoPlacement {
  'worklet';
  // Validates sizes and zoom first: clamping would quietly turn a zoom below 1 into 1.
  photoScale(photo, canvas, framing.zoom, framing.rotation);
  const { centerX, centerY, zoom, rotation } = clampFraming(photo, canvas, framing);
  const scale = photoScale(photo, canvas, zoom, rotation);
  const width = photo.width * scale;
  const height = photo.height * scale;
  return { x: -centerX * width, y: -centerY * height, width, height, rotation };
}

/**
 * Moves the photo by (`dx`, `dy`) canvas pixels, as when dragging it with a finger, within the
 * bounds of {@link clampFraming}. Time and space O(1).
 *
 * @throws RangeError for photos or canvases without area.
 */
export function panFraming(
  photo: Size,
  canvas: Size,
  framing: PhotoFraming,
  dx: number,
  dy: number,
): PhotoFraming {
  'worklet';
  const scale = photoScale(photo, canvas, framing.zoom, framing.rotation);
  const move = toPhotoAxes(dx, dy, framing.rotation);
  return clampFraming(photo, canvas, {
    ...framing,
    centerX: framing.centerX - move.x / (photo.width * scale),
    centerY: framing.centerY - move.y / (photo.height * scale),
  });
}

/**
 * Zooms by `factor` around `focal` (canvas pixels), as when pinching: the point of the photo under
 * the fingers stays under them. The zoom is limited to 1..`MAX_ZOOM`; past a limit the photo stops
 * zooming instead of drifting. Time and space O(1).
 *
 * @throws RangeError for photos or canvases without area, or a factor that is not positive.
 */
export function zoomFraming(
  photo: Size,
  canvas: Size,
  framing: PhotoFraming,
  factor: number,
  focal: CanvasPoint,
): PhotoFraming {
  'worklet';
  if (!(factor > 0)) {
    throw new RangeError(`Zoom factor must be positive, got ${factor}`);
  }
  const zoom = clamp(framing.zoom * factor, 1, MAX_ZOOM);
  const before = photoScale(photo, canvas, framing.zoom, framing.rotation);
  const after = photoScale(photo, canvas, zoom, framing.rotation);
  // Offset of the focal point from the canvas center, along the photo's axes.
  const offset = toPhotoAxes(
    focal.x - canvas.width / 2,
    focal.y - canvas.height / 2,
    framing.rotation,
  );
  // The photo point (0..1) under the focal point before zooming must stay under it after.
  const pointX = framing.centerX + offset.x / (photo.width * before);
  const pointY = framing.centerY + offset.y / (photo.height * before);
  return clampFraming(photo, canvas, {
    ...framing,
    centerX: pointX - offset.x / (photo.width * after),
    centerY: pointY - offset.y / (photo.height * after),
    zoom,
  });
}

/**
 * Turns the photo to `rotation` (radians, clockwise) around the canvas center, zooming it in as
 * much as needed to keep covering the canvas. Time and space O(1).
 *
 * @throws RangeError for photos or canvases without area.
 */
export function rotateFraming(
  photo: Size,
  canvas: Size,
  framing: PhotoFraming,
  rotation: number,
): PhotoFraming {
  'worklet';
  return clampFraming(photo, canvas, { ...framing, rotation });
}
