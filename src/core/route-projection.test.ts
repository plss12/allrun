import { largestFit, projectRoutes, routeSpan } from './route-projection';

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

describe('routeSpan', () => {
  it('measures the routes as they are drawn', () => {
    const span = routeSpan([
      [
        [0, 0],
        [1, 2],
      ],
    ]);
    expect(span.width).toBeCloseTo(2, 3);
    expect(span.height).toBeCloseTo(1, 3);
    expect(routeSpan([[]])).toEqual({ width: 0, height: 0 });
  });
});

describe('largestFit', () => {
  const above = { x: 0, y: 0, width: 300, height: 100 };
  const beside = { x: 100, y: 0, width: 200, height: 200 };

  it('puts a wide route where it is widest, and a tall one where it is tallest', () => {
    expect(largestFit({ width: 3, height: 1 }, [above, beside])).toBe(above);
    expect(largestFit({ width: 1, height: 2 }, [above, beside])).toBe(beside);
  });

  it('keeps the first box on a tie, and for a single point', () => {
    const twin = { ...above, x: 50 };
    expect(largestFit({ width: 3, height: 1 }, [above, twin])).toBe(above);
    expect(largestFit({ width: 0, height: 0 }, [beside, above])).toBe(beside);
  });

  it('fits a straight line by its length alone', () => {
    expect(largestFit({ width: 1, height: 0 }, [beside, above])).toBe(above);
  });

  it('needs at least one box', () => {
    expect(() => largestFit({ width: 1, height: 1 }, [])).toThrow(RangeError);
  });
});
