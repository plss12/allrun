import { coversCanvas, type Size } from './photo-placement';
import { CANVAS_FORMATS, type DesignBackground, type Template } from './template';

/**
 * The color a design's background shows, or `null` for none (transparent): `auto` is the photo's
 * dominant color (`dominant`, `null` without a photo or before it is known), so a design without
 * a photo stays a transparent sticker. Time and space O(1).
 */
export function backgroundColor(
  background: DesignBackground,
  dominant: string | null,
): string | null {
  switch (background.kind) {
    case 'auto':
      return dominant;
    case 'color':
      return background.color;
    case 'transparent':
      return null;
  }
}

/**
 * Whether an image of the design has no see-through pixel, so it can go out as a JPEG: a
 * background of some color, or a photo (of size `photo`) covering the whole canvas. Time and
 * space O(1).
 */
export function isOpaque(design: Template, photo: Size | null, dominant: string | null): boolean {
  return (
    backgroundColor(design.background, dominant) !== null ||
    (photo !== null && coversCanvas(photo, CANVAS_FORMATS[design.format], design.photo))
  );
}
