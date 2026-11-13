import type { LatLng } from './geo';
import {
  fitViewport,
  MAX_LATITUDE,
  MAX_TILE_ZOOM,
  MAX_VIEW_ZOOM,
  placeTile,
  TILE_PIXELS,
  tilesCovering,
  tileZoom,
  toPixels,
  toWorld,
  type Viewport,
} from './map-tiles';

/** Degrees of longitude east of `lng` that are `km` at latitude `lat` (spherical Earth). */
const eastKm = (lat: number, km: number) => km / (111.32 * Math.cos((lat * Math.PI) / 180));

describe('toWorld', () => {
  it('puts the equator and the prime meridian in the middle, the north west at 0', () => {
    expect(toWorld([0, 0])).toEqual({ x: 0.5, y: 0.5 });
    const corner = toWorld([MAX_LATITUDE, -180]);
    expect(corner.x).toBe(0);
    expect(corner.y).toBeCloseTo(0, 12);
  });

  it('clamps the poles to the square', () => {
    expect(toWorld([90, 180]).y).toBeCloseTo(0, 12);
    expect(toWorld([-90, 0]).y).toBeCloseTo(1, 12);
  });

  it('mirrors the south on the north', () => {
    expect(toWorld([40, 3]).y + toWorld([-40, 3]).y).toBeCloseTo(1, 12);
  });

  it('keeps shapes: at 60° a degree of longitude is drawn as long as half one of latitude', () => {
    const origin = toWorld([60, 10]);
    const north = toWorld([60.001, 10]);
    const east = toWorld([60, 10.002]);
    expect(east.x - origin.x).toBeCloseTo(origin.y - north.y, 7);
  });

  it("finds Madrid's Puerta del Sol in its zoom 14 tile", () => {
    // Slippy map tilenames: x = 2^14 · (lng + 180) / 360 = 8,023.4 and
    // y = 2^14 · (1 - asinh(tan 40.41689°) / π) / 2 = 2^14 · 0.37707 = 6,177.9.
    const { x, y } = toWorld([40.41689, -3.70358]);
    expect(Math.floor(x * 2 ** 14)).toBe(8023);
    expect(Math.floor(y * 2 ** 14)).toBe(6177);
  });
});

describe('fitViewport', () => {
  it('centers the points and fits them, keeping their shape', () => {
    const route: LatLng[] = [
      [0, 0],
      [0, 1],
    ];
    const viewport = fitViewport(route, 100, 60);
    const [west, east] = route.map((point) => toPixels(point, viewport));
    expect(west.x).toBeCloseTo(0, 9);
    expect(east.x).toBeCloseTo(100, 9);
    expect(west.y).toBeCloseTo(30, 9);
    expect(east.y).toBeCloseTo(30, 9);
  });

  it('fits by the side the points fill first', () => {
    // 1 km north-south in a wide drawing: the height decides.
    const viewport = fitViewport(
      [
        [40, -3],
        [40.009, -3],
      ],
      300,
      100,
    );
    const north = toPixels([40.009, -3], viewport);
    const south = toPixels([40, -3], viewport);
    expect(north.y).toBeCloseTo(0, 9);
    expect(south.y).toBeCloseTo(100, 9);
    expect(north.x).toBeCloseTo(150, 9);
  });

  it('centers a single point at the deepest view', () => {
    const viewport = fitViewport([[40.4, -3.7]], 200, 100);
    expect(viewport.scale).toBe(TILE_PIXELS * 2 ** MAX_VIEW_ZOOM);
    const point = toPixels([40.4, -3.7], viewport);
    expect(point.x).toBeCloseTo(100, 6);
    expect(point.y).toBeCloseTo(50, 6);
  });

  it('does not zoom in past the deepest view on a route of a few meters', () => {
    const viewport = fitViewport(
      [
        [40.4, -3.7],
        [40.4, -3.69999],
      ],
      1080,
      1080,
    );
    expect(viewport.scale).toBe(TILE_PIXELS * 2 ** MAX_VIEW_ZOOM);
  });

  it('refuses no points and drawings with no size', () => {
    expect(() => fitViewport([], 100, 100)).toThrow(RangeError);
    expect(() => fitViewport([[0, 0]], 0, 100)).toThrow(RangeError);
    expect(() => fitViewport([[0, 0]], 100, Number.NaN)).toThrow(RangeError);
  });
});

describe('tileZoom', () => {
  const at = (scale: number): Viewport => ({ left: 0, top: 0, scale, width: 1, height: 1 });

  it('takes the deepest zoom whose tiles are drawn at least TILE_PIXELS wide', () => {
    expect(tileZoom(at(TILE_PIXELS * 2 ** 13))).toBe(13);
    expect(tileZoom(at(TILE_PIXELS * 2 ** 13 * 0.999))).toBe(12);
    expect(tileZoom(at(TILE_PIXELS * 2 ** 13 * 1.999))).toBe(13);
  });

  it('stays within the zooms the tiles have', () => {
    expect(tileZoom(at(TILE_PIXELS * 2 ** MAX_VIEW_ZOOM))).toBe(MAX_TILE_ZOOM);
    expect(tileZoom(at(1))).toBe(0);
  });

  it('draws less detail the longer the route, on a 1,080 px card in Madrid', () => {
    const zoomFor = (km: number) =>
      tileZoom(
        fitViewport(
          [
            [40.4, -3.7],
            [40.4, -3.7 + eastKm(40.4, km)],
          ],
          1080,
          1080,
        ),
      );
    expect(zoomFor(3)).toBe(14);
    expect(zoomFor(5)).toBe(13);
    expect(zoomFor(10)).toBe(12);
    expect(zoomFor(42)).toBe(10);
  });
});

describe('tilesCovering', () => {
  const world: Viewport = { left: 0, top: 0, scale: 512, width: 512, height: 512 };

  it('lists the tiles row by row from the north west', () => {
    expect(tilesCovering(world, 0)).toEqual([{ z: 0, x: 0, y: 0 }]);
    expect(tilesCovering(world, 1)).toEqual([
      { z: 1, x: 0, y: 0 },
      { z: 1, x: 1, y: 0 },
      { z: 1, x: 0, y: 1 },
      { z: 1, x: 1, y: 1 },
    ]);
  });

  it('does not take the next tile when the drawing ends on a tile edge', () => {
    const viewport: Viewport = { left: 0.25, top: 0.25, scale: 512, width: 128, height: 128 };
    expect(tilesCovering(viewport, 2)).toEqual([{ z: 2, x: 1, y: 1 }]);
  });

  it('stops at the edges of the world', () => {
    const past: Viewport = { left: -0.5, top: 0.75, scale: 512, width: 1024, height: 512 };
    expect(tilesCovering(past, 1)).toEqual([
      { z: 1, x: 0, y: 1 },
      { z: 1, x: 1, y: 1 },
    ]);
  });

  it('needs at most 16 tiles for a 1,080 px square at its zoom', () => {
    // Tiles of 512 to 1,024 px: at most 4 per side, wherever the square falls.
    for (const km of [0.5, 3, 5, 7, 10, 42, 120]) {
      for (const shift of [0, 0.0013, 0.0071]) {
        const viewport = fitViewport(
          [
            [40.4 + shift, -3.7 + shift],
            [40.4 + shift, -3.7 + shift + eastKm(40.4, km)],
          ],
          1080,
          1080,
        );
        const tiles = tilesCovering(viewport, tileZoom(viewport));
        expect(tiles.length).toBeGreaterThanOrEqual(1);
        expect(tiles.length).toBeLessThanOrEqual(16);
      }
    }
  });
});

describe('placeTile', () => {
  it('scales the tile from its extent to its size in the drawing', () => {
    const viewport: Viewport = { left: 0.5, top: 0, scale: 1024, width: 512, height: 512 };
    expect(placeTile({ z: 1, x: 1, y: 0 }, 4096, viewport)).toEqual({ x: 0, y: 0, scale: 0.125 });
    expect(placeTile({ z: 1, x: 1, y: 1 }, 4096, viewport)).toEqual({ x: 0, y: 512, scale: 0.125 });
  });

  it('puts a point of the tile where the route puts the same place', () => {
    const point: LatLng = [41.3874, 2.1686];
    const viewport = fitViewport(
      [
        [41.38, 2.16],
        [41.4, 2.19],
      ],
      1080,
      720,
    );
    const z = tileZoom(viewport);
    const extent = 4096;
    const world = toWorld(point);
    const tile = { z, x: Math.floor(world.x * 2 ** z), y: Math.floor(world.y * 2 ** z) };
    const placement = placeTile(tile, extent, viewport);
    const fx = (world.x * 2 ** z - tile.x) * extent;
    const fy = (world.y * 2 ** z - tile.y) * extent;
    const expected = toPixels(point, viewport);
    expect(placement.x + fx * placement.scale).toBeCloseTo(expected.x, 6);
    expect(placement.y + fy * placement.scale).toBeCloseTo(expected.y, 6);
  });
});
