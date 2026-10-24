import { isDataWidget } from '@/core/activity-block';
import { isSummaryDataWidget } from '@/core/summary-block';
import { newLayer } from '@/core/default-layout';
import {
  type CatalogItem,
  catalogItemKey,
  type CatalogSection,
  type CatalogSectionId,
  type CatalogWidget,
  creativeTheme,
  isCreativeWildcard,
  type NewLayer,
  rowPartner,
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

/**
 * Sections whose rows grow taller for tall widgets (a route over the data), up to square tiles
 * (`MAX_TILE_RATIO`): the data widgets, whose looks range from a line to a column.
 */
const GROWING_SECTIONS: ReadonlySet<CatalogSectionId> = new Set(['data']);
const MAX_TILE_RATIO = 1;

/** Height a tile needs for `tile`'s tallest page drawn at its scale, its room and dots around. */
function neededHeight(tile: GalleryWidget): number {
  const tallest = Math.max(...tile.pages.map((page) => page.prepared.height * page.scale));
  const dots = tile.pages.length > 1 ? GALLERY_DOTS_HEIGHT : 0;
  return Math.ceil(tallest / (1 - 2 * TILE_INSET) + dots);
}

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
 * with nothing to show. Each page of a mixed widget, a chart, a date or a period's name fills its
 * own page, as big as it fits (a data widget up to a cap, see `MAX_CANVAS_SPAN`), so none is left
 * small beside a bigger one; the other widgets' variants share one scale, the smallest any of them
 * needs, so they compare page to page. Free text, which has no content until typed, shows
 * `textSample`. The creative tiles go by themes (see `creativeTheme`), each tile sharing a row
 * only with one of its own: a pair (see `rowPartner`) always shares one, and when it would start
 * it on the right, it goes first and the tile alone waits for the next of its theme; one left
 * alone at the end of its theme takes the whole row, unless a wildcard alone (a boarding pass)
 * goes up beside it (see `isCreativeWildcard`). Time O(n) for n items, each measured once
 * (and a tile left alone twice).
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
    // Rows that grow are first measured as tall as they may be, to know how much they need.
    const grows = GROWING_SECTIONS.has(section.id);
    const tallest = Math.round(width * MAX_TILE_RATIO);
    // A wide tile draws its widget as big as its neighbours do: it only has more room.
    const measure = (widget: CatalogWidget, tileWidth: number, tileHeight: number) =>
      measureWidget(
        widget,
        { width: tileWidth, height: tileHeight, capWidth: width },
        format,
        font,
        context,
        textSample,
      );
    let groups: { readonly width: number; readonly tiles: GalleryWidget[] }[] = [];
    let open: GalleryWidget[] = [];
    const close = () => {
      if (open.length > 0) {
        groups.push({ width, tiles: open });
        open = [];
      }
    };
    const tiles = section.widgets.flatMap((widget) => {
      const wide = columns > 1 && spansRow(widget);
      const tile = measure(widget, wide ? full : width, grows ? tallest : height);
      return tile === null ? [] : [{ tile, wide }];
    });
    // The creative tiles go by themes: each theme starts a row, so a tile only shares one with
    // another of its theme (but a wildcard's, see below).
    const themed = section.id === 'creative' && columns > 1;
    for (let i = 0; i < tiles.length; i++) {
      const { tile, wide } = tiles[i];
      const next = tiles[i + 1];
      if (themed && i > 0 && creativeTheme(tile.key) !== creativeTheme(tiles[i - 1].tile.key)) {
        close();
      }
      if (wide) {
        close();
        groups.push({ width: full, tiles: [tile] });
      } else if (
        columns > 1 &&
        open.length === 1 &&
        next !== undefined &&
        rowPartner(tile.key) === next.tile.key
      ) {
        // A pair that would split goes first, together; the tile left alone waits for the next.
        groups.push({ width, tiles: [tile, next.tile] });
        i++;
      } else {
        open.push(tile);
        if (open.length === columns) {
          close();
        }
      }
    }
    close();
    if (themed) {
      groups = settleAlone(groups, width, (widget) => {
        const source = section.widgets.find((candidate) => candidate.key === widget.key);
        const wide = source === undefined ? null : measure(source, full, height);
        return wide === null ? null : { width: full, tiles: [wide] };
      });
    }
    const rows = groups.map(({ width: rowWidth, tiles }): GalleryRow => {
      if (!grows) {
        return { width: rowWidth, height, widgets: tiles };
      }
      // As tall as its tallest widget needs, between the usual tiles and square ones.
      const needed = Math.max(...tiles.map(neededHeight));
      const rowHeight = Math.min(tallest, Math.max(height, needed));
      return {
        width: rowWidth,
        height: rowHeight,
        widgets:
          rowHeight === tallest
            ? tiles
            : tiles.map((tile) => {
                const widget = section.widgets.find((candidate) => candidate.key === tile.key);
                return (widget === undefined ? null : measure(widget, rowWidth, rowHeight)) ?? tile;
              }),
      };
    });
    return rows.length === 0 ? [] : [{ id: section.id, rows }];
  });
}

/** A row of tiles before it is measured to its height. */
interface TileGroup {
  readonly width: number;
  readonly tiles: GalleryWidget[];
}

/**
 * The creative rows of `groups` with their tiles left alone, each at the end of its theme,
 * settled: a wildcard alone (see `isCreativeWildcard`) goes up beside the first other tile alone,
 * one of a theme before a wildcard; a tile still alone takes the whole row (`wide`, or as it is
 * when it can't be made wide). Rows are `width` wide when of tiles side by side. Time O(r²) for r
 * rows, a few.
 */
function settleAlone(
  groups: readonly TileGroup[],
  width: number,
  wide: (tile: GalleryWidget) => TileGroup | null,
): TileGroup[] {
  const settled = [...groups];
  const alone = (group: TileGroup) => group.width === width && group.tiles.length === 1;
  for (let i = 0; i < settled.length; i++) {
    const group = settled[i];
    if (!alone(group) || !isCreativeWildcard(group.tiles[0].key)) {
      continue;
    }
    const others = settled
      .map((other, j) => ({ other, j }))
      .filter(({ other, j }) => j !== i && alone(other));
    const slot = others.find(({ other }) => !isCreativeWildcard(other.tiles[0].key)) ?? others[0];
    if (slot !== undefined) {
      settled[slot.j] = { width, tiles: [slot.other.tiles[0], group.tiles[0]] };
      settled.splice(i, 1);
      i--;
    }
  }
  return settled.map((group) => (alone(group) ? (wide(group.tiles[0]) ?? group) : group));
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
    // Dates and names differ a lot in length, a chart's versions in height (a heart rate's
    // zones table) and a replica's in size (a timing board and a sheet): each fills its own page
    // instead of shrinking the others. So do the looks of a data widget (a line, a stretched
    // column), each as big as the cap allows.
    scale:
      FILLS_PAGE.has(item.kind) ||
      (item.kind === 'activityBlock' && !isDataWidget(item.block.design)) ||
      (item.kind === 'summaryBlock' && !isSummaryDataWidget(item.block.design))
        ? fill(prepared)
        : item.kind === 'activityBlock' || item.kind === 'summaryBlock'
          ? capped(prepared)
          : shared,
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
