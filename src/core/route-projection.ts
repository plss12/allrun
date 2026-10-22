import type { LatLng } from './geo';

/** Point in canvas pixels, y growing downwards. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Rectangle in canvas pixels, from its top left corner. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Width and height of the routes' bounding box, in projected units. */
export interface Span {
  readonly width: number;
  readonly height: number;
}

/**
 * The routes on a plane, north up, in degrees of latitude: equirectangular projection with
 * longitudes shrunk by cos(mean latitude), which is accurate at city scale.
 * Source: https://en.wikipedia.org/wiki/Equirectangular_projection
 */
function toPlane(routes: readonly (readonly LatLng[])[]): Point[][] {
  const all = routes.flat();
  const meanLat = all.reduce((total, [lat]) => total + lat, 0) / all.length;
  const lngScale = Math.cos((meanLat * Math.PI) / 180);
  return routes.map((route) => route.map(([lat, lng]) => ({ x: lng * lngScale, y: -lat })));
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
 * keeping their shape (north up). All routes share the projection, so overlaid routes keep
 * their real relative positions: streets run twice show up as one thicker line.
 *
 * Idea: the equirectangular projection of `toPlane`, followed by a uniform "contain" fit into
 * the box. Time O(n), space O(n) for n points in total.
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

/**
 * The shape of the routes as {@link projectRoutes} draws them: the size of their bounding box,
 * in projected units; zero for no points. Time O(n), space O(n).
 */
export function routeSpan(routes: readonly (readonly LatLng[])[]): Span {
  if (routes.every((route) => route.length === 0)) {
    return { width: 0, height: 0 };
  }
  const { width, height } = bounds(toPlane(routes).flat());
  return { width, height };
}

/**
 * Of several free areas, the one where routes of this `span` come out biggest once fitted in
 * it: the scale in each is that of the side the routes fill first. The first box wins a tie (a
 * single point fits any box alike). Time O(b) for b boxes, space O(1).
 *
 * @throws RangeError without boxes.
 */
export function largestFit(span: Span, boxes: readonly Box[]): Box {
  if (boxes.length === 0) {
    throw new RangeError('No box to fit the routes in');
  }
  const scale = (box: Box) =>
    Math.min(
      span.width > 0 ? box.width / span.width : Number.POSITIVE_INFINITY,
      span.height > 0 ? box.height / span.height : Number.POSITIVE_INFINITY,
    );
  return boxes.reduce((best, box) => (scale(box) > scale(best) ? box : best));
}
