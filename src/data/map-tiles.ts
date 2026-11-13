import { fetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';

import { createMapTileLoader, type MapTileLoader, type MapTileStore } from './map-tile-loader';

/**
 * The map's tiles on the phone (ADR 021): one file per tile in the app's cache directory, which
 * the system may empty when the phone runs out of space (then they are asked for again).
 */

/**
 * The tile server's TileJSON index, the map's one setting: if OpenFreeMap fails or closes, a
 * self-hosted copy of the same tiles (Planetiler) replaces it here.
 */
export const MAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';

/**
 * Most the phone keeps of tiles: 64 MB, some 380 tiles of a city center (at zoom 13, one of
 * central Madrid weighs 170 KB uncompressed), more of anywhere else.
 */
export const MAP_CACHE_BYTES = 64 * 1024 * 1024;

const directory = () => new Directory(Paths.cache, 'map-tiles');
const EXTENSION = '.pbf';
const fileOf = (key: string) => new File(directory(), `${key}${EXTENSION}`);

const mapTileStore: MapTileStore = {
  async read(key) {
    const file = fileOf(key);
    return file.exists ? await file.bytes() : null;
  },
  async write(key, bytes) {
    directory().create({ intermediates: true, idempotent: true });
    // Written aside and moved in, so a write cut short never leaves half a tile under its name.
    const part = new File(directory(), `${key}.part`);
    part.create({ overwrite: true });
    await part.write(bytes);
    part.move(fileOf(key), { overwrite: true });
  },
  async remove(key) {
    const file = fileOf(key);
    if (file.exists) {
      file.delete();
    }
  },
  async list() {
    const kept = directory();
    if (!kept.exists) {
      return [];
    }
    return kept.list().flatMap((entry) =>
      entry instanceof File && entry.name.endsWith(EXTENSION)
        ? [
            {
              key: entry.name.slice(0, -EXTENSION.length),
              bytes: entry.size,
              keptAt: entry.lastModified ?? 0,
            },
          ]
        : [],
    );
  },
};

async function fetchOk(url: string) {
  const answer = await fetch(url);
  if (!answer.ok) {
    throw new Error(`Map request failed with ${answer.status}: ${url}`);
  }
  return answer;
}

/** The app's tile loader: one for the whole run, so tiles asked for at once load once. */
export const mapTiles: MapTileLoader = createMapTileLoader({
  indexUrl: MAP_TILEJSON_URL,
  store: mapTileStore,
  fetchJson: async (url) => (await fetchOk(url)).json() as Promise<unknown>,
  fetchBytes: async (url) => (await fetchOk(url)).bytes(),
  limitBytes: MAP_CACHE_BYTES,
  now: Date.now,
});
