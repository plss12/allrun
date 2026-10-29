import {
  AlphaType,
  ColorType,
  FilterMode,
  MipmapMode,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';

import { dominantColor } from '@/core/dominant-color';

/** Longest side of the copy the dominant color is read from: 4096 pixels at most. */
const SAMPLE_SIDE = 64;

/** Colors already read, by image: gone with the image. */
const read = new WeakMap<SkImage, string | null>();

/**
 * The dominant color of a photo (see `core/dominant-color.ts`), read from a copy reduced to
 * `SAMPLE_SIDE` on a raster surface: a few thousand pixels, once per image (later calls return
 * the color read). `null` for a photo without opaque pixels.
 *
 * @throws Error when Skia can't make the surface or read its pixels; only the first time; later
 *   calls for that image return `null`, so a failure is reported once, not on every render.
 */
export function photoDominantColor(photo: SkImage): string | null {
  const known = read.get(photo);
  if (known !== undefined) {
    return known;
  }
  // Remembered before reading, so a failure isn't retried.
  read.set(photo, null);
  const color = readColor(photo);
  read.set(photo, color);
  return color;
}

function readColor(photo: SkImage): string | null {
  const scale = SAMPLE_SIDE / Math.max(photo.width(), photo.height());
  const width = Math.max(1, Math.round(photo.width() * scale));
  const height = Math.max(1, Math.round(photo.height() * scale));
  const surface = Skia.Surface.Make(width, height);
  if (surface === null) {
    throw new Error(`Could not make a ${width}×${height} surface for the photo's color`);
  }
  surface
    .getCanvas()
    .drawImageRectOptions(
      photo,
      Skia.XYWHRect(0, 0, photo.width(), photo.height()),
      Skia.XYWHRect(0, 0, width, height),
      FilterMode.Linear,
      MipmapMode.None,
    );
  surface.flush();
  const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!(pixels instanceof Uint8Array)) {
    throw new Error("Could not read the pixels of the photo's reduced copy");
  }
  return dominantColor(pixels);
}
