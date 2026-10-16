import { haversineMeters, interpolate, pathLengthMeters } from './geo';

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters([40.4168, -3.7038], [40.4168, -3.7038])).toBe(0);
  });

  it('measures one degree of latitude as ~111.2 km', () => {
    expect(haversineMeters([0, 0], [1, 0])).toBeCloseTo(111_195, -1);
  });

  it('matches a known city distance (Paris to London, ~343.5 km)', () => {
    const paris = [48.8566, 2.3522] as const;
    const london = [51.5074, -0.1278] as const;
    expect(haversineMeters(paris, london) / 1000).toBeCloseTo(343.5, 0);
  });
});

describe('pathLengthMeters', () => {
  it('is zero for empty and single-point paths', () => {
    expect(pathLengthMeters([])).toBe(0);
    expect(pathLengthMeters([[1, 1]])).toBe(0);
  });

  it('sums the segments', () => {
    expect(
      pathLengthMeters([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
    ).toBeCloseTo(2 * 111_195, -1);
  });
});

describe('interpolate', () => {
  it('returns the endpoints and the midpoint', () => {
    expect(interpolate([0, 0], [2, 4], 0)).toEqual([0, 0]);
    expect(interpolate([0, 0], [2, 4], 1)).toEqual([2, 4]);
    expect(interpolate([0, 0], [2, 4], 0.5)).toEqual([1, 2]);
  });
});
