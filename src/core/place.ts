import type { Activity } from './activity';
import type { LatLng } from './geo';
import { decodePolyline } from './polyline';
import type { Layer } from './template';

/** Where an activity was done, as a geocoder names it; any part may be unknown. */
export interface Place {
  readonly city: string | null;
  /** The state or province ("Andalucía"). */
  readonly region: string | null;
  readonly country: string | null;
}

/** How a place reads: "Sevilla", "Sevilla, Andalucía" or "Sevilla, España". */
export const PLACE_FORMATS = ['city', 'cityRegion', 'cityCountry'] as const;

export type PlaceFormat = (typeof PLACE_FORMATS)[number];

/**
 * Where an activity started, from the first point of its route; `null` without one. Only the city
 * is ever shown, so the route's privacy trim doesn't matter here. Time O(n) for n route points.
 */
export function startOf(activity: Activity): LatLng | null {
  if (activity.routePolyline === null) {
    return null;
  }
  return decodePolyline(activity.routePolyline)[0] ?? null;
}

/**
 * A place written as `format` says, from its most precise known part: the region stands in for
 * an unknown city. A part that repeats the one before ("Madrid, Madrid") is left out, and so is
 * an unknown one. `null` when nothing is known. Time and space O(1).
 */
export function formatPlace(place: Place, format: PlaceFormat): string | null {
  const first = place.city ?? place.region ?? place.country;
  if (first === null) {
    return null;
  }
  const second =
    format === 'cityRegion' ? place.region : format === 'cityCountry' ? place.country : null;
  return second === null || second === first ? first : `${first}, ${second}`;
}

/**
 * Whether `layers` write where the activity was done: the place's text, the location replica, an
 * instant photo with its place under it or the margins' page. On Android naming it needs a permission, asked for when
 * such a widget or a design with one is chosen. Time O(n) for n layers.
 */
export function namesPlace(layers: readonly Layer[]): boolean {
  return layers.some(
    (layer) =>
      (layer.kind === 'info' && layer.field === 'activityPlace') ||
      (layer.kind === 'activityBlock' && layer.block.design === 'location') ||
      (layer.kind === 'image' &&
        (layer.caption === 'place' || layer.mount === 'margins' || layer.mount === 'marginsPair')),
  );
}
