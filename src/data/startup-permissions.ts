import { requestForegroundPermissionsAsync } from 'expo-location';

import { logError } from '@/ui/log';

import { askPhotoAccess } from './photo-library';

/**
 * Asks, as the app opens, for every permission it uses (the owner's decision): reading the
 * photos (on the iPhone it also lets the app save to them; recent Androids need nothing to save)
 * and, on Android, the location, which its geocoder needs to name where an activity started (the
 * phone's own location is never used). The system shows each dialog only while it may still ask:
 * once answered, nothing shows. A refusal is no error: each feature works without, as before.
 */
export async function askStartupPermissions(): Promise<void> {
  try {
    await askPhotoAccess();
  } catch (error) {
    logError('Could not ask for access to the photos', error);
  }
  if (process.env.EXPO_OS !== 'android') {
    return;
  }
  try {
    await requestForegroundPermissionsAsync();
  } catch (error) {
    logError('Could not ask for the location permission', error);
  }
}
