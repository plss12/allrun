import type { Activity } from './activity';
import type { DateRange } from './dates';
import type { LatLng } from './geo';
import { decodePolyline } from './polyline';
import { groupByPlace } from './route-projection';
import { type PeriodSummary, selectActivities, summarize } from './summary';

/**
 * The places of a period (ADR 021): its activities with a route grouped by where they were done,
 * as the overlaid routes group them (`groupByPlace`: routes whose boxes touch, or nearly, are of
 * one place), each with its own totals, for a widget with each place's routes on its map.
 */

/** Most places a period offers a widget of: a year of trips could have dozens. */
export const MAX_PERIOD_PLACES = 10;

/** Where some of a period's activities were done. */
export interface PeriodPlace {
  /** Its activities, oldest first. */
  readonly activities: readonly Activity[];
  /** Their routes, decoded, in the same order. */
  readonly routes: readonly (readonly LatLng[])[];
  /** Where its first activity started, to name the place by. */
  readonly start: LatLng;
  /** Its totals over the period's range. */
  readonly summary: PeriodSummary;
}

/**
 * The places of `activities` within `range`, those with most activities first (then the longest
 * in distance, then the earliest), at most {@link MAX_PERIOD_PLACES}. Activities without a route
 * belong to none. Time O(r² + n) for r routes of n points in total (see `groupByPlace`), space
 * O(r + n).
 */
export function periodPlaces(activities: readonly Activity[], range: DateRange): PeriodPlace[] {
  const routed = selectActivities(activities, range)
    .filter((activity) => activity.routePolyline !== null)
    .map((activity) => ({ activity, route: decodePolyline(activity.routePolyline ?? '') }))
    .filter(({ route }) => route.length >= 2);
  // Oldest first: `sort` on a copy (Hermes lacks `toSorted`).
  const sorted = [...routed].sort((a, b) =>
    a.activity.startLocal < b.activity.startLocal
      ? -1
      : a.activity.startLocal > b.activity.startLocal
        ? 1
        : 0,
  );
  const places = groupByPlace(sorted.map(({ route }) => route)).map((indices) => {
    const members = indices.map((index) => sorted[index]);
    const placeActivities = members.map(({ activity }) => activity);
    return {
      activities: placeActivities,
      routes: members.map(({ route }) => route),
      start: members[0].route[0],
      summary: summarize(placeActivities, range),
      first: indices[0],
    };
  });
  return [...places]
    .sort(
      (a, b) =>
        b.activities.length - a.activities.length ||
        b.summary.totalDistanceMeters - a.summary.totalDistanceMeters ||
        a.first - b.first,
    )
    .slice(0, MAX_PERIOD_PLACES)
    .map(({ activities: placeActivities, routes, start, summary: placeSummary }) => ({
      activities: placeActivities,
      routes,
      start,
      summary: placeSummary,
    }));
}
