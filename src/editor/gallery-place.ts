import type { Place } from '@/core/place';
import type { PlaceLookup } from '@/data/place-lookup';

import type { EditorData } from './editor-data';

/**
 * `data` as a gallery draws it: with the activity's place when it is named, or with `sample`'s
 * while naming it needs the user's permission (Android), so that a widget or design with the place
 * shows what it would write. Without a place, as it is. Time and space O(1).
 */
export function galleryData(data: EditorData, lookup: PlaceLookup, sample: Place): EditorData {
  if (data.mode !== 'activity') {
    return data;
  }
  return lookup.status === 'known'
    ? { ...data, place: lookup.place }
    : lookup.status === 'needsPermission'
      ? { ...data, place: sample }
      : data;
}
