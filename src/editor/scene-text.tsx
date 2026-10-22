import { Shadow, Skia, type SkTextShadow } from '@shopify/react-native-skia';

import { castsShadow } from '@/core/layer-style';

/**
 * The soft shadow under texts, routes and bars. It keeps white widgets readable on bright
 * photos and lifts the top one off the layers below it: without it, a white route over white
 * text would merge with it. It has no setting: only light and bright colors cast it (see
 * `castsShadow`), since under black it would just blur the edges.
 */
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.45)';
const SHADOW_OFFSET_Y = 3;
const SHADOW_BLUR_RADIUS = 10;
/** Paragraph shadows take a blur radius, image filters a sigma; this is Skia's conversion. */
const SHADOW_SIGMA = 0.57735 * SHADOW_BLUR_RADIUS + 0.5;

/** The drop shadow of shapes (lines, bars, icons), as an image filter. */
export function DropShadow() {
  return <Shadow dx={0} dy={SHADOW_OFFSET_Y} blur={SHADOW_SIGMA} color={SHADOW_COLOR} />;
}

/** The drop shadow of a text of `color`: none for dark colors (see `castsShadow`). */
export function textShadows(color: string): SkTextShadow[] {
  return castsShadow(color)
    ? [
        {
          color: Skia.Color(SHADOW_COLOR),
          offset: { x: 0, y: SHADOW_OFFSET_Y },
          blurRadius: SHADOW_BLUR_RADIUS,
        },
      ]
    : [];
}

/** Room added after each letter, as a fraction of the font size. */
export const LETTER_SPACING = { normal: 0, wide: 0.08, wider: 0.2 } as const;
