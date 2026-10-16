/**
 * Deciding how to load a photo from the library into the canvas.
 *
 * Skia decodes JPEG, PNG and WebP but not HEIC/HEIF, the default format of iPhone (and some
 * Android) cameras, and re-encoding a full-size photo takes seconds. So the editor works with two
 * copies of each photo:
 *
 * - an **editor** copy, at most {@link EDITOR_MAX_SIDE} px: more pixels than the canvas ever
 *   takes on screen, and small enough to prepare and decode in a fraction of a second;
 * - an **export** copy, at most {@link EXPORT_MAX_SIDE} px and full JPEG quality, prepared in the
 *   background while the user edits, so exported images keep every detail.
 *
 * A copy is the original file when that is already decodable and small enough; otherwise it is
 * re-encoded once.
 */

/**
 * Longest side of the editor copy. The canvas is at most ~1300 px wide on the largest phones, so
 * 2048 px stays sharp on screen, even zoomed in a little.
 */
export const EDITOR_MAX_SIDE = 2048;

/**
 * Longest side of the export copy. Nearly 4× the height of the tallest canvas (1920 px), so
 * cropping and zooming never run out of pixels, while memory stays reasonable (a 48 MP photo would
 * take about 200 MB decoded).
 */
export const EXPORT_MAX_SIDE = 4096;

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
 * Decides whether a copy can be the original file or must be re-encoded (and possibly shrunk).
 *
 * @param maxSide - Longest side allowed for this copy.
 * @param force - Re-encode even if the photo looks decodable, e.g. after Skia failed to decode it.
 */
export function planPhoto(photo: PickedPhoto, maxSide: number, force = false): PhotoPlan {
  const tooLarge = Math.max(photo.width, photo.height) > maxSide;
  const decodable = photo.mimeType != null && DECODABLE_TYPES.has(photo.mimeType.toLowerCase());
  if (!force && !tooLarge && decodable) {
    return { kind: 'original' };
  }
  if (!tooLarge) {
    return { kind: 'reencode', resize: null };
  }
  return {
    kind: 'reencode',
    resize: photo.width >= photo.height ? { width: maxSide } : { height: maxSide },
  };
}
