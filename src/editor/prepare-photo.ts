import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { type PickedPhoto, planPhoto } from './photo-plan';

/**
 * Returns a URI the canvas can decode for a photo from the library, following {@link planPhoto}:
 * the original file when possible, otherwise a JPEG re-encoded once at maximum quality (and
 * shrunk if it was huge) with the platform's native decoder, which reads HEIC/HEIF.
 *
 * @param force - Re-encode even a photo that looks decodable (after Skia failed to decode it).
 */
export async function preparePhoto(photo: PickedPhoto, force = false): Promise<string> {
  const plan = planPhoto(photo, force);
  if (plan.kind === 'original') {
    return photo.uri;
  }
  const context = ImageManipulator.manipulate(photo.uri);
  if (plan.resize !== null) {
    context.resize(plan.resize);
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
  return result.uri;
}
