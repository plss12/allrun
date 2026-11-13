import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

import { MAP_LAYERS, paintFor, type MapGeometry, type MapPaint } from './map-style';

/**
 * Reading a vector tile (https://github.com/mapbox/vector-tile-spec, version 2) into what the map
 * draws (ADR 021): only the layers of {@link MAP_LAYERS}, each feature styled by `paintFor`, and
 * the features of the same paint gathered into one group, so a tile is drawn in a few paths.
 * Groups come bottom to top; within one, rings keep the tile's order.
 *
 * Polygons keep the format's winding (outer rings one way, holes the other), so a group filled
 * with the non-zero rule shows its holes. Lines and areas may run a little past the tile's square
 * (the tiles' buffer, where they overlap their neighbors): the drawing clips each tile to it.
 */

/** Features of one paint: their rings, each a flat list `[x0, y0, x1, y1, …]` in tile units. */
export interface MapTileGroup {
  readonly paint: MapPaint;
  readonly rings: readonly (readonly number[])[];
}

/** A tile as the map draws it: its groups, bottom to top, and its size in tile units. */
export interface MapTileFeatures {
  /** Tile units across the tile: its geometry runs from 0 to this (4,096 in OpenFreeMap's). */
  readonly extent: number;
  readonly groups: readonly MapTileGroup[];
}

const GEOMETRIES: Readonly<Record<number, MapGeometry>> = { 1: 'point', 2: 'line', 3: 'polygon' };

/** Every paint field, so two paints with the same look share a group. */
const paintKey = (paint: MapPaint) =>
  `${paint.order}|${paint.kind}|${paint.color}|${paint.kind === 'line' ? paint.width : ''}`;

/**
 * Decodes a tile's bytes, already uncompressed. A tile with none of the map's layers has no
 * groups, and its extent is the format's default, 4,096. Time O(b + p) for b bytes and p points
 * drawn (the features of the layers left out are skipped, not read), space O(p).
 *
 * @throws Error if the bytes aren't a vector tile, or its layers have different extents.
 */
export function decodeMapTile(bytes: Uint8Array): MapTileFeatures {
  const tile = new VectorTile(new PbfReader(bytes));
  const groups = new Map<string, { paint: MapPaint; rings: number[][] }>();
  let extent: number | null = null;
  for (const name of MAP_LAYERS) {
    const layer = tile.layers[name];
    if (layer === undefined) {
      continue;
    }
    if (extent !== null && layer.extent !== extent) {
      throw new Error(`Tile layers with different extents: ${extent} and ${layer.extent}`);
    }
    extent = layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const geometry = GEOMETRIES[feature.type];
      if (geometry === undefined) {
        continue;
      }
      const paint = paintFor(name, feature.properties, geometry);
      if (paint === null) {
        continue;
      }
      const key = paintKey(paint);
      let group = groups.get(key);
      if (group === undefined) {
        group = { paint, rings: [] };
        groups.set(key, group);
      }
      for (const ring of feature.loadGeometry()) {
        const flat = new Array<number>(ring.length * 2);
        for (let j = 0; j < ring.length; j++) {
          flat[j * 2] = ring[j].x;
          flat[j * 2 + 1] = ring[j].y;
        }
        group.rings.push(flat);
      }
    }
  }
  // `sort` on a copy, not `toSorted`: Hermes lacks it. Array sort is stable.
  const ordered = [...groups.values()].sort((a, b) => a.paint.order - b.paint.order);
  return { extent: extent ?? 4096, groups: ordered };
}
