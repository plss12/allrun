import { setImageAsync } from 'expo-clipboard';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { shareAsync } from 'expo-sharing';

import type { ExportEncoding } from '@/core/export';

/**
 * Adds an exported image to the photo library. Asks only for permission to add photos, never to
 * read them. Returns `denied` when the user refused it.
 */
export async function saveToPhotos(uri: string): Promise<'saved' | 'denied'> {
  const permission = await requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) {
    return 'denied';
  }
  await Asset.create(uri);
  return 'saved';
}

/** Opens the system share sheet with an exported image. */
export async function shareImage(uri: string, encoding: ExportEncoding): Promise<void> {
  await shareAsync(uri, { mimeType: encoding.mimeType, UTI: encoding.uti });
}

/**
 * Copies an exported image, given as base64. A transparent PNG pasted into an Instagram story
 * becomes a sticker over it, which sharing can't do.
 */
export async function copyImage(base64: string): Promise<void> {
  await setImageAsync(base64);
}
