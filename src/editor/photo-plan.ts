/**
 * Deciding how to load a photo from the library into the canvas.
 *
 * Skia decodes JPEG, PNG and WebP but not HEIC/HEIF, the default format of iPhone (and some
 * Android) cameras. And a 48 MP photo takes about 200 MB once decoded, while the largest export is
 * 1080 × 1920. So photos that are not in a decodable format, or that are far larger than any export
 * needs, are re-encoded once at full JPEG quality; everything else is used untouched.
 */

/**
 * Longest side kept for a photo. Nearly 4× the height of the tallest canvas (1920 px), so
 * cropping and zooming never run out of pixels, while memory stays reasonable.
 */
export const MAX_PHOTO_SIDE = 4096;

/** MIME types Skia can decode on iOS and Android. */
const DECODABLE_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** What the image picker tells us about the chosen photo. */
export interface PickedPhoto {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  /** Not always reported; an unknown type is treated as not decodable. */
  readonly mimeType?: string | null;
}

export type PhotoPlan =
  | { readonly kind: 'original' }
  | {
      readonly kind: 'reencode';
      /** Target size for the longest side, or `null` to keep the size. */
      readonly resize: { readonly width: number } | { readonly height: number } | null;
    };

/**
 * Decides whether the photo can be drawn as picked or must be re-encoded (and possibly shrunk).
 *
 * @param force - Re-encode even if the photo looks decodable, e.g. after Skia failed to decode it.
 */
export function planPhoto(photo: PickedPhoto, force = false): PhotoPlan {
  const tooLarge = Math.max(photo.width, photo.height) > MAX_PHOTO_SIDE;
  const decodable = photo.mimeType != null && DECODABLE_TYPES.has(photo.mimeType.toLowerCase());
  if (!force && !tooLarge && decodable) {
    return { kind: 'original' };
  }
  if (!tooLarge) {
    return { kind: 'reencode', resize: null };
  }
  return {
    kind: 'reencode',
    resize: photo.width >= photo.height ? { width: MAX_PHOTO_SIDE } : { height: MAX_PHOTO_SIDE },
  };
}
