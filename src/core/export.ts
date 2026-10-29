/**
 * How a finished design is saved. It always exports at its canvas size (`CANVAS_FORMATS`: 1080
 * px wide, Instagram's own sizes, so no app rescales it). With a photo it is a JPEG: at this
 * quality it looks the same as a PNG at a fraction of the size, and social apps recompress it
 * anyway. When something shows through (no photo, or a photo leaving the canvas partly empty over
 * no background) it is a PNG, transparent there, as a sticker.
 */
export interface ExportEncoding {
  readonly format: 'jpeg' | 'png';
  /** 0–100; PNG ignores it (it is lossless). */
  readonly quality: number;
  readonly extension: 'jpg' | 'png';
  /** For Android's share sheet. */
  readonly mimeType: 'image/jpeg' | 'image/png';
  /** For iOS's share sheet. */
  readonly uti: 'public.jpeg' | 'public.png';
}

/** JPEG quality of designs with a photo. */
export const JPEG_QUALITY = 95;

const JPEG: ExportEncoding = {
  format: 'jpeg',
  quality: JPEG_QUALITY,
  extension: 'jpg',
  mimeType: 'image/jpeg',
  uti: 'public.jpeg',
};

const PNG: ExportEncoding = {
  format: 'png',
  quality: 100,
  extension: 'png',
  mimeType: 'image/png',
  uti: 'public.png',
};

/**
 * A JPEG for an opaque design, a PNG for one with see-through pixels (see `isOpaque` in
 * `design-background.ts`).
 */
export function exportEncoding(opaque: boolean): ExportEncoding {
  return opaque ? JPEG : PNG;
}

/**
 * File name of an export, from the moment it was made (`stamp`, e.g. `20261018-153012`), so
 * that several exports never overwrite each other where the name shows (AirDrop, Files).
 */
export function exportFileName(encoding: ExportEncoding, stamp: string): string {
  return `AllRun-${stamp}.${encoding.extension}`;
}
