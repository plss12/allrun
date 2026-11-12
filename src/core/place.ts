import type { Activity } from './activity';
import type { LatLng } from './geo';
import { decodePolyline } from './polyline';
import { spanishProvince } from './spain-provinces';
import type { Layer } from './template';

/** Where an activity was done, as a geocoder names it; any part may be unknown. */
export interface Place {
  readonly city: string | null;
  /**
   * What follows the city: in Spain its province ("Jaén"), or its community in a provincial
   * capital ("Jaén, Andalucía"); elsewhere the state or region the geocoder gives.
   */
  readonly region: string | null;
  readonly country: string | null;
}

/** The parts of a phone geocoder's address a place is made of. */
export interface GeocodedAddress {
  readonly city: string | null;
  /** Apple's administrative area, Google's admin area. */
  readonly region: string | null;
  /** Apple's sub-administrative area, Google's sub-admin area. */
  readonly subregion: string | null;
  readonly country: string | null;
  readonly isoCountryCode: string | null;
}

/**
 * The place of a geocoded address. In Spain its region is the province, found in whichever field
 * the phone put it (Apple and Google differ) and written by its usual name, so both phones write
 * the same; in a provincial capital, the community instead, so that the name isn't said twice
 * ("Jaén, Andalucía", not "Jaén, Jaén"). Elsewhere the region as the geocoder gives it (in the
 * US the sub-administrative area is the county). Time O(1).
 */
export function placeOfAddress(address: GeocodedAddress): Place {
  const { city, country } = address;
  const found =
    address.isoCountryCode?.toUpperCase() === 'ES'
      ? spanishProvince(address.subregion, address.region)
      : null;
  if (found === null) {
    return { city, region: address.region, country };
  }
  const capital = city !== null && spanishProvince(city)?.province === found.province;
  return { city, region: capital ? found.community : found.province, country };
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
