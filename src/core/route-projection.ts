import type { LatLng } from './geo';

/** Point in canvas pixels, y growing downwards. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Two routes are of the same place when the gap between their bounding boxes is no more than
 * this share of the larger box's longer side: they keep where they really are, so the streets of
 * a city run twice still meet. Farther apart (a trip, a nearby town) each place is drawn centered
 * over the others: drawn where they are, the gap would leave each one tiny in a corner. Relative,
 * not a distance: a fixed one joined towns 20 km apart into one tiny drawing.
 */
export const SAME_PLACE_GAP = 0.5;

/** Kilometers per degree of latitude (mean Earth radius 6371 km). */
const KM_PER_DEGREE = (6371 * Math.PI) / 180;

interface GeoBounds {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

function geoBounds(route: readonly LatLng[]): GeoBounds {
  return {
    minLat: Math.min(...route.map(([lat]) => lat)),
    maxLat: Math.max(...route.map(([lat]) => lat)),
    minLng: Math.min(...route.map(([, lng]) => lng)),
    maxLng: Math.max(...route.map(([, lng]) => lng)),
  };
}

/**
 * Whether two routes' bounding boxes are near enough to be one place (see
 * {@link SAME_PLACE_GAP}), measured in km.
 */
function samePlace(a: GeoBounds, b: GeoBounds): boolean {
  const lngKm =
    KM_PER_DEGREE * Math.cos(((a.minLat + a.maxLat + b.minLat + b.maxLat) / 4) * (Math.PI / 180));
  const latGap = Math.max(0, Math.max(a.minLat, b.minLat) - Math.min(a.maxLat, b.maxLat));
  const lngGap = Math.max(0, Math.max(a.minLng, b.minLng) - Math.min(a.maxLng, b.maxLng));
  const gap = Math.hypot(latGap * KM_PER_DEGREE, lngGap * lngKm);
  const side = (box: GeoBounds) =>
    Math.max((box.maxLat - box.minLat) * KM_PER_DEGREE, (box.maxLng - box.minLng) * lngKm);
  return gap <= SAME_PLACE_GAP * Math.max(side(a), side(b));
}

/**
 * The routes grouped by place: two routes are in the same place when their bounding boxes touch
 * or nearly ({@link SAME_PLACE_GAP}), and so are the places they link (single-linkage clustering,
 * with a union-find). Empty routes belong to none.
 *
 * Source: https://en.wikipedia.org/wiki/Single-linkage_clustering
 * Time O(r² + n) for r routes of n points in total, space O(r + n).
 *
 * @returns The indices of the routes of each place, in the order of their first route.
 */
export function groupByPlace(routes: readonly (readonly LatLng[])[]): number[][] {
  const drawn = routes.flatMap((route, index) => (route.length === 0 ? [] : [index]));
  const boxes = new Map(drawn.map((index) => [index, geoBounds(routes[index])]));
  const parent = new Map(drawn.map((index) => [index, index]));
  const root = (index: number): number => {
    let at = index;
    while (parent.get(at) !== at) {
      at = parent.get(at) ?? at;
    }
    parent.set(index, at);
    return at;
  };
  for (let i = 0; i < drawn.length; i++) {
    for (let j = i + 1; j < drawn.length; j++) {
      const a = drawn[i];
      const b = drawn[j];
      const boxA = boxes.get(a);
      const boxB = boxes.get(b);
      if (boxA !== undefined && boxB !== undefined && samePlace(boxA, boxB)) {
        parent.set(root(b), root(a));
      }
    }
  }
  const places = new Map<number, number[]>();
  for (const index of drawn) {
    const place = root(index);
    places.set(place, [...(places.get(place) ?? []), index]);
  }
  return [...places.values()].sort((a, b) => a[0] - b[0]);
}

/**
 * The routes on a plane, north up, in degrees of latitude: equirectangular projection with
 * longitudes shrunk by cos(mean latitude), which is accurate at city scale. Each place (see
 * {@link groupByPlace}) is projected on its own latitude and centered on the origin, so that
 * routes done in different places come out one over another instead of as dots far apart.
 * Source: https://en.wikipedia.org/wiki/Equirectangular_projection
 */
function toPlane(routes: readonly (readonly LatLng[])[]): Point[][] {
  const plane: Point[][] = routes.map(() => []);
  for (const place of groupByPlace(routes)) {
    const all = place.flatMap((index) => routes[index]);
    const meanLat = all.reduce((total, [lat]) => total + lat, 0) / all.length;
    const lngScale = Math.cos((meanLat * Math.PI) / 180);
    const projected = place.map((index) =>
      routes[index].map(([lat, lng]) => ({ x: lng * lngScale, y: -lat })),
    );
    const { minX, minY, width, height } = bounds(projected.flat());
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;
    place.forEach((index, i) => {
      plane[index] = projected[i].map((p) => ({ x: p.x - centerX, y: p.y - centerY }));
    });
  }
  return plane;
}

function bounds(points: readonly Point[]) {
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  return {
    minX,
    minY,
    width: Math.max(...points.map((p) => p.x)) - minX,
    height: Math.max(...points.map((p) => p.y)) - minY,
  };
}

/**
 * Projects one or more routes into a `width` × `height` box, centered and scaled to fit while
 * keeping their shape (north up). Routes of the same place share the projection, so overlaid
 * routes keep their real relative positions: streets run twice show up as one thicker line.
 * Routes of different places (a trip) are each centered over the others, all at one scale.
 *
 * Idea: the equirectangular projection of `toPlane`, place by place, followed by a uniform
 * "contain" fit into the box. Time O(r² + n), space O(r + n) for r routes of n points in total.
 *
 * @returns The projected routes, in the same order; empty routes stay empty. A route that is a
 *   single point (or several identical points) lands in the center of the box.
 */
export function projectRoutes(
  routes: readonly (readonly LatLng[])[],
  width: number,
  height: number,
): Point[][] {
  if (routes.every((route) => route.length === 0)) {
    return routes.map(() => []);
  }
  const projected = toPlane(routes);
  const { minX, minY, width: spanX, height: spanY } = bounds(projected.flat());
  const scale = Math.min(
    spanX > 0 ? width / spanX : Number.POSITIVE_INFINITY,
    spanY > 0 ? height / spanY : Number.POSITIVE_INFINITY,
  );
  // A single point has no extent: any finite scale works, it ends up centered.
  const fit = Number.isFinite(scale) ? scale : 1;
  const offsetX = (width - spanX * fit) / 2;
  const offsetY = (height - spanY * fit) / 2;

  return projected.map((route) =>
    route.map((p) => ({ x: offsetX + (p.x - minX) * fit, y: offsetY + (p.y - minY) * fit })),
  );
}
