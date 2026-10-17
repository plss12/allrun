/**
 * How the background photo is framed on the canvas.
 *
 * The framing is stored as proportions of the photo, not pixels: the point of the photo shown at
 * the center of the canvas, and a zoom over the "cover" fit. The same framing therefore gives the
 * same result whatever resolution of the photo is drawn (the reduced editor copy on screen or the
 * full-quality export copy), so exports match exactly what the user framed.
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
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Where to draw the whole photo, in canvas pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A point on the canvas, in canvas pixels. */
export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

/** Centered, covering the canvas: how a photo starts. */
export const DEFAULT_FRAMING: PhotoFraming = { centerX: 0.5, centerY: 0.5, zoom: 1 };

/**
 * Largest zoom over the cover fit. Beyond it the full-quality copy (at most 4096 px) has fewer
 * pixels than a 1080 px wide export shows, and the photo would look soft.
 */
export const MAX_ZOOM = 4;

// Helpers go first: the worklets Babel plugin turns worklet functions into variables, so they are
// not hoisted and must be defined before the functions that use them.

/**
 * Canvas pixels per photo pixel: the cover fit times `zoom`.
 *
 * @throws RangeError for photos or canvases without area, or a zoom below 1.
 */
function photoScale(photo: Size, canvas: Size, zoom: number): number {
  'worklet';
  if (photo.width <= 0 || photo.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    throw new RangeError('Photo and canvas need a positive size');
  }
  if (!(zoom >= 1)) {
    throw new RangeError(`Zoom must be at least 1, got ${zoom}`);
  }
  return Math.max(canvas.width / photo.width, canvas.height / photo.height) * zoom;
}

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/**
 * Rectangle to draw the photo in so that it follows `framing`.
 *
 * The photo is scaled to cover the canvas (like CSS `object-fit: cover`) times `zoom`, placed so
 * the framing center lands on the canvas center, then clamped so it always covers the canvas: no
 * empty band can appear at an edge. Time and space O(1).
 *
 * @throws RangeError for photos or canvases without area, or a zoom below 1.
 */
export function framePhoto(photo: Size, canvas: Size, framing: PhotoFraming): Rect {
  'worklet';
  const scale = photoScale(photo, canvas, framing.zoom);
  const width = photo.width * scale;
  const height = photo.height * scale;
  const x = canvas.width / 2 - framing.centerX * width;
  const y = canvas.height / 2 - framing.centerY * height;
  return {
    x: clamp(x, canvas.width - width, 0),
    y: clamp(y, canvas.height - height, 0),
    width,
    height,
  };
}

/**
 * The closest framing to `framing` that the canvas can actually show: zoom within 1..`MAX_ZOOM`
 * and a center that keeps the photo covering the canvas.
 *
 * {@link framePhoto} already draws any framing without empty bands, but a framing left outside
 * these bounds would make the next drag feel stuck until it travels back inside them. Time and
 * space O(1).
 *
 * @throws RangeError for photos or canvases without area.
 */
export function clampFraming(photo: Size, canvas: Size, framing: PhotoFraming): PhotoFraming {
  'worklet';
  const zoom = clamp(framing.zoom, 1, MAX_ZOOM);
  const scale = photoScale(photo, canvas, zoom);
  // Half of the visible part of the photo, as a fraction of the whole photo.
  const halfX = canvas.width / (2 * photo.width * scale);
  const halfY = canvas.height / (2 * photo.height * scale);
  return {
    centerX: clamp(framing.centerX, halfX, 1 - halfX),
    centerY: clamp(framing.centerY, halfY, 1 - halfY),
    zoom,
  };
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
  const scale = photoScale(photo, canvas, framing.zoom);
  return clampFraming(photo, canvas, {
    centerX: framing.centerX - dx / (photo.width * scale),
    centerY: framing.centerY - dy / (photo.height * scale),
    zoom: framing.zoom,
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
  const before = photoScale(photo, canvas, framing.zoom);
  const after = photoScale(photo, canvas, zoom);
  // Offset of the focal point from the canvas center, in canvas pixels.
  const offsetX = focal.x - canvas.width / 2;
  const offsetY = focal.y - canvas.height / 2;
  // The photo point (0..1) under the focal point before zooming must stay under it after.
  const pointX = framing.centerX + offsetX / (photo.width * before);
  const pointY = framing.centerY + offsetY / (photo.height * before);
  return clampFraming(photo, canvas, {
    centerX: pointX - offsetX / (photo.width * after),
    centerY: pointY - offsetY / (photo.height * after),
    zoom,
  });
}
