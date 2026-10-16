/** Geographic point as `[latitude, longitude]` in decimal degrees. */
export type LatLng = readonly [lat: number, lng: number];

/** Mean Earth radius in meters (IUGG). */
const EARTH_RADIUS_METERS = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two points using the haversine formula.
 *
 * Source: R. W. Sinnott, "Virtues of the Haversine", Sky and Telescope 68(2), 1984.
 * Treats the Earth as a sphere, so the error is below 0.5%, plenty for running routes.
 * Time and space: O(1).
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b[0] - a[0]);
  const dLng = toRadians(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a[0])) * Math.cos(toRadians(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length of a path in meters. Time O(n), space O(1). */
export function pathLengthMeters(points: readonly LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Point at fraction `t` (0..1) of the way from `a` to `b`.
 *
 * Linear in latitude and longitude, which is accurate for the short segments of a GPS track.
 */
export function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
