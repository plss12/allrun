import type { Activity } from './activity';
import { haversineMeters, interpolate, type LatLng } from './geo';
import { decodePolyline, encodePolyline } from './polyline';

/**
 * Default distance hidden at each end of a route: none (the user's decision). Hiding them is a
 * setting of the user's profile, kept with their account (ADR 019).
 */
export const DEFAULT_PRIVACY_TRIM_METERS = 0;

/** The distances the profile offers to hide at each end of a route, once turned on. */
export const ROUTE_PRIVACY_CHOICES = [100, 200, 500] as const;

export type RoutePrivacyChoice = (typeof ROUTE_PRIVACY_CHOICES)[number];

/** The distance chosen first when the user turns hiding on: the middle one (the owner's choices). */
export const SUGGESTED_PRIVACY_TRIM_METERS: RoutePrivacyChoice = 200;

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

/**
 * `activity` with the start and end of its route hidden (see `trimRouteEnds`), as the app shows and
 * exports it: applied where activities come into the app (`PrivateRoutesSource`), so that no
 * screen or image can skip it. A route too short to keep anything loses its line. The same object
 * when nothing is hidden. Time O(n) for n points.
 */
export function withRoutePrivacy(activity: Activity, meters: number): Activity {
  if (meters === 0 || activity.routePolyline === null) {
    return activity;
  }
  const kept = trimRouteEnds(decodePolyline(activity.routePolyline), meters);
  return { ...activity, routePolyline: kept.length < 2 ? null : encodePolyline(kept) };
}
