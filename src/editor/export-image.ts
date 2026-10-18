import { drawAsImage, ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';

import type { ExportEncoding } from '@/core/export';
import { CANVAS_FORMATS } from '@/core/template';

import { type ExportDesign, exportScene } from './export-scene';

/** Draws a design off-screen at its export size (see `export-scene.tsx`). */
export async function renderDesign(design: ExportDesign): Promise<SkImage> {
  const image = await drawAsImage(exportScene(design), CANVAS_FORMATS[design.template.format]);
  if (image === null) {
    throw new Error(`Could not draw the ${design.template.format} design off-screen`);
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
