import type { Activity } from '@/core/activity';
import { planMap } from '@/core/map-drawing';
import { MAP_REFERENCE_WIDTH } from '@/core/map-style';
import { mapTiles } from '@/data/map-tiles';

import { type WidgetMap, widgetMapPoints, widgetMapViewport } from './widget-map';

/**
 * The tiles of `activity`'s widget map, loaded (kept on the phone after the first time), or
 * `null` without a route. Rejects when a tile can't be had.
 */
export async function loadWidgetMap(activity: Activity): Promise<WidgetMap | null> {
  const points = widgetMapPoints(activity);
  if (points === null) {
    return null;
  }
  const { tiles } = planMap(widgetMapViewport(points, MAP_REFERENCE_WIDTH));
  return {
    tiles: await Promise.all(
      tiles.map(async (tile) => ({ tile, features: await mapTiles.load(tile) })),
    ),
  };
}
