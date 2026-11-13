import type { Activity } from '@/core/activity';
import type { LatLng } from '@/core/geo';
import type { MapTileFeatures } from '@/core/map-tile-decode';
import { frameViewport, type Tile, type Viewport } from '@/core/map-tiles';
import { decodePolyline } from '@/core/polyline';

/**
 * The map of a widget's route (ADR 021): a square as wide as its big datum, the route fitted
 * inside it with room around, and the tiles it takes, loaded once for the activity. The tiles
 * depend only on the route and the square's shape, not on its size, so the editor loads them
 * before any widget is laid out: for the square 1,080 wide (`MAP_REFERENCE_WIDTH`), whose zoom is
 * the one an image of that width takes (`loadWidgetMap` loads them).
 */

/** Room between the route and the map's edges, a share of the map's width. */
const ROUTE_ROOM = 0.1;

/** A widget map's rounded corners, a share of its side. */
export const WIDGET_MAP_RADIUS = 0.06;

/** The loaded tiles of an activity's widget map. */
export interface WidgetMap {
  readonly tiles: readonly { readonly tile: Tile; readonly features: MapTileFeatures }[];
}

/** The route's points, or `null` without a route to draw. */
export function widgetMapPoints(activity: Activity): LatLng[] | null {
  if (activity.routePolyline === null) {
    return null;
  }
  const points = decodePolyline(activity.routePolyline);
  return points.length < 2 ? null : points;
}

/**
 * The viewport of a square map `side` wide with the route fitted in it, {@link ROUTE_ROOM} of
 * room around. Time O(n) for its n points, space O(n).
 */
export function widgetMapViewport(points: readonly LatLng[], side: number): Viewport {
  const room = side * ROUTE_ROOM;
  const inner = side - 2 * room;
  return frameViewport(points, { x: room, y: room, width: inner, height: inner }, side, side);
}
