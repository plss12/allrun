import {
  drawOffscreen,
  Group,
  makeOffscreenSurface,
} from '@shopify/react-native-skia/lib/commonjs/headless';

import type { PreparedLayer } from '@/editor/template-scene';

/**
 * Room around a layer where only its drop shadow may reach (offset and blur), and the faintest
 * alpha counted as drawn.
 */
const SHADOW_ROOM = 24;
export const DRAWN_ALPHA = 8;

/**
 * Most opaque pixel (0..255) a prepared layer draws outside the size it measures and its shadow's
 * room: the editor grabs, frames and snaps a layer by that size, so nothing should be there. Draws
 * with CanvasKit (load it first; see `editor/template-scene.test.tsx`).
 */
export async function alphaOutside(prepared: PreparedLayer): Promise<number> {
  const margin = SHADOW_ROOM + 16;
  const width = Math.ceil(prepared.width) + 2 * margin;
  const height = Math.ceil(prepared.height) + 2 * margin;
  const image = await drawOffscreen(
    makeOffscreenSurface(width, height),
    <Group transform={[{ translateX: width / 2 }, { translateY: height / 2 }]}>
      {prepared.content}
    </Group>,
  );
  const pixels = image.readPixels(0, 0, image.getImageInfo());
  if (pixels === null) {
    throw new Error('Could not read the pixels');
  }
  const left = (width - prepared.width) / 2 - SHADOW_ROOM;
  const top = (height - prepared.height) / 2 - SHADOW_ROOM;
  const right = left + prepared.width + 2 * SHADOW_ROOM;
  const bottom = top + prepared.height + 2 * SHADOW_ROOM;
  let max = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < left || x >= right || y < top || y >= bottom) {
        max = Math.max(max, pixels[(y * width + x) * 4 + 3]);
      }
    }
  }
  return max;
}
