import { newLayer } from '@/core/default-layout';
import {
  type CatalogItem,
  catalogItemKey,
  type CatalogSection,
  type CatalogSectionId,
  type CatalogWidget,
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

/** Room at the bottom of a tile with several variants, for the dots of its pages. */
export const GALLERY_DOTS_HEIGHT = 14;

/** Room inside a tile around its widget, as a fraction of the tile. */
const TILE_INSET = 0.08;

/**
 * A data widget fills its tile up to the size it would have spanning this share of the canvas:
 * small ones (a heart rate) don't blow up beside the long ones. Texts (a date, a period's name)
 * fill their page, each as big as it fits, since their formats differ a lot in length.
 */
const MAX_CANVAS_SPAN = 0.45;

/** Widgets whose every version fills its page, instead of all sharing one scale. */
const FILLS_PAGE: ReadonlySet<CatalogItem['kind']> = new Set([
  'info',
  'activityChart',
  'summaryChart',
]);

/** Height of a tile over its width, by how many tiles share a row. */
const TILE_RATIO = { 1: 0.5, 2: 0.6 } as const;

/** Tiles per row: charts take the whole width, so their texts read; the rest go two per row. */
const columnsFor = (id: CatalogSectionId): 1 | 2 => (id === 'charts' ? 1 : 2);

/**
 * Whether a tile takes a whole row of a section of two, as tall as the others: the AllRun name
 * with its monogram, wide by nature, under the name and the monogram alone, so the logo's section
 * stays even.
 */
const spansRow = (widget: CatalogWidget): boolean =>
  widget.variants.every((item) => item.kind === 'logo' && item.variant === 'lockup');

/** A variant of a widget, filled in and measured, as one page of its tile. */
export interface GalleryPage {
  readonly key: string;
  readonly item: CatalogItem;
  /** The layer it adds, filled in and measured; its content is centered on (0, 0). */
  readonly prepared: PreparedLayer;
  /** Multiplier from canvas pixels to the tile's points. */
  readonly scale: number;
}

/** A tile of the gallery: a widget, with its variants as pages that scroll inside it. */
export interface GalleryWidget {
  readonly key: string;
  readonly pages: readonly GalleryPage[];
}

/** A row of tiles, all of one size, in points. */
export interface GalleryRow {
  readonly width: number;
  readonly height: number;
  readonly widgets: readonly GalleryWidget[];
}

export interface GallerySection {
  readonly id: CatalogSectionId;
  /** The tiles in rows, for a list to render a row at a time. */
  readonly rows: readonly GalleryRow[];
}

/**
 * The catalog as rows of tiles for a screen `screenWidth` points wide, each variant drawn as it
 * would be added to a design of `format` in `font`. Variants writing the same text as an earlier
 * one of their tile (a period's formats, all "2026" for a year) are left out, and so are items
 * with nothing to show. The variants of a widget share one scale, the smallest any of them needs
 * to fit, so they compare page to page; a date or a period's name, whose formats differ a lot in
 * length, each fill their own page. Free text, which has no content until typed, shows
 * `textSample`. Time O(n) for n items, each measured once.
 */
export function gallerySections(
  catalog: readonly CatalogSection[],
  format: CanvasFormat,
  font: FontId,
  context: LayerContext,
  screenWidth: number,
  textSample: string,
): GallerySection[] {
  const full = screenWidth - 2 * GALLERY_PADDING;
  return catalog.flatMap((section) => {
    const columns = columnsFor(section.id);
    const width = Math.floor((full - (columns - 1) * GALLERY_GAP) / columns);
    const height = Math.round(width * TILE_RATIO[columns]);
    const rows: GalleryRow[] = [];
    let open: GalleryWidget[] = [];
    const close = () => {
      if (open.length > 0) {
        rows.push({ width, height, widgets: open });
        open = [];
      }
    };
    for (const widget of section.widgets) {
      const wide = columns > 1 && spansRow(widget);
      // A wide tile draws its widget as big as its neighbours do: it only has more room.
      const tile = measureWidget(
        widget,
        { width: wide ? full : width, height, capWidth: width },
        format,
        font,
        context,
        textSample,
      );
      if (tile === null) {
        continue;
      }
      if (wide) {
        close();
        rows.push({ width: full, height, widgets: [tile] });
      } else {
        open.push(tile);
        if (open.length === columns) {
          close();
        }
      }
    }
    close();
    return rows.length === 0 ? [] : [{ id: section.id, rows }];
  });
}

/**
 * A widget's variants made into the pages of a `width` × `height` tile, or `null` when none has
 * anything to show. Its data are drawn no bigger than in a tile `capWidth` wide (see
 * `MAX_CANVAS_SPAN`).
 */
function measureWidget(
  widget: CatalogWidget,
  { width, height, capWidth }: { width: number; height: number; capWidth: number },
  format: CanvasFormat,
  font: FontId,
  context: LayerContext,
  textSample: string,
): GalleryWidget | null {
  const canvasWidth = CANVAS_FORMATS[format].width;
  const seen = new Set<string>();
  const measured = widget.variants.flatMap((item) => {
    const prepared = prepareItem(item, format, font, context, textSample);
    if (prepared === null) {
      return [];
    }
    // Two data can read alike ("150" beats and steps): their names tell them apart.
    const text = layerText(prepared.layer, context.data, context.textContext);
    const written =
      text === null ? catalogItemKey(item) : [text.label, text.value, text.unit].join(' ');
    if (seen.has(written)) {
      return [];
    }
    seen.add(written);
    return [{ item, prepared }];
  });
  if (measured.length === 0) {
    return null;
  }
  // Several variants leave room for their dots under the widget.
  const room = measured.length > 1 ? height - GALLERY_DOTS_HEIGHT : height;
  const fill = (prepared: PreparedLayer) =>
    Math.min(
      (width * (1 - 2 * TILE_INSET)) / prepared.width,
      (room * (1 - 2 * TILE_INSET)) / prepared.height,
    );
  const capped = (prepared: PreparedLayer) =>
    Math.min(fill(prepared), capWidth / (canvasWidth * MAX_CANVAS_SPAN));
  const shared = Math.min(...measured.map(({ prepared }) => capped(prepared)));
  const pages = measured.map(({ item, prepared }) => ({
    key: catalogItemKey(item),
    item,
    prepared,
    // Dates and names differ a lot in length, and a chart's versions in height (a heart rate's
    // zones table): each fills its own page instead of shrinking the others.
    scale: FILLS_PAGE.has(item.kind) ? fill(prepared) : shared,
  }));
  return { key: widget.key, pages };
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
