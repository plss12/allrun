import { drawAsImage, Group, Paint, type SkImage } from '@shopify/react-native-skia';
import type { ReactElement } from 'react';

import { stickerPlan } from '@/core/export';

import type { PreparedLayer } from './template-scene';

/**
 * A prepared widget alone, cut to its size with room for its shadow, on a transparent ground: the
 * scene of its sticker, of the size `stickerPlan` says. Its content is drawn at a larger scale, not
 * enlarged afterwards: its letters and lines are vectors, so it stays sharp pasted big.
 */
export function stickerScene({ width, height, content, layer }: PreparedLayer): ReactElement {
  const plan = stickerPlan(width, height);
  return (
    <Group
      transform={[
        { translateX: plan.width / 2 },
        { translateY: plan.height / 2 },
        { scale: plan.scale },
      ]}
      layer={layer.opacity < 1 ? <Paint opacity={layer.opacity} /> : undefined}
    >
      {content}
    </Group>
  );
}

/**
 * Draws a prepared widget as a sticker, off-screen. The caller frees the image.
 *
 * @throws Error when it can't be drawn.
 */
export async function renderSticker(prepared: PreparedLayer): Promise<SkImage> {
  const { width, height } = stickerPlan(prepared.width, prepared.height);
  const image = await drawAsImage(stickerScene(prepared), { width, height });
  if (image === null) {
    throw new Error(`Could not draw the sticker ${prepared.layer.id} off-screen`);
  }
  return image;
}
