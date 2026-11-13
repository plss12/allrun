import { VectorTileLayer } from '@mapbox/vector-tile';
import { PbfReader, PbfWriter } from 'pbf';

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
 *
 * A tile as the server sends it is mostly what the map doesn't draw (a zoom 14 tile of central
 * Madrid: 1 MB, of which points of interest, buildings, house numbers and names): the phone
 * keeps it trimmed to what it draws ({@link trimMapTile}), some 45 KB.
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

/** The format's default extent, for a tile without any of the map's layers. */
const DEFAULT_EXTENT = 4096;

const GEOMETRIES: Readonly<Record<number, MapGeometry>> = { 1: 'point', 2: 'line', 3: 'polygon' };

/** Field numbers of the format's messages. */
const TILE_LAYER = 3;
const LAYER = { name: 1, feature: 2, key: 3, value: 4, extent: 5, version: 15 } as const;
const FEATURE = { tags: 2, type: 3, geometry: 4 } as const;
const VALUE_STRING = 1;

/**
 * The tile's layers that the map draws, in {@link MAP_LAYERS}'s order. The others are skipped
 * without reading their features, keys or values (a city center's points of interest carry
 * names in dozens of languages). Time O(b) for b bytes, space O(l) for the layers read.
 */
function mapLayers(bytes: Uint8Array): VectorTileLayer[] {
  const pbf = new PbfReader(bytes);
  const found = new Map<string, VectorTileLayer>();
  while (pbf.pos < pbf.length) {
    const tag = pbf.readVarint();
    if (tag >> 3 !== TILE_LAYER) {
      pbf.skip(tag);
      continue;
    }
    const end = pbf.readVarint() + pbf.pos;
    if (end > pbf.length) {
      throw new Error(`A vector tile's layer runs past its ${bytes.length} bytes`);
    }
    const start = pbf.pos;
    let name: string | null = null;
    while (pbf.pos < end && name === null) {
      const field = pbf.readVarint();
      if (field >> 3 === LAYER.name) {
        name = pbf.readString();
      } else {
        pbf.skip(field);
      }
    }
    if (name !== null && MAP_LAYERS.includes(name) && !found.has(name)) {
      pbf.pos = start;
      found.set(name, new VectorTileLayer(pbf, end));
    }
    pbf.pos = end;
  }
  return MAP_LAYERS.flatMap((name) => found.get(name) ?? []);
}

/** The extent shared by the layers; throws if they differ. */
function sharedExtent(layers: readonly VectorTileLayer[]): number {
  const extent = layers[0]?.extent ?? DEFAULT_EXTENT;
  for (const layer of layers) {
    if (layer.extent !== extent) {
      throw new Error(`Tile layers with different extents: ${extent} and ${layer.extent}`);
    }
  }
  return extent;
}

/** Each drawn feature of the layers, with its paint and its rings. */
function* drawnFeatures(layers: readonly VectorTileLayer[]) {
  for (const layer of layers) {
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const geometry = GEOMETRIES[feature.type];
      if (geometry === undefined) {
        continue;
      }
      const paint = paintFor(layer.name, feature.properties, geometry);
      if (paint !== null) {
        yield { layer, feature, paint };
      }
    }
  }
}

/** Every paint field, so two paints with the same look share a group. */
const paintKey = (paint: MapPaint) =>
  `${paint.order}|${paint.kind}|${paint.color}|${paint.kind === 'line' ? paint.width : ''}`;

/**
 * Decodes a tile's bytes, already uncompressed, whole or trimmed. A tile with none of the map's
 * layers has no groups, and its extent is the format's default, 4,096. Time O(b + p) for b bytes
 * and p points drawn, space O(p).
 *
 * @throws Error if the bytes aren't a vector tile, or its layers have different extents.
 */
export function decodeMapTile(bytes: Uint8Array): MapTileFeatures {
  const layers = mapLayers(bytes);
  const extent = sharedExtent(layers);
  const groups = new Map<string, { paint: MapPaint; rings: number[][] }>();
  for (const { feature, paint } of drawnFeatures(layers)) {
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
  // `sort` on a copy, not `toSorted`: Hermes lacks it. Array sort is stable.
  const ordered = [...groups.values()].sort((a, b) => a.paint.order - b.paint.order);
  return { extent, groups: ordered };
}

const zigzag = (n: number) => (n << 1) ^ (n >> 31);
const command = (id: number, count: number) => (id & 0x7) | (count << 3);

/**
 * A feature's geometry as the format's commands: MoveTo, LineTo and, for polygons, ClosePath,
 * with zigzagged deltas. `loadGeometry` gives a polygon's rings with their first point repeated
 * at the end, which ClosePath stands for.
 */
function geometryCommands(
  rings: readonly (readonly { readonly x: number; readonly y: number }[])[],
  polygon: boolean,
): number[] {
  const out: number[] = [];
  let x = 0;
  let y = 0;
  for (const ring of rings) {
    const count = polygon ? ring.length - 1 : ring.length;
    if (count < 1) {
      continue;
    }
    out.push(command(1, 1), zigzag(ring[0].x - x), zigzag(ring[0].y - y));
    x = ring[0].x;
    y = ring[0].y;
    if (count > 1) {
      out.push(command(2, count - 1));
      for (let i = 1; i < count; i++) {
        out.push(zigzag(ring[i].x - x), zigzag(ring[i].y - y));
        x = ring[i].x;
        y = ring[i].y;
      }
    }
    if (polygon) {
      out.push(command(7, 1));
    }
  }
  return out;
}

/** The properties `paintFor` reads, which a trimmed tile keeps (tunnels are already left out). */
const KEPT_PROPERTIES = ['class', 'subclass'] as const;

/**
 * The tile with only what the map draws: its layers of {@link MAP_LAYERS}, their features that
 * `paintFor` paints and, of their properties, `class` and `subclass`. A vector tile still, which
 * {@link decodeMapTile} reads as the whole one and draws the same. Time O(b + p) for b bytes and
 * p points kept, space O(p).
 *
 * @throws Error as {@link decodeMapTile}.
 */
export function trimMapTile(bytes: Uint8Array): Uint8Array {
  const layers = mapLayers(bytes);
  sharedExtent(layers);
  const out = new PbfWriter();
  for (const layer of layers) {
    const features = [...drawnFeatures([layer])];
    if (features.length === 0) {
      continue;
    }
    const keys: string[] = [];
    const values: string[] = [];
    const index = (list: string[], item: string) => {
      const at = list.indexOf(item);
      return at === -1 ? list.push(item) - 1 : at;
    };
    out.writeMessage(
      TILE_LAYER,
      (_: null, pbf: PbfWriter) => {
        pbf.writeVarintField(LAYER.version, 2);
        pbf.writeStringField(LAYER.name, layer.name);
        for (const { feature } of features) {
          const tags = KEPT_PROPERTIES.flatMap((key) => {
            const value = feature.properties[key];
            return typeof value === 'string' ? [index(keys, key), index(values, value)] : [];
          });
          pbf.writeMessage(
            LAYER.feature,
            (__: null, featurePbf: PbfWriter) => {
              featurePbf.writePackedVarint(FEATURE.tags, tags);
              featurePbf.writeVarintField(FEATURE.type, feature.type);
              featurePbf.writePackedVarint(
                FEATURE.geometry,
                geometryCommands(feature.loadGeometry(), feature.type === 3),
              );
            },
            null,
          );
        }
        keys.forEach((key) => pbf.writeStringField(LAYER.key, key));
        values.forEach((value) =>
          pbf.writeMessage(
            LAYER.value,
            (__: null, valuePbf: PbfWriter) => valuePbf.writeStringField(VALUE_STRING, value),
            null,
          ),
        );
        pbf.writeVarintField(LAYER.extent, layer.extent);
      },
      null,
    );
  }
  return out.finish();
}
