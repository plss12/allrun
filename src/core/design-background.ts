import { collageCovers } from './collage';
import { splitOpacity, withOpacity } from './color-menu';
import { coversCanvas, type Size } from './photo-placement';
import { CANVAS_FORMATS, type DesignBackground, type Template } from './template';

/**
 * The color a design's background shows, or `null` for none (transparent): `auto` is the photo's
 * dominant color (`dominant`, a `#RRGGBB`, `null` without a photo or before it is known), at its
 * opacity, so a design without a photo stays a transparent sticker. Time and space O(1).
 */
export function backgroundColor(
  background: DesignBackground,
  dominant: string | null,
): string | null {
  switch (background.kind) {
    case 'auto':
      return dominant === null ? null : withOpacity(dominant, background.opacity ?? 1);
    case 'color':
      return background.color;
    case 'transparent':
      return null;
  }
}

/**
 * Whether an image of the design has no see-through pixel, so it can go out as a JPEG: a
 * background of some opaque color (a translucent one lets what is under it show), or a photo (of
 * size `photo`) covering the whole canvas; in a collage, its photos (of the sizes `cells`, by cell)
 * covering their cells. Time O(c) for c cells; space O(1).
 */
export function isOpaque(
  design: Template,
  photo: Size | null,
  dominant: string | null,
  cells: readonly (Size | null)[] = [],
): boolean {
  const color = backgroundColor(design.background, dominant);
  const canvas = CANVAS_FORMATS[design.format];
  return (
    (color !== null && splitOpacity(color).opacity === 1) ||
    (design.collage === undefined
      ? photo !== null && coversCanvas(photo, canvas, design.photo)
      : collageCovers(design.collage, cells, canvas))
  );
}
