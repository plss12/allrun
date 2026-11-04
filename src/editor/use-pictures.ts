import { Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';

import { pickedPhoto } from '@/data/photo-library';
import { logError } from '@/ui/log';

import { disposeLater } from './paragraph-arena';
import type { PickedPhoto } from './photo-plan';
import { type PhotoCopy, preparePhoto } from './prepare-photo';
import type { LayerImage } from './template-scene';

/** A picture the user picked for an image layer, and its copy once prepared. */
interface Picture {
  readonly picked: PickedPhoto;
  /** Which copy of it is kept. */
  readonly copy: PhotoCopy;
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
 * @param choose - Lets the user choose a photo: its library id, or `null` if they cancel.
 */
export function usePictures(
  inUse: readonly string[],
  onFail: (key: string) => void,
  choose: () => Promise<string | null>,
): {
  /** The pictures in use, for the layers to draw (see `LayerContext`). */
  readonly images: ReadonlyMap<string, LayerImage>;
  /**
   * Lets the user choose a photo: the new picture's key, its copy (the editor's by default)
   * prepared in the background, or `null` if the user cancelled.
   *
   * @throws Error when the photo can't be read.
   */
  readonly pick: (copy?: PhotoCopy) => Promise<string | null>;
} {
  const [pictures, setPictures] = useState<ReadonlyMap<string, Picture>>(new Map());
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

  const prepare = async (key: string, picked: PickedPhoto, copy: PhotoCopy, force: boolean) => {
    try {
      update(key, { uri: await preparePhoto(picked, copy, force), reencoded: force });
    } catch (error) {
      logError('Could not prepare a picture', error);
      onFail(key);
    }
  };

  const pick = async (copy: PhotoCopy = 'editor'): Promise<string | null> => {
    const id = await choose();
    if (id === null) {
      return null;
    }
    const picked = await pickedPhoto(id);
    const key = `picture-${nextKey.current}`;
    nextKey.current += 1;
    setPictures((current) =>
      new Map(current).set(key, { picked, copy, uri: null, reencoded: false }),
    );
    void prepare(key, picked, copy, false);
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
      const { uri, picked, copy, reencoded } = picture;
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
            void prepare(key, picked, copy, true);
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

  const images = new Map<string, LayerImage>();
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
