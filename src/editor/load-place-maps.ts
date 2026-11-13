import { planMap } from '@/core/map-drawing';
import { MAP_REFERENCE_WIDTH } from '@/core/map-style';
import type { PeriodPlace } from '@/core/period-places';
import { formatPlace } from '@/core/place';
import { mapTiles } from '@/data/map-tiles';
import { lookUpPlace } from '@/data/place-lookup';
import { logError } from '@/ui/log';

import { type WidgetMap, widgetMapViewport } from './widget-map';

/**
 * What a period's places need from the phone and the network (ADR 021), loaded in the background
 * as the editor opens: each place's name and the tiles of its map. One place that fails doesn't
 * hold back the others: it is `null`, and its widget draws without it.
 */

/**
 * Each place's town ("Andújar"), named by the phone from where its first activity started, without
 * asking for any permission; `null` when it can't be named. Names already looked up come from the
 * phone at once.
 */
export function loadPlaceNames(places: readonly PeriodPlace[]): Promise<(string | null)[]> {
  return Promise.all(
    places.map(async (place) => {
      const lookup = await lookUpPlace(place.start, false);
      return lookup.status === 'known' ? formatPlace(lookup.place, 'city') : null;
    }),
  );
}

/** The tiles of each place's map, at the zoom of a 1,080 px square; `null` if one can't be had. */
export function loadPlaceMaps(places: readonly PeriodPlace[]): Promise<(WidgetMap | null)[]> {
  return Promise.all(
    places.map(async (place, rank) => {
      try {
        const { tiles } = planMap(widgetMapViewport(place.routes.flat(), MAP_REFERENCE_WIDTH));
        return {
          tiles: await Promise.all(
            tiles.map(async (tile) => ({ tile, features: await mapTiles.load(tile) })),
          ),
        };
      } catch (error) {
        logError(`Could not load the map of the period's place ${rank + 1}`, error);
        return null;
      }
    }),
  );
}
