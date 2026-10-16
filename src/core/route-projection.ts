import type { LatLng } from './geo';

/** Point in canvas pixels, y growing downwards. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Projects one or more routes into a `width` × `height` box, centered and scaled to fit while
 * keeping their shape (north up). All routes share the projection, so overlaid routes keep
 * their real relative positions: streets run twice show up as one thicker line.
 *
 * Idea: equirectangular projection with longitudes shrunk by cos(mean latitude), which is
 * accurate at city scale, followed by a uniform "contain" fit into the box.
 * Source: https://en.wikipedia.org/wiki/Equirectangular_projection
 * Time O(n), space O(n) for n points in total.
 *
 * @returns The projected routes, in the same order; empty routes stay empty. A route that is a
 *   single point (or several identical points) lands in the center of the box.
 */
export function projectRoutes(
  routes: readonly (readonly LatLng[])[],
  width: number,
  height: number,
): Point[][] {
  const all = routes.flat();
  if (all.length === 0) {
    return routes.map(() => []);
  }
  const meanLat = all.reduce((total, [lat]) => total + lat, 0) / all.length;
  const lngScale = Math.cos((meanLat * Math.PI) / 180);
  const project = ([lat, lng]: LatLng) => ({ x: lng * lngScale, y: -lat });

  const projected = routes.map((route) => route.map(project));
  const flat = projected.flat();
  const minX = Math.min(...flat.map((p) => p.x));
  const maxX = Math.max(...flat.map((p) => p.x));
  const minY = Math.min(...flat.map((p) => p.y));
  const maxY = Math.max(...flat.map((p) => p.y));
  const spanX = maxX - minX;
  const spanY = maxY - minY;
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
