import type { LatLng } from './geo';
import type { Point } from './route-projection';

/**
 * Tile math for the map under the routes (ADR 021): Web Mercator, which zoom of the vector tiles
 * to draw at a scale, which tiles cover the drawing, and where each one lands in it.
 *
 * Coordinates are "world" units: the whole Web Mercator square is 1 × 1, x growing east from
 * longitude -180 and y growing south from latitude {@link MAX_LATITUDE}, so a tile of zoom z is
 * 1 / 2^z wide. The map and the routes over it are projected with the same viewport, so they
 * line up exactly.
 *
 * Source: the "Slippy map tilenames" page of the OpenStreetMap wiki,
 * https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
 */

/** Highest zoom the tiles have (OpenFreeMap's TileJSON, `maxzoom`): past it they are scaled up. */
export const MAX_TILE_ZOOM = 14;

/**
 * Pixels a tile is drawn at, at least, before the next zoom is used: the 512 of MapLibre's and
 * Mapbox's vector maps. A tile is so drawn between 512 and 1,024 pixels, so a 1,080 px square
 * needs from 4 to 16 tiles. Smaller would mean more tiles and more detail per image: a zoom 14
 * tile of central Madrid weighs some 600 KB (its points of interest and house numbers, which
 * the map doesn't draw), a zoom 13 one some 100 KB.
 */
export const TILE_PIXELS = 512;

/**
 * Deepest the map zooms in, as a tile zoom: a short route (or a single point) is shown at most
 * at this scale, zoom 14 tiles four times enlarged, rather than as a few blurred streets.
 */
export const MAX_VIEW_ZOOM = MAX_TILE_ZOOM + 2;

/** Latitude where the Web Mercator square ends, north and south: atan(sinh(π)), in degrees. */
export const MAX_LATITUDE = 85.0511287798066;

/** A tile: its zoom and its column and row, from the north west corner. */
export interface Tile {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/**
 * What a drawing of `width` × `height` pixels shows of the world: the world point at its top
 * left corner and how many pixels a world unit is.
 */
export interface Viewport {
  readonly left: number;
  readonly top: number;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
}

/** Where a tile lands in a drawing: a tile point (fx, fy) goes to (x + fx·scale, y + fy·scale). */
export interface TilePlacement {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/**
 * A point on the Web Mercator square (see the module's comment). Latitudes past
 * {@link MAX_LATITUDE} are clamped to its edges. Time and space O(1).
 */
export function toWorld([lat, lng]: LatLng): Point {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
  const phi = (clamped * Math.PI) / 180;
  return {
    x: (lng + 180) / 360,
    y: (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2,
  };
}

/**
 * The viewport that fits these points in a `width` × `height` drawing, centered and as big as
 * fits while keeping their shape ("contain", as `projectRoutes`), but no closer than
 * {@link MAX_VIEW_ZOOM}: a single point, or a route of a few meters, is centered at that scale.
 * Not for routes across the antimeridian (longitude ±180): they would span the whole world.
 *
 * Time O(n) for n points, space O(n).
 *
 * @throws RangeError without points, or with a drawing of no size.
 */
export function fitViewport(points: readonly LatLng[], width: number, height: number): Viewport {
  if (points.length === 0) {
    throw new RangeError('No points to fit the map to');
  }
  if (!(width > 0 && height > 0)) {
    throw new RangeError(`The map needs a size, got ${width} × ${height}`);
  }
  const world = points.map(toWorld);
  const minX = Math.min(...world.map((p) => p.x));
  const maxX = Math.max(...world.map((p) => p.x));
  const minY = Math.min(...world.map((p) => p.y));
  const maxY = Math.max(...world.map((p) => p.y));
  const scale = Math.min(
    maxX > minX ? width / (maxX - minX) : Number.POSITIVE_INFINITY,
    maxY > minY ? height / (maxY - minY) : Number.POSITIVE_INFINITY,
    TILE_PIXELS * 2 ** MAX_VIEW_ZOOM,
  );
  return {
    left: (minX + maxX) / 2 - width / 2 / scale,
    top: (minY + maxY) / 2 - height / 2 / scale,
    scale,
    width,
    height,
  };
}

/** A geographic point in the viewport's drawing, in pixels. Time and space O(1). */
export function toPixels(point: LatLng, viewport: Viewport): Point {
  const { x, y } = toWorld(point);
  return { x: (x - viewport.left) * viewport.scale, y: (y - viewport.top) * viewport.scale };
}

/**
 * The zoom of the tiles to draw for this viewport: the deepest whose tiles are drawn at least
 * {@link TILE_PIXELS} wide, from 0 to {@link MAX_TILE_ZOOM}. It depends on the scale only, so the
 * caller passes sizes in the design's units (not the phone's pixels) for the same map on every
 * phone and in the exported image. Time and space O(1).
 */
export function tileZoom(viewport: Viewport): number {
  // The epsilon keeps an exact power of two (2^13.999…) from rounding down a zoom.
  const zoom = Math.floor(Math.log2(viewport.scale / TILE_PIXELS) + 1e-9);
  return Math.max(0, Math.min(MAX_TILE_ZOOM, zoom));
}

/**
 * The tiles of zoom `z` that the viewport shows, row by row from the north west. Columns and
 * rows are clamped to the world: nothing is drawn past its edges. Time and space O(t) for the t
 * tiles returned.
 */
export function tilesCovering(viewport: Viewport, z: number): Tile[] {
  const count = 2 ** z;
  const index = (world: number) => Math.max(0, Math.min(count - 1, Math.floor(world * count)));
  // A drawing edge exactly on a tile edge doesn't need the next tile: its last pixel is before.
  const last = (world: number) => index(world - 1e-12);
  const fromX = index(viewport.left);
  const toX = last(viewport.left + viewport.width / viewport.scale);
  const fromY = index(viewport.top);
  const toY = last(viewport.top + viewport.height / viewport.scale);
  const tiles: Tile[] = [];
  for (let y = fromY; y <= toY; y++) {
    for (let x = fromX; x <= toX; x++) {
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}

/**
 * Where a tile whose geometry runs from 0 to `extent` (4,096 in OpenFreeMap's tiles) lands in
 * the viewport's drawing. Time and space O(1).
 */
export function placeTile(tile: Tile, extent: number, viewport: Viewport): TilePlacement {
  const size = 1 / 2 ** tile.z;
  return {
    x: (tile.x * size - viewport.left) * viewport.scale,
    y: (tile.y * size - viewport.top) * viewport.scale,
    scale: (size * viewport.scale) / extent,
  };
}
