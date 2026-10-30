import { Skia, type SkImage, useImage } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';

import { SAMPLE_IMAGE, SAMPLE_PICTURE } from '@/core/image-layer';
import { logError } from '@/ui/log';

import { disposeLater } from './paragraph-arena';
import type { PickedPhoto } from './photo-plan';
import { pickFromLibrary } from './pick-photo';
import { preparePhoto } from './prepare-photo';
import type { LayerImage } from './template-scene';

/** A picture the user picked for an image layer, and its copy once prepared. */
interface Picture {
  readonly picked: PickedPhoto;
  /** The copy Skia decodes, `null` while it is prepared. */
  readonly uri: string | null;
  /** Whether the copy was re-encoded after the picked file failed to decode. */
  readonly reencoded: boolean;
}

/**
 * The pictures of the image layers (see `core/image-layer.ts`). Each has one copy of at most
 * 2048 px (the editor copy of `photo-plan.ts`), for the screen and the export alike: a picture is
 * never bigger than the canvas (1920 px at most), so it stays sharp in the image. Only the
 * pictures `inUse` (those of the design on the canvas) are kept decoded; the others, which undo
 * may bring back, are decoded again then.
 *
 * @param inUse - Keys of the pictures the design shows.
 * @param onFail - Called when a picture can't be prepared or decoded, even re-encoded.
 */
export function usePictures(
  inUse: readonly string[],
  onFail: (key: string) => void,
): {
  /**
   * The pictures in use, for the layers to draw (see `LayerContext`), and the gallery's sample
   * (`SAMPLE_IMAGE`).
   */
  readonly images: ReadonlyMap<string, LayerImage>;
  /**
   * Opens the photo library: the new picture's key, its copy prepared in the background, or
   * `null` if the user cancelled.
   *
   * @throws Error when the library can't be opened.
   */
  readonly pick: () => Promise<string | null>;
} {
  const [pictures, setPictures] = useState<ReadonlyMap<string, Picture>>(new Map());
  // Decoded as the editor opens, so the gallery has it (88 KB, 720 × 720 px).
  const sample = useImage(require('../../assets/images/sample-picture.jpg'), (error) =>
    logError('Could not decode the sample picture', error),
  );
  const [decoded, setDecoded] = useState<ReadonlyMap<string, SkImage>>(new Map());
  const nextKey = useRef(1);
  const decoding = useRef(new Set<string>());
  const wanted = new Set(inUse);
  // Pictures no longer shown leave at once (and are freed below, see `shown`).
  if ([...decoded.keys()].some((key) => !wanted.has(key))) {
    setDecoded(new Map([...decoded].filter(([key]) => wanted.has(key))));
  }

  const update = (key: string, change: Partial<Picture>) =>
    setPictures((current) => {
      const picture = current.get(key);
      return picture === undefined ? current : new Map(current).set(key, { ...picture, ...change });
    });

  const prepare = async (key: string, picked: PickedPhoto, force: boolean) => {
    try {
      update(key, { uri: await preparePhoto(picked, 'editor', force), reencoded: force });
    } catch (error) {
      logError('Could not prepare a picture', error);
      onFail(key);
    }
  };

  const pick = async (): Promise<string | null> => {
    const picked = await pickFromLibrary();
    if (picked === null) {
      return null;
    }
    const key = `picture-${nextKey.current}`;
    nextKey.current += 1;
    setPictures((current) => new Map(current).set(key, { picked, uri: null, reencoded: false }));
    void prepare(key, picked, false);
    return key;
  };

  const inUseKey = inUse.join('|');
  /** The pictures in use as of the last render, for a decoding that ends after it. */
  const inUseNow = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    inUseNow.current = new Set(inUseKey === '' ? [] : inUseKey.split('|'));
    for (const key of inUseNow.current) {
      const picture = pictures.get(key);
      if (picture?.uri == null || decoded.has(key) || decoding.current.has(key)) {
        continue;
      }
      const { uri, picked, reencoded } = picture;
      decoding.current.add(key);
      void (async () => {
        try {
          const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
          if (image === null) {
            throw new Error(`Could not decode the picture ${uri}`);
          }
          if (!inUseNow.current.has(key)) {
            // Undone meanwhile: never drawn, so freed now.
            image.dispose();
            return;
          }
          setDecoded((current) => new Map(current).set(key, image));
        } catch (error) {
          if (reencoded) {
            logError('Could not decode the re-encoded picture', error);
            onFail(key);
          } else {
            // Skia could not decode the file as picked: re-encode it once and try again.
            logError('Could not decode a picture, re-encoding it', error);
            update(key, { uri: null });
            void prepare(key, picked, true);
          }
        } finally {
          decoding.current.delete(key);
        }
      })();
    }
    // `prepare`, `update` and `onFail` are recreated on every render; the pictures in use, their
    // copies and those decoded say when to decode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inUseKey, pictures, decoded]);

  // The pictures decoded that the canvas last drew: those that leave are freed once it stops
  // drawing them, and all of them when the editor closes.
  const shown = useRef<ReadonlyMap<string, SkImage>>(new Map());
  useEffect(() => {
    for (const [key, image] of shown.current) {
      if (decoded.get(key) !== image) {
        disposeLater(() => image.dispose());
      }
    }
    shown.current = decoded;
  }, [decoded]);
  useEffect(
    () => () => {
      shown.current.forEach((image) => disposeLater(() => image.dispose()));
    },
    [],
  );

  const images = new Map<string, LayerImage>([
    [SAMPLE_IMAGE, { size: SAMPLE_PICTURE, image: sample }],
  ]);
  for (const key of inUse) {
    const picture = pictures.get(key);
    if (picture !== undefined) {
      const image = decoded.get(key) ?? null;
      images.set(key, {
        // The decoded size, upright, once known; the picker's until then.
        size:
          image === null
            ? { width: picture.picked.width, height: picture.picked.height }
            : { width: image.width(), height: image.height() },
        image,
      });
    }
  }
  return { images, pick };
}
