import { decodeMapTile, trimMapTile, type MapTileFeatures } from '@/core/map-tile-decode';
import {
  parseTileJson,
  tileKey,
  tilesToEvict,
  tileUrl,
  type KeptTile,
  type TileSource,
} from '@/core/map-tile-source';
import type { Tile } from '@/core/map-tiles';

/**
 * Loading the map's tiles (ADR 021): from the phone when it kept them, else from the tile server,
 * whose address is read once per run from its TileJSON index. Every tile asked for is kept,
 * trimmed to what the map draws (a tenth of it, or less, in a city), and once they pass the size
 * limit the oldest go. The same tile asked for twice at once is loaded
 * once. Requests and files come in from outside: `data/map-tiles.ts` gives the phone's.
 */

/** Where the phone keeps the tiles, trimmed and uncompressed, by {@link tileKey}. */
export interface MapTileStore {
  /** The tile's bytes, or null if it isn't kept. */
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, bytes: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
  /** Every kept tile, with its size and when it was kept. */
  list(): Promise<KeptTile[]>;
}

export interface MapTileLoaderOptions {
  /** The address of the tile server's TileJSON index. */
  readonly indexUrl: string;
  readonly store: MapTileStore;
  /** The answer's body parsed as JSON; rejects on a failed request or a status other than 2xx. */
  readonly fetchJson: (url: string) => Promise<unknown>;
  /** The answer's body, uncompressed; rejects as `fetchJson`. */
  readonly fetchBytes: (url: string) => Promise<Uint8Array>;
  /** Most bytes of tiles the phone keeps. */
  readonly limitBytes: number;
  /** Milliseconds since the epoch. */
  readonly now: () => number;
}

export interface MapTileLoader {
  /**
   * The tile as the map draws it. Rejects if it isn't kept and can't be fetched, or if its bytes
   * aren't a tile: a kept tile that doesn't decode (a write cut short) is deleted first, so the
   * next load asks for it again.
   */
  load(tile: Tile): Promise<MapTileFeatures>;
}

/** A loader of tiles; keep one per app run, so its index and the tiles in flight are shared. */
export function createMapTileLoader(options: MapTileLoaderOptions): MapTileLoader {
  const { store, limitBytes, now } = options;
  const inFlight = new Map<string, Promise<MapTileFeatures>>();
  let source: Promise<TileSource> | null = null;
  let kept: Promise<Map<string, KeptTile>> | null = null;

  // A failed request isn't kept: the next tile asks again.
  const sourceOnce = () => {
    source ??= options
      .fetchJson(options.indexUrl)
      .then(parseTileJson)
      .catch((error: unknown) => {
        source = null;
        throw error;
      });
    return source;
  };

  const keptOnce = () => {
    kept ??= store
      .list()
      .then((tiles) => new Map(tiles.map((tile) => [tile.key, tile])))
      .catch((error: unknown) => {
        kept = null;
        throw error;
      });
    return kept;
  };

  const keep = async (key: string, bytes: Uint8Array) => {
    const index = await keptOnce();
    await store.write(key, bytes);
    index.set(key, { key, bytes: bytes.length, keptAt: now() });
    for (const evicted of tilesToEvict([...index.values()], limitBytes)) {
      index.delete(evicted);
      await store.remove(evicted);
    }
  };

  const loadOnce = async (tile: Tile, key: string): Promise<MapTileFeatures> => {
    const stored = await store.read(key);
    if (stored !== null) {
      try {
        return decodeMapTile(stored);
      } catch (error) {
        (await keptOnce()).delete(key);
        await store.remove(key);
        throw new Error(`Kept map tile ${key} didn't decode, deleted`, { cause: error });
      }
    }
    const fetched = await options.fetchBytes(tileUrl(await sourceOnce(), tile));
    const trimmed = trimMapTile(fetched);
    const features = decodeMapTile(trimmed);
    await keep(key, trimmed);
    return features;
  };

  return {
    load(tile) {
      const key = tileKey(tile);
      let loading = inFlight.get(key);
      if (loading === undefined) {
        loading = loadOnce(tile, key).finally(() => inFlight.delete(key));
        inFlight.set(key, loading);
      }
      return loading;
    },
  };
}
