import { haversineMeters, interpolate, type LatLng } from './geo';

/** Default distance hidden at each end of a shared route. */
export const DEFAULT_PRIVACY_TRIM_METERS = 200;

/**
 * Hides the start and end of a route so a shared image doesn't reveal where the athlete lives.
 *
 * Strava returns the full trace to the activity owner (its privacy zones only apply to other
 * viewers), so we trim it ourselves. The cut falls exactly `meters` along the path, interpolated
 * inside the segment where it lands, so the visible line doesn't jump.
 *
 * Time O(n), space O(n).
 *
 * @param points - Route in travel order.
 * @param meters - Distance to remove from each end; `0` keeps the route unchanged.
 * @returns The trimmed route, or an empty array when the route is not longer than twice
 *   `meters` (nothing would remain that is safe to show).
 * @throws RangeError if `meters` is negative or not finite.
 */
export function trimRouteEnds(points: readonly LatLng[], meters: number): LatLng[] {
  if (!Number.isFinite(meters) || meters < 0) {
    throw new RangeError(`Invalid trim distance: ${meters}`);
  }
  if (meters === 0) {
    return [...points];
  }
  const withoutStart = dropLeadingMeters(points, meters);
  return dropLeadingMeters(withoutStart.reverse(), meters).reverse();
}

/** Removes the first `meters` of the path; empty if the path is not longer than that. */
function dropLeadingMeters(points: readonly LatLng[], meters: number): LatLng[] {
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const segment = haversineMeters(points[i - 1], points[i]);
    if (travelled + segment > meters) {
      const cut = interpolate(points[i - 1], points[i], (meters - travelled) / segment);
      return [cut, ...points.slice(i)];
    }
    travelled += segment;
  }
  return [];
}
