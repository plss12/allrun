import {
  BlurMask,
  DashPathEffect,
  Group,
  Paint,
  Path,
  Picture,
  Skia,
} from '@shopify/react-native-skia';

import { castsShadow } from '@/core/layer-style';
import type { Activity } from '@/core/activity';
import { toPixels } from '@/core/map-tiles';
import { decodePolyline } from '@/core/polyline';
import { type Point, projectRoutes } from '@/core/route-projection';
import { mapPicture } from '@/ui/map-picture';
import type { Layer } from '@/core/template';

import { DropShadow } from '../scene-text';
import {
  WIDGET_MAP_RADIUS,
  type WidgetMap,
  widgetMapPoints,
  widgetMapViewport,
} from '../widget-map';
import type { PreparedLayer } from '../template-scene';
import { hitLine } from './paragraphs';

/**
 * Routes projected into a `box` × `boxHeight` box. They are centered in it, so their own extent
 * (plus the stroke) is their box, and only near their lines a finger grabs them: the rest of the
 * box, empty for a route on the diagonal, lets touches through. `null` without any point.
 */
export function preparedRoutes(
  layer: Extract<Layer, { kind: 'route' | 'summaryRoutes' }>,
  routes: readonly Point[][],
  box: number,
  boxHeight: number,
): PreparedLayer | null {
  const points = routes.flat();
  if (points.length === 0) {
    return null;
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    layer,
    width: Math.max(...xs) - Math.min(...xs) + layer.stroke.width,
    height: Math.max(...ys) - Math.min(...ys) + layer.stroke.width,
    content: <RouteLines routes={routes} box={box} boxHeight={boxHeight} stroke={layer.stroke} />,
    line: hitLine(routes, box, boxHeight, layer.stroke.width),
  };
}

/**
 * An activity's route on its map (ADR 021): a rounded square {@link ROUTE_BOX} wide with the map
 * in its own colors and a shadow under it, the route over it in the layer's line, projected with
 * the map's viewport so that both line up. The whole square is the layer's to grab. `null`
 * without a route.
 */
export function preparedRouteMap(
  layer: Extract<Layer, { kind: 'route' }>,
  activity: Activity,
  map: WidgetMap,
): PreparedLayer | null {
  const points = widgetMapPoints(activity);
  if (points === null) {
    return null;
  }
  const viewport = widgetMapViewport(points, ROUTE_BOX);
  const half = ROUTE_BOX / 2;
  const radius = ROUTE_BOX * WIDGET_MAP_RADIUS;
  return {
    layer,
    width: ROUTE_BOX,
    height: ROUTE_BOX,
    content: (
      <Group>
        <Group
          layer={
            <Paint>
              <DropShadow />
            </Paint>
          }
        >
          <Group
            clip={Skia.RRectXY(Skia.XYWHRect(-half, -half, ROUTE_BOX, ROUTE_BOX), radius, radius)}
          >
            <Group transform={[{ translateX: -half }, { translateY: -half }]}>
              <Picture picture={mapPicture(viewport, map.tiles)} />
            </Group>
          </Group>
        </Group>
        <RouteLines
          routes={[points.map((point) => toPixels(point, viewport))]}
          box={ROUTE_BOX}
          boxHeight={ROUTE_BOX}
          stroke={layer.stroke}
        />
      </Group>
    ),
  };
}
export const ROUTE_BOX = 640;
export const ROUTES_WIDTH = 800;
export const ROUTES_HEIGHT = 560;

/** Decodes, trims the private ends of and projects routes into a box. */
export function projectedRoutes(
  polylines: readonly string[],
  width: number,
  height: number,
): Point[][] {
  const routes = polylines.map((polyline) => decodePolyline(polyline));
  return projectRoutes(routes, width, height);
}

interface RouteLinesProps {
  readonly routes: readonly Point[][];
  readonly box: number;
  readonly boxHeight: number;
  readonly stroke: Extract<Layer, { kind: 'route' }>['stroke'];
}

/**
 * Dash and gap lengths of each line style, in line widths. Dots are dashes of no length: the
 * round caps draw them as circles.
 */
const LINE_DASHES = { dashed: [2.5, 2], dotted: [0, 2] } as const;

function RouteLines({ routes, box, boxHeight, stroke }: RouteLinesProps) {
  const builder = Skia.PathBuilder.Make();
  const at = (point: Point) => ({ x: point.x - box / 2, y: point.y - boxHeight / 2 });
  for (const route of routes) {
    route.forEach((point, i) => {
      const { x, y } = at(point);
      if (i === 0) {
        builder.moveTo(x, y);
      } else {
        builder.lineTo(x, y);
      }
    });
  }
  const path = builder.detach();
  const { color, width } = stroke;
  const line = stroke.line ?? 'solid';
  const shadow = castsShadow(color) ? <DropShadow /> : null;
  return (
    <Group>
      {stroke.glow ? (
        // A wider, blurred copy of the line under it.
        <Path
          path={path}
          style="stroke"
          strokeWidth={width * 2.5}
          strokeCap="round"
          strokeJoin="round"
          color={color}
          opacity={0.6}
        >
          <BlurMask blur={width * 1.5} style="normal" />
        </Path>
      ) : null}
      <Path
        path={path}
        style="stroke"
        strokeWidth={width}
        strokeCap="round"
        strokeJoin="round"
        color={color}
      >
        {line === 'solid' ? null : (
          <DashPathEffect intervals={LINE_DASHES[line].map((length) => length * width + 0.01)} />
        )}
        {shadow}
      </Path>
    </Group>
  );
}
