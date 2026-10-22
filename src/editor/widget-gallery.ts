import { newLayer } from '@/core/default-layout';
import {
  type CatalogItem,
  catalogItemKey,
  type CatalogSection,
  type CatalogSectionId,
  catalogWidgetKey,
  type NewLayer,
} from '@/core/layer-catalog';
import { CANVAS_FORMATS, type CanvasFormat, type FontId } from '@/core/template';

import { layerText } from './editor-data';
import { type LayerContext, type PreparedLayer, prepareLayers } from './template-scene';

/**
 * The widget gallery of "Add element": every item of the catalog made into the layer it adds,
 * filled with the user's data and measured, ready to draw in a tile.
 */

/** Room around and between the tiles, in points. */
export const GALLERY_PADDING = 16;
export const GALLERY_GAP = 10;

/** Room inside a tile around its widget, as a fraction of the tile. */
const TILE_INSET = 0.08;

/**
 * A widget fills its tile up to the size it would have spanning this share of the canvas: small
 * ones (a heart rate) don't blow up beside the long ones.
 */
const MAX_CANVAS_SPAN = 0.45;

/**
 * Charts take the whole width, so their texts read; texts and the route's four lines go two per
 * row; the rest three.
 */
const COLUMNS: Readonly<Record<CatalogSectionId, 1 | 2 | 3>> = {
  distance: 3,
  time: 3,
  pace: 3,
  elevation: 3,
  more: 3,
  text: 2,
  date: 2,
  period: 2,
  route: 2,
  elevationChart: 1,
  paceChart: 1,
  heartRateChart: 1,
  powerChart: 1,
  splits: 1,
  distanceChart: 1,
  timeChart: 1,
  brand: 3,
};

/** Height of a tile over its width. */
const TILE_RATIO = { 1: 0.5, 2: 0.6, 3: 0.75 } as const;

export interface GalleryTile {
  readonly key: string;
  readonly item: CatalogItem;
  /** The layer it adds, filled in and measured; its content is centered on (0, 0). */
  readonly prepared: PreparedLayer;
  /** Multiplier from canvas pixels to the tile's points. */
  readonly scale: number;
  /** What goes behind it: dark, or light for the dark and colored logos. */
  readonly background: 'dark' | 'light';
}

export interface GallerySection {
  readonly id: CatalogSectionId;
  /** Size of each tile, in points. */
  readonly width: number;
  readonly height: number;
  /** The tiles in rows, for a list to render a row at a time. */
  readonly data: readonly (readonly GalleryTile[])[];
}

/**
 * The catalog as rows of tiles for a screen `screenWidth` points wide, each widget drawn as it
 * would be added to a design of `format` in `font`. Variants writing the same text as an earlier
 * one of their widget (a period's formats, all "2026" for a year) are left out, and so are items
 * with nothing to show. The variants of a widget share one scale, the smallest any of them needs
 * to fit, so they compare; a date or a period's name, whose formats differ a lot in length, each
 * fill their own tile. Free text, which has no content until typed, shows `textSample`. Time O(n)
 * for n items, each measured once.
 */
export function gallerySections(
  catalog: readonly CatalogSection[],
  format: CanvasFormat,
  font: FontId,
  context: LayerContext,
  screenWidth: number,
  textSample: string,
): GallerySection[] {
  const canvasWidth = CANVAS_FORMATS[format].width;
  return catalog.flatMap((section) => {
    const columns = COLUMNS[section.id];
    const width = Math.floor(
      (screenWidth - 2 * GALLERY_PADDING - (columns - 1) * GALLERY_GAP) / columns,
    );
    const height = Math.round(width * TILE_RATIO[columns]);
    const seen = new Set<string>();
    const measured = section.items.flatMap((item) => {
      const prepared = prepareItem(item, format, font, context, textSample);
      if (prepared === null) {
        return [];
      }
      const text = layerText(prepared.layer, context.data, context.textContext);
      const written = `${catalogWidgetKey(item)} ${text?.value ?? catalogItemKey(item)}`;
      if (seen.has(written)) {
        return [];
      }
      seen.add(written);
      const fit = Math.min(
        (width * (1 - 2 * TILE_INSET)) / prepared.width,
        (height * (1 - 2 * TILE_INSET)) / prepared.height,
        width / (canvasWidth * MAX_CANVAS_SPAN),
      );
      return [{ item, prepared, fit }];
    });
    const shared = new Map<string, number>();
    for (const { item, fit } of measured) {
      const widget = catalogWidgetKey(item);
      shared.set(widget, Math.min(fit, shared.get(widget) ?? fit));
    }
    const tiles = measured.map(({ item, prepared, fit }): GalleryTile => ({
      key: catalogItemKey(item),
      item,
      prepared,
      scale: item.kind === 'info' ? fit : (shared.get(catalogWidgetKey(item)) ?? fit),
      background: item.kind === 'logo' && item.tone !== 'light' ? 'light' : 'dark',
    }));
    if (tiles.length === 0) {
      return [];
    }
    const data: GalleryTile[][] = [];
    for (let i = 0; i < tiles.length; i += columns) {
      data.push(tiles.slice(i, i + columns));
    }
    return [{ id: section.id, width, height, data }];
  });
}

/** The layer an item adds, filled with the data and measured; `null` if it has nothing to show. */
function prepareItem(
  item: CatalogItem,
  format: CanvasFormat,
  font: FontId,
  context: LayerContext,
  textSample: string,
): PreparedLayer | null {
  const pick: NewLayer = item.kind === 'text' ? { kind: 'text', content: textSample } : item;
  const layer = newLayer(pick, catalogItemKey(item), format, font);
  const [prepared] = prepareLayers(
    { version: 1, id: 'gallery', mode: context.data.mode, format, layers: [layer] },
    context,
  );
  return prepared ?? null;
}
