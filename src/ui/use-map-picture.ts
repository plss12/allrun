import type { SkPicture } from '@shopify/react-native-skia';

import { planMap } from '@/core/map-drawing';
import type { Viewport } from '@/core/map-tiles';
import { mapTiles } from '@/data/map-tiles';

import { recordMapPicture } from './map-picture';
import { useAsync } from './use-async';

/**
 * The map of a viewport's drawing (ADR 021), once all its tiles are loaded: null until then, on a
 * failure (logged by `useAsync`) and without a viewport. All or nothing, so a map never shows
 * with holes, nor fills in tile by tile.
 */
export function useMapPicture(viewport: Viewport | null): SkPicture | null {
  const state = useAsync(
    async () => {
      if (viewport === null) {
        return null;
      }
      const { tiles } = planMap(viewport);
      const loaded = await Promise.all(
        tiles.map(async (tile) => ({ tile, features: await mapTiles.load(tile) })),
      );
      return recordMapPicture(viewport, loaded);
    },
    viewport === null
      ? 'map|none'
      : `map|${viewport.left}|${viewport.top}|${viewport.scale}|${viewport.width}|${viewport.height}`,
  );
  return state.status === 'success' ? state.data : null;
}
