import { Image } from 'expo-image';

import { framePhoto, type PhotoFraming, type Size } from '@/core/photo-framing';
import { logError } from '@/ui/log';

/**
 * Shows the chosen photo with the system image viewer while Skia's copy is being prepared. The
 * system viewer decodes every library format (HEIC included) in hardware, so the photo appears at
 * once; it sits under the transparent Skia canvas and is framed with the same `framePhoto` as the
 * canvas, so the hand-over to Skia doesn't move the picture.
 */
export function PhotoPreview({
  uri,
  size,
  onSize,
  canvas,
  ratio,
  framing,
}: {
  readonly uri: string;
  /** Photo size reported by the viewer once loaded; `null` before that. */
  readonly size: Size | null;
  readonly onSize: (size: Size) => void;
  /** Canvas size in export pixels. */
  readonly canvas: Size;
  /** On-screen points per canvas pixel. */
  readonly ratio: number;
  readonly framing: PhotoFraming;
}) {
  // Until the viewer reports the photo size, a centered cover fit is exactly the default framing.
  const rect = size === null ? null : framePhoto(size, canvas, framing);
  return (
    <Image
      source={{ uri }}
      accessibilityIgnoresInvertColors
      contentFit={rect === null ? 'cover' : 'fill'}
      onLoad={({ source }) => onSize({ width: source.width, height: source.height })}
      onError={({ error }) => logError('System viewer could not show the photo', error)}
      style={
        rect === null
          ? { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }
          : {
              position: 'absolute',
              left: rect.x * ratio,
              top: rect.y * ratio,
              width: rect.width * ratio,
              height: rect.height * ratio,
            }
      }
    />
  );
}
