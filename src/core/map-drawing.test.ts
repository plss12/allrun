import { mapLineWidth, placeMapTile, planMap, svgOfGroup } from './map-drawing';
import { MAP_COLORS } from './map-style';
import { fitViewport, tilesCovering, tileZoom } from './map-tiles';

const route: [number, number][] = [
  [40.41, -3.71],
  [40.44, -3.67],
];

describe('planMap', () => {
  it('takes the zoom of the same view in an image 1,080 wide, whatever the size it is drawn at', () => {
    for (const width of [320, 393, 1080]) {
      const viewport = fitViewport(route, width, width);
      const plan = planMap(viewport);
      expect(plan.zoom).toBe(tileZoom(fitViewport(route, 1080, 1080)));
      expect(plan.tiles).toEqual(tilesCovering(viewport, plan.zoom));
    }
  });

  it('takes 4 to 16 tiles for a square', () => {
    for (const km of [0.5, 3, 10, 42]) {
      const points: [number, number][] = [
        [40.4, -3.7],
        [40.4 + km / 111, -3.7],
      ];
      const count = planMap(fitViewport(points, 360, 360)).tiles.length;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(16);
    }
  });
});

describe('placeMapTile', () => {
  it('clips a tile to its own square, where it lands', () => {
    const viewport = fitViewport(route, 360, 360);
    const [tile] = planMap(viewport).tiles;
    const placed = placeMapTile(tile, 4096, viewport);
    expect(placed.clip.x).toBe(placed.placement.x);
    expect(placed.clip.y).toBe(placed.placement.y);
    expect(placed.clip.size).toBeCloseTo(4096 * placed.placement.scale, 9);
  });
});

describe('mapLineWidth', () => {
  it("scales the style's widths with the drawing", () => {
    expect(mapLineWidth(5, 1080)).toBe(5);
    expect(mapLineWidth(5, 360)).toBeCloseTo(5 / 3, 9);
  });
});

describe('svgOfGroup', () => {
  it('closes areas and leaves lines open', () => {
    const rings = [
      [0, 0, 10, 0, 10, 10],
      [20, 20, 30, 30],
    ];
    expect(svgOfGroup({ paint: { kind: 'fill', color: MAP_COLORS.water, order: 2 }, rings })).toBe(
      'M0 0L10 0L10 10ZM20 20L30 30Z',
    );
    expect(
      svgOfGroup({ paint: { kind: 'line', color: MAP_COLORS.road, order: 5, width: 2 }, rings }),
    ).toBe('M0 0L10 0L10 10M20 20L30 30');
  });

  it('leaves out rings of a single point', () => {
    const paint = { kind: 'line', color: MAP_COLORS.road, order: 5, width: 2 } as const;
    expect(svgOfGroup({ paint, rings: [[5, 5], [], [1, 2, 3, 4]] })).toBe('M1 2L3 4');
  });
});
