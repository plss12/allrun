import { Directory, File, Paths } from 'expo-file-system';

import type { StravaCacheStore } from '@/sources/strava/strava-source';

/**
 * Where the phone keeps what Strava gave (ADR 020): one JSON file per key, in the app's cache
 * directory, which the system may empty when the phone runs out of space (then Strava is asked
 * again). Only the signed-in account's Strava is ever in it: {@link clearStravaCache} empties it
 * on disconnecting Strava and on signing out.
 */
const directory = () => new Directory(Paths.cache, 'strava');
const fileOf = (key: string) => new File(directory(), `${key}.json`);

export const stravaCacheStore: StravaCacheStore = {
  async read(key) {
    const file = fileOf(key);
    return file.exists ? (JSON.parse(await file.text()) as unknown) : null;
  },
  async write(key, value) {
    directory().create({ intermediates: true, idempotent: true });
    const file = fileOf(key);
    file.create({ overwrite: true });
    await file.write(JSON.stringify(value));
  },
  async remove(key) {
    const file = fileOf(key);
    if (file.exists) {
      file.delete();
    }
  },
  async keys() {
    const kept = directory();
    if (!kept.exists) {
      return [];
    }
    return kept
      .list()
      .filter((entry) => entry instanceof File && entry.name.endsWith('.json'))
      .map((entry) => entry.name.slice(0, -'.json'.length));
  },
};

/** Empties what the phone keeps of Strava. */
export function clearStravaCache(): void {
  const kept = directory();
  if (kept.exists) {
    kept.delete();
  }
}
