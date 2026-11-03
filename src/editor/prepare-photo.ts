import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { EDITOR_MAX_SIDE, EXPORT_MAX_SIDE, type PickedPhoto, planPhoto } from './photo-plan';

/** The copies of a photo: the two of `photo-plan.ts`, and one for a collage's cell. */
export type PhotoCopy = 'editor' | 'export' | 'cell';

const COPIES: Readonly<Record<PhotoCopy, { readonly maxSide: number; readonly compress: number }>> =
  {
    // Only ever seen on screen, where 0.92 is indistinguishable from 1 and encodes faster.
    editor: { maxSide: EDITOR_MAX_SIDE, compress: 0.92 },
    export: { maxSide: EXPORT_MAX_SIDE, compress: 1 },
    // For the screen and the image alike: a cell takes a part of the canvas, and six photos at the
    // editor's size would take about 75 MB decoded, 40 MB at this one.
    cell: { maxSide: 1536, compress: 0.92 },
  };

/**
 * Returns a URI Skia can decode for one copy of a photo, following {@link planPhoto}: the
 * original file when possible, otherwise a JPEG re-encoded once (and shrunk if needed) with the
 * platform's native decoder, which reads HEIC/HEIF.
 *
 * @param force - Re-encode even a photo that looks decodable (after Skia failed to decode it).
 */
export async function preparePhoto(
  photo: PickedPhoto,
  copy: PhotoCopy,
  force = false,
): Promise<string> {
  const { maxSide, compress } = COPIES[copy];
  const plan = planPhoto(photo, maxSide, force);
  if (plan.kind === 'original') {
    return photo.uri;
  }
  const context = ImageManipulator.manipulate(photo.uri);
  if (plan.resize !== null) {
    context.resize(plan.resize);
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress });
  return result.uri;
}
