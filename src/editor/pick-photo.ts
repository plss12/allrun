import {
  launchImageLibraryAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from 'expo-image-picker';

import type { PickedPhoto } from './photo-plan';

/**
 * Opens the system's photo library to pick one photo (until R4's own grid): the photo, or `null`
 * when the user cancels.
 *
 * @throws Error when the library can't be opened.
 */
export async function pickFromLibrary(): Promise<PickedPhoto | null> {
  const result = await launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    // Keep the original file (HEIC included); preparePhoto re-encodes it once if needed, instead
    // of the picker transcoding every photo.
    preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  return result.canceled || result.assets.length === 0 ? null : result.assets[0];
}
