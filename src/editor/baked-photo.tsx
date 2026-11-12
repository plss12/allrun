import { drawAsPicture, Group, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { makeMutable, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { type PhotoFilterId, photoFilterLook } from '@/core/photo-filter';
import { COVER_PLACEMENT, drawPhoto } from '@/core/photo-placement';
import { logError } from '@/ui/log';

import { drawTexture } from './gesture-textures';
import { disposeLater } from './paragraph-arena';
import { FilteredPhoto, photoRect } from './template-scene';

/** The blur a texture holds, and for which photo. */
interface Baked {
  readonly image: SkImage;
  readonly filter: PhotoFilterId;
  readonly texture: SharedValue<SkImage | null>;
}

/**
 * The canvas's photo drawn once with its blur (Motion Blur or Zoom Blur, see `photo-filter.ts`),
 * at the size that covers the canvas and with the photo's own pixels, kept while the photo and its
 * filter stay. A blur reads the photo 24 times a pixel: drawn on every frame of a gesture, or every
 * time the canvas changes, it held a modest phone's frames up to 117 ms (ADR 014). As a blur grows
 * and shrinks with the photo (see `photoRect`), the same texture serves wherever the photo is and
 * however big; exporting still draws it in vector.
 *
 * Time: one blur of the photo per photo and filter, on the UI thread. Space: the photo's pixels in
 * the GPU (its editor copy, at most 2048 px a side), only while it has a blur; the one before is
 * freed once the canvas has stopped drawing it.
 *
 * @returns The texture, once drawn for this photo and filter; `null` until then and without a blur.
 */
export function useBakedPhoto(
  image: SkImage | null,
  filter: PhotoFilterId | null,
  canvasWidth: number,
  canvasHeight: number,
): SharedValue<SkImage | null> | null {
  const [baked, setBaked] = useState<Baked | null>(null);
  useEffect(() => {
    if (image === null || filter === null || photoFilterLook(filter).kind === 'matrix') {
      return undefined;
    }
    const texture = makeMutable<SkImage | null>(null);
    let current = true;
    const size = { width: image.width(), height: image.height() };
    const rect = photoRect(
      drawPhoto(size, { width: canvasWidth, height: canvasHeight }, COVER_PLACEMENT),
    );
    // As many pixels as the photo has: a blur adds no detail, and the canvas samples it as it does
    // the photo.
    const scale = size.width / rect.width;
    const done = (ok: boolean) => {
      if (!ok) {
        logError('Could not draw the blurred photo', new Error('No offscreen surface'));
      } else if (current) {
        setBaked({ image, filter, texture });
      }
    };
    drawAsPicture(
      <Group
        transform={[{ scale }, { translateX: rect.width / 2 }, { translateY: rect.height / 2 }]}
      >
        <FilteredPhoto photo={{ image, matrix: [], rect, filter }} canvasWidth={canvasWidth} />
      </Group>,
    )
      .then((picture) => {
        if (!current) {
          picture.dispose();
          return;
        }
        scheduleOnUI(() => {
          scheduleOnRN(done, drawTexture(picture, size, texture));
        });
      })
      .catch((error: unknown) => logError('Could not record the blurred photo', error));
    return () => {
      current = false;
      // Once the canvas has stopped drawing it: freeing what is still drawn would crash.
      disposeLater(() =>
        scheduleOnUI(() => {
          texture.get()?.dispose();
          texture.set(null);
        }),
      );
    };
  }, [image, filter, canvasWidth, canvasHeight]);
  return baked !== null && baked.image === image && baked.filter === filter ? baked.texture : null;
}
