import {
  getForegroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  reverseGeocodeAsync,
} from 'expo-location';
import { File } from 'expo-file-system';
import { z } from 'zod';

import type { LatLng } from '@/core/geo';
import { type Place, placeOfAddress } from '@/core/place';
import { logError } from '@/ui/log';

import { stravaCacheDirectory } from './strava-cache-store';

/**
 * Where an activity was done, named by the device's geocoder (Apple's on iOS, Google's on
 * Android). iOS names places without asking; Android needs the location permission first, which
 * the app asks for as it opens, and again when the user picks the place widget.
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
  .nullish()
  .transform((value) =>
    value === null || value === undefined || value.trim() === '' ? null : value,
  );

/** The parts of a geocoded address a place uses; the rest is ignored. */
const addressSchema = z.object({
  city: part,
  region: part,
  subregion: part,
  country: part,
  isoCountryCode: part,
});

const placeSchema = z.object({
  city: z.string().nullable(),
  region: z.string().nullable(),
  country: z.string().nullable(),
});
const keptPlacesSchema = z.record(z.string(), placeSchema.nullable());

/**
 * Where the places already named are kept on the phone, so that the home's cards show theirs at
 * once on every launch: with Strava's activities they are named from, in a folder of their own
 * (which the Strava source's weekly pruning doesn't read), so they go when Strava is disconnected
 * or the user signs out. A point is named the same for good.
 */
const placesFile = () => new File(stravaCacheDirectory(), 'places', 'places.json');

/** Places already named, by their point (about 10 m), loaded from the phone once. */
let named: Promise<Map<string, Place | null>> | null = null;

function namedPlaces(): Promise<Map<string, Place | null>> {
  named ??= (async () => {
    const file = placesFile();
    if (!file.exists) {
      return new Map<string, Place | null>();
    }
    const kept = keptPlacesSchema.safeParse(JSON.parse(await file.text()));
    if (!kept.success) {
      logError('The places kept on the phone are damaged', kept.error);
      return new Map<string, Place | null>();
    }
    return new Map(Object.entries(kept.data));
  })().catch((error: unknown) => {
    logError('Could not read the places kept on the phone', error);
    return new Map<string, Place | null>();
  });
  return named;
}

/**
 * The geocoder is asked one place at a time: Apple's limits how often it can be asked, and the
 * home asks for every card it shows.
 */
let queue: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** Names `point` with the geocoder, unless it was already, and keeps it on the phone. */
function placeAt(point: LatLng): Promise<Place | null> {
  const key = `${point[0].toFixed(4)},${point[1].toFixed(4)}`;
  return oneAtATime(async () => {
    const loading = namedPlaces();
    const places = await loading;
    const known = places.get(key);
    if (known !== undefined) {
      return known;
    }
    const [address] = await reverseGeocodeAsync({ latitude: point[0], longitude: point[1] });
    const place = address === undefined ? null : placeOfAddress(addressSchema.parse(address));
    // Forgotten meanwhile (Strava disconnected, signed out): nothing is kept again.
    if (named !== loading) {
      return place;
    }
    places.set(key, place);
    try {
      const file = placesFile();
      file.parentDirectory.create({ intermediates: true, idempotent: true });
      file.create({ overwrite: true });
      await file.write(JSON.stringify(Object.fromEntries(places)));
    } catch (error) {
      logError('Could not keep the places on the phone', error);
    }
    return place;
  });
}

/** Forgets the places read in this session; their file goes with Strava's cache. */
export function forgetNamedPlaces(): void {
  named = null;
}

/**
 * Names the place of `point`. Without permission on Android it says so, unless `ask` lets it ask
 * for it (the user just picked the place widget). Errors are logged and read as unknown: the
 * place is an extra, the app works without it.
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
    const place = await placeAt(point);
    return place === null ? UNKNOWN_PLACE : { status: 'known', place };
  } catch (error) {
    logError('Could not name the place of the activity', error);
    return UNKNOWN_PLACE;
  }
}
