import {
  ColorSpace,
  type ColorSpaceValue,
  drawAsPicture,
  ImageFormat,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';

import type { ExportEncoding } from '@/core/export';
import { CANVAS_FORMATS } from '@/core/template';

import { type ExportDesign, exportScene } from './export-scene';
import { SCREEN_COLOR_SPACE } from './screen-color';

/**
 * The color space of an exported image: the screen's for a JPEG, so it looks as it was edited (on
 * the iPhone, Display P3, its photos' colors whole; Skia writes Apple's own P3 profile in it, the
 * one Instagram reads). A PNG stays sRGB: Skia writes its own P3 profile in one, which apps such as
 * Instagram don't recognize.
 */
export function exportColorSpace(encoding: ExportEncoding): ColorSpaceValue {
  return encoding.format === 'jpeg' ? SCREEN_COLOR_SPACE : ColorSpace.SRGB;
}

/** Draws a design off-screen at its export size (see `export-scene.tsx`), in `colorSpace`. */
export async function renderDesign(
  design: ExportDesign,
  colorSpace: ColorSpaceValue,
): Promise<SkImage> {
  const { width, height } = CANVAS_FORMATS[design.template.format];
  const picture = await drawAsPicture(exportScene(design));
  const surface = Skia.Surface.MakeOffscreen(width, height, { colorSpace });
  if (surface === null) {
    picture.dispose();
    throw new Error(`Could not draw the ${design.template.format} design off-screen`);
  }
  surface.getCanvas().drawPicture(picture);
  surface.flush();
  // In the memory of the phone, not of its GPU: it is encoded and kept while the export bar is open.
  const image = surface.makeImageSnapshot().makeNonTextureImage();
  surface.dispose();
  picture.dispose();
  if (image === null) {
    throw new Error(`Could not read the ${design.template.format} design drawn off-screen`);
  }
  return image;
}

/** Decodes the full-quality copy of the photo (see `prepare-photo.ts`) for exporting. */
export async function loadPhoto(uri: string): Promise<SkImage> {
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (image === null) {
    throw new Error(`Could not decode the export copy of the photo: ${uri}`);
  }
  return image;
}

const FORMATS = { jpeg: ImageFormat.JPEG, png: ImageFormat.PNG } as const;

/** The image encoded as `encoding` says, as base64 (for the clipboard). */
export function encodeBase64(image: SkImage, encoding: ExportEncoding): string {
  return image.encodeToBase64(FORMATS[encoding.format], encoding.quality);
}

/** Writes the image, encoded, to a file `name` in the cache; returns its URI. */
export function writeImage(image: SkImage, encoding: ExportEncoding, name: string): string {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(image.encodeToBytes(FORMATS[encoding.format], encoding.quality));
  return file.uri;
}
