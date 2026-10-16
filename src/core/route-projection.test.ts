import { projectRoutes } from './route-projection';

describe('projectRoutes', () => {
  it('fits a route into the box, centered, with north up', () => {
    // At the equator one degree of longitude and latitude have the same length.
    const [route] = projectRoutes(
      [
        [
          [0, 0],
          [1, 0],
          [1, 2],
        ],
      ],
      100,
      100,
    );
    // 2 wide × 1 tall: width limits the scale to ~50 px per degree, centered vertically. Near the
    // equator longitudes barely shrink, hence the approximate comparisons.
    const expected = [
      { x: 0, y: 75 },
      { x: 0, y: 25 }, // north is up
      { x: 100, y: 25 },
    ];
    route.forEach((point, i) => {
      expect(point.x).toBeCloseTo(expected[i].x, 1);
      expect(point.y).toBeCloseTo(expected[i].y, 1);
    });
  });

  it('shrinks longitudes away from the equator', () => {
    // At 60° a degree of longitude is half a degree of latitude, so this is a square.
    const [route] = projectRoutes(
      [
        [
          [60, 0],
          [61, 2],
        ],
      ],
      100,
      100,
    );
    const width = route[1].x - route[0].x;
    const height = route[0].y - route[1].y;
    expect(width / height).toBeCloseTo(1, 1);
  });

  it('shares one projection across routes', () => {
    const [west, east] = projectRoutes(
      [
        [
          [0, 0],
          [0, 1],
        ],
        [
          [0, 2],
          [0, 3],
        ],
      ],
      300,
      300,
    );
    expect(west[1].x).toBeCloseTo(100);
    expect(east[0].x).toBeCloseTo(200);
  });

  it('centers single points and keeps empty routes empty', () => {
    expect(projectRoutes([[[40, -3]]], 200, 100)).toEqual([[{ x: 100, y: 50 }]]);
    expect(projectRoutes([[], []], 100, 100)).toEqual([[], []]);
  });
});
