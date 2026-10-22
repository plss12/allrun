import {
  getForegroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  reverseGeocodeAsync,
} from 'expo-location';
import { z } from 'zod';

import type { LatLng } from '@/core/geo';
import type { Place } from '@/core/place';
import { logError } from '@/ui/log';

/**
 * Where an activity was done, named by the device's geocoder (Apple's on iOS, Google's on
 * Android). iOS names places without asking; Android needs the location permission first, so it
 * is only asked for when the user picks the place widget. Milestone 4 moves this to the map
 * provider, without permissions on either (ADR 009).
 */
export type PlaceLookup =
  | { readonly status: 'known'; readonly place: Place }
  /** No route, nothing found or the geocoder failed: no place widget. */
  | { readonly status: 'unknown' }
  /** Android, before the user allowed it: the widget is offered and asks when picked. */
  | { readonly status: 'needsPermission' };

export const UNKNOWN_PLACE: PlaceLookup = { status: 'unknown' };

/** A part of an address; geocoders sometimes give an empty one, which means unknown. */
const part = z
  .string()
  .nullable()
  .transform((value) => (value === null || value.trim() === '' ? null : value));

/** The parts of a geocoded address a place uses; the rest is ignored. */
const addressSchema = z.object({ city: part, region: part, country: part });

/** Places already named, by their point: the geocoder limits how often it can be asked. */
const named = new Map<string, Place | null>();

/**
 * Names the place of `point`. Without permission on Android it says so, unless `ask` lets it ask
 * for it (the user just picked the place widget). Errors are logged and read as unknown: the
 * place is an extra, the editor works without it.
 */
export async function lookUpPlace(point: LatLng | null, ask: boolean): Promise<PlaceLookup> {
  if (point === null) {
    return UNKNOWN_PLACE;
  }
  try {
    if (process.env.EXPO_OS === 'android') {
      const { granted } = ask
        ? await requestForegroundPermissionsAsync()
        : await getForegroundPermissionsAsync();
      if (!granted) {
        return ask ? UNKNOWN_PLACE : { status: 'needsPermission' };
      }
    }
    const key = `${point[0].toFixed(4)},${point[1].toFixed(4)}`;
    if (!named.has(key)) {
      const [address] = await reverseGeocodeAsync({ latitude: point[0], longitude: point[1] });
      named.set(key, address === undefined ? null : addressSchema.parse(address));
    }
    const place = named.get(key) ?? null;
    return place === null ? UNKNOWN_PLACE : { status: 'known', place };
  } catch (error) {
    logError('Could not name the place of the activity', error);
    return UNKNOWN_PLACE;
  }
}
