import { BRAND_GEOMETRY } from './geometry.generated';

/** AllRun artwork shown by a logo layer. */
export type WatermarkVariant = 'wordmark' | 'mark' | 'lockup';

/** Where to draw one part of the logo: top-left corner and scale of its source drawing. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** A watermark laid out at its base size, in canvas pixels, with its parts inside that box. */
export interface WatermarkLayout {
  readonly width: number;
  readonly height: number;
  readonly mark: Placement | null;
  readonly wordmark: Placement | null;
}

/**
 * Base width of each variant on a 1080 px wide canvas (the layer's `scale` multiplies it). The
 * name is sized to read at a glance in a corner (28% of the width); the monogram alone is smaller
 * because it is much taller for its width.
 */
export const WATERMARK_WIDTH: Readonly<Record<WatermarkVariant, number>> = {
  wordmark: 300,
  mark: 140,
  lockup: 400,
};

/** In the lockup, the name is 42% of the monogram height, 16% of that height apart. */
const LOCKUP_WORD_RATIO = 0.42;
const LOCKUP_GAP_RATIO = 0.16;

const { mark, wordmark } = BRAND_GEOMETRY;

/** Lays out a watermark variant at its base width. Pure geometry: no drawing. */
export function watermarkLayout(variant: WatermarkVariant): WatermarkLayout {
  const width = WATERMARK_WIDTH[variant];
  switch (variant) {
    case 'wordmark': {
      const scale = width / wordmark.width;
      return {
        width,
        height: wordmark.height * scale,
        mark: null,
        wordmark: { x: 0, y: 0, scale },
      };
    }
    case 'mark': {
      const scale = width / mark.width;
      return { width, height: mark.height * scale, mark: { x: 0, y: 0, scale }, wordmark: null };
    }
    case 'lockup': {
      // In units of the monogram drawing: monogram, gap, then the name.
      const wordScale = (mark.height * LOCKUP_WORD_RATIO) / wordmark.height;
      const gap = mark.height * LOCKUP_GAP_RATIO;
      const totalUnits = mark.width + gap + wordmark.width * wordScale;
      const scale = width / totalUnits;
      return {
        width,
        height: mark.height * scale,
        mark: { x: 0, y: 0, scale },
        wordmark: {
          x: (mark.width + gap) * scale,
          y: ((mark.height - wordmark.height * wordScale) / 2) * scale,
          scale: wordScale * scale,
        },
      };
    }
  }
}
