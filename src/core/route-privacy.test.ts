import { haversineMeters, type LatLng, pathLengthMeters } from './geo';
import { trimRouteEnds } from './route-privacy';

// Straight line north along a meridian: 0.001° of latitude is ~111.2 m.
const STEP_METERS = haversineMeters([0, 0], [0.001, 0]);
const straightRoute = (steps: number): LatLng[] =>
  Array.from({ length: steps + 1 }, (_, i) => [i * 0.001, 0] as const);

describe('trimRouteEnds', () => {
  it('removes the requested distance from each end', () => {
    const route = straightRoute(20); // ~2.2 km
    const trimmed = trimRouteEnds(route, 200);
    expect(haversineMeters(route[0], trimmed[0])).toBeCloseTo(200, 0);
    expect(haversineMeters(trimmed[trimmed.length - 1], route[route.length - 1])).toBeCloseTo(
      200,
      0,
    );
    expect(pathLengthMeters(trimmed)).toBeCloseTo(pathLengthMeters(route) - 400, 0);
  });

  it('cuts inside a segment instead of snapping to the next point', () => {
    const trimmed = trimRouteEnds(straightRoute(10), STEP_METERS / 2);
    expect(trimmed[0][0]).toBeCloseTo(0.0005, 6);
    expect(trimmed[1]).toEqual([0.001, 0]);
  });

  it('keeps the route unchanged with a zero distance', () => {
    const route = straightRoute(3);
    expect(trimRouteEnds(route, 0)).toEqual(route);
  });

  it('hides routes that are not longer than both trimmed ends', () => {
    expect(trimRouteEnds(straightRoute(3), 200)).toEqual([]); // ~334 m < 400 m
    expect(trimRouteEnds([[0, 0]], 200)).toEqual([]);
    expect(trimRouteEnds([], 200)).toEqual([]);
  });

  it('handles loops that start and end at the same place', () => {
    const loop: LatLng[] = [...straightRoute(10), ...straightRoute(10).reverse().slice(1)];
    const trimmed = trimRouteEnds(loop, 300);
    expect(haversineMeters(loop[0], trimmed[0])).toBeCloseTo(300, 0);
    expect(haversineMeters(loop[0], trimmed[trimmed.length - 1])).toBeCloseTo(300, 0);
  });

  it('rejects negative or non-finite distances', () => {
    expect(() => trimRouteEnds(straightRoute(3), -1)).toThrow(RangeError);
    expect(() => trimRouteEnds(straightRoute(3), Number.NaN)).toThrow(RangeError);
  });
});
