/**
 * How the background photo is framed on the canvas.
 *
 * The framing is stored as proportions of the photo, not pixels: the point of the photo shown at
 * the center of the canvas, and a zoom over the "cover" fit. The same framing therefore gives the
 * same result whatever resolution of the photo is drawn (the original shown by the system viewer
 * while the photo is being prepared, or the re-encoded copy Skia draws), so switching between
 * them never moves the picture.
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

/** Centered, covering the canvas: how a photo starts. */
export const DEFAULT_FRAMING: PhotoFraming = { centerX: 0.5, centerY: 0.5, zoom: 1 };

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
  if (photo.width <= 0 || photo.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    throw new RangeError('Photo and canvas need a positive size');
  }
  if (!(framing.zoom >= 1)) {
    throw new RangeError(`Zoom must be at least 1, got ${framing.zoom}`);
  }
  const scale = Math.max(canvas.width / photo.width, canvas.height / photo.height) * framing.zoom;
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
