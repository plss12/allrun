import { groupByPlace, projectRoutes, SAME_PLACE_GAP } from './route-projection';

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

  it('shares one projection across routes of the same place', () => {
    // Two 2 km routes half a kilometer apart, in the same city: they keep where they are.
    const [west, east] = projectRoutes(
      [
        [
          [0, 0],
          [0, 0.02],
        ],
        [
          [0, 0.025],
          [0, 0.045],
        ],
      ],
      450,
      450,
    );
    expect(west[1].x).toBeCloseTo(200);
    expect(east[0].x).toBeCloseTo(250);
  });

  it('draws routes of different places one over another, centered, at one scale', () => {
    // A loop at home (Seville) and a longer one on a trip (Rome): each centered in the box.
    const seville = [
      [37.38, -5.99],
      [37.39, -5.98],
    ] as const;
    const rome = [
      [41.89, 12.48],
      [41.91, 12.5],
    ] as const;
    const [here, there] = projectRoutes([seville, rome], 200, 200);
    const middle = (route: readonly { x: number; y: number }[]) => ({
      x: (Math.min(...route.map((p) => p.x)) + Math.max(...route.map((p) => p.x))) / 2,
      y: (Math.min(...route.map((p) => p.y)) + Math.max(...route.map((p) => p.y))) / 2,
    });
    expect(middle(here).x).toBeCloseTo(100);
    expect(middle(here).y).toBeCloseTo(100);
    expect(middle(there).x).toBeCloseTo(100);
    expect(middle(there).y).toBeCloseTo(100);
    // Rome's, twice as tall, fills the box; Seville's comes out at the same scale, half as tall.
    expect(there[0].y - there[1].y).toBeCloseTo(200);
    expect(here[0].y - here[1].y).toBeCloseTo(100);
  });

  it('centers single points and keeps empty routes empty', () => {
    expect(projectRoutes([[[40, -3]]], 200, 100)).toEqual([[{ x: 100, y: 50 }]]);
    expect(projectRoutes([[], []], 100, 100)).toEqual([[], []]);
  });
});

describe('groupByPlace', () => {
  /** A route along the equator from `fromKm` to `toKm` east (a degree is 111.19 km there). */
  const along = (fromKm: number, toKm: number): [number, number][] => [
    [0, fromKm / 111.19],
    [0, toKm / 111.19],
  ];

  it('keeps together routes that touch or nearly, and those they link in a chain', () => {
    // 0 and 1 overlap; 1 and 3 are 2 km apart, less than half of 3's 5 km; 4 is a town away.
    expect(groupByPlace([along(0, 5), along(4, 8), [], along(10, 15), along(30, 34)])).toEqual([
      [0, 1, 3],
      [4],
    ]);
  });

  it('separates nearby towns whose gap is wider than half the larger route', () => {
    // Two 5 km loops 20 km apart: drawn where they are, each would be a dot.
    expect(groupByPlace([along(0, 5), along(25, 30)])).toEqual([[0], [1]]);
    expect(groupByPlace([along(0, 10), along(10 + 10 * SAME_PLACE_GAP, 12)])).toEqual([[0, 1]]);
  });

  it('keeps one route as one place, and single points apart', () => {
    expect(groupByPlace([along(0, 5)])).toEqual([[0]]);
    expect(groupByPlace([[[0, 0]], [[0, 0.01]]])).toEqual([[0], [1]]);
  });
});
