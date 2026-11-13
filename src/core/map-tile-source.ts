import { z } from 'zod';

import type { Tile } from './map-tiles';

/**
 * Where the map's tiles come from and how many the phone keeps (ADR 021), as pure steps: the
 * tile address read from the server's TileJSON index, each tile's address and the name it is
 * kept under, and which kept tiles go once they pass a size limit. `data/map-tiles.ts` does the
 * requests and the files.
 *
 * TileJSON: https://github.com/mapbox/tilejson-spec/tree/master/3.0.0
 */

/** Where tiles are asked for: an address with `{z}`, `{x}` and `{y}` in it. */
export interface TileSource {
  readonly template: string;
}

const tileJsonSchema = z.object({
  tiles: z
    .array(
      z.url().refine((url) => ['{z}', '{x}', '{y}'].every((part) => url.includes(part)), {
        message: 'A tile address needs {z}, {x} and {y}',
      }),
    )
    .min(1),
});

/**
 * The tile source a TileJSON index names: its first address (OpenFreeMap's has one, which names
 * the data's version, as `…/planet/20261101_080013_pt/{z}/{x}/{y}.pbf`). Time and space O(1)
 * past the parse.
 *
 * @throws ZodError if the index has no usable tile address.
 */
export function parseTileJson(json: unknown): TileSource {
  return { template: tileJsonSchema.parse(json).tiles[0] };
}

/** A tile's address in the source. Time and space O(1). */
export function tileUrl(source: TileSource, { z, x, y }: Tile): string {
  return source.template.replace('{z}', `${z}`).replace('{x}', `${x}`).replace('{y}', `${y}`);
}

/**
 * The name a tile is kept under, as `14-8022-6176`. It leaves out the data's version: a tile
 * kept from an older one still shows the same streets, and isn't asked for again. Time and space
 * O(1).
 */
export function tileKey({ z, x, y }: Tile): string {
  return `${z}-${x}-${y}`;
}

/** A kept tile: its name, its size in bytes and when it was kept, in ms since the epoch. */
export interface KeptTile {
  readonly key: string;
  readonly bytes: number;
  readonly keptAt: number;
}

/**
 * The kept tiles to delete so the rest fit in `limitBytes`: the oldest first, as few as needed.
 * Ties go by name, so the choice doesn't depend on the order the files are listed in. Time
 * O(n log n) for n tiles, space O(n).
 *
 * @throws RangeError with a negative limit.
 */
export function tilesToEvict(kept: readonly KeptTile[], limitBytes: number): string[] {
  if (!(limitBytes >= 0)) {
    throw new RangeError(`The tiles' limit must be 0 or more, got ${limitBytes}`);
  }
  let total = kept.reduce((sum, tile) => sum + tile.bytes, 0);
  const oldestFirst = [...kept].sort(
    (a, b) => a.keptAt - b.keptAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const evicted: string[] = [];
  for (const tile of oldestFirst) {
    if (total <= limitBytes) {
      break;
    }
    evicted.push(tile.key);
    total -= tile.bytes;
  }
  return evicted;
}
