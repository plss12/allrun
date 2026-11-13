import {
  ClipOp,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  type SkPaint,
  type SkPath,
  type SkPicture,
} from '@shopify/react-native-skia';

import { mapLineWidth, placeMapTile, svgOfGroup } from '@/core/map-drawing';
import type { MapTileFeatures } from '@/core/map-tile-decode';
import { tileKey } from '@/core/map-tile-source';
import type { Tile, Viewport } from '@/core/map-tiles';
import { MAP_COLORS, type MapPaint } from '@/core/map-style';

/**
 * The map drawn with Skia (ADR 021): each tile's groups made into paths once, in tile units, and
 * kept for the next drawing that takes the tile (cards of the same place share most of theirs);
 * a drawing recorded as one picture, each tile clipped to its square and scaled into place.
 */

/** A tile's groups as Skia paths, bottom to top. */
interface TileShapes {
  readonly extent: number;
  readonly shapes: readonly { readonly paint: MapPaint; readonly path: SkPath }[];
}

/**
 * Tiles whose paths are kept: the 4 to 25 of a few cards on screen and around, so scrolling back
 * and forth doesn't make them again. A zoom 13 tile of a city center is some 14,000 points.
 */
const KEPT_TILES = 64;
const shapesByTile = new Map<string, TileShapes>();

function shapesOf(tile: Tile, features: MapTileFeatures): TileShapes {
  const key = tileKey(tile);
  const kept = shapesByTile.get(key);
  if (kept !== undefined) {
    // Last used last: the map's order is the eviction order.
    shapesByTile.delete(key);
    shapesByTile.set(key, kept);
    return kept;
  }
  const shapes = features.groups.flatMap((group) => {
    const path = Skia.Path.MakeFromSVGString(svgOfGroup(group));
    return path === null ? [] : [{ paint: group.paint, path }];
  });
  const made = { extent: features.extent, shapes };
  shapesByTile.set(key, made);
  for (const [oldest, old] of shapesByTile) {
    if (shapesByTile.size <= KEPT_TILES) {
      break;
    }
    shapesByTile.delete(oldest);
    // A picture keeps its own copy of what it draws: freeing the path doesn't touch it.
    old.shapes.forEach(({ path }) => path.dispose());
  }
  return made;
}

/** Pictures already recorded, by their tiles (an activity's, kept while it is open) and view. */
const pictures = new WeakMap<object, Map<string, SkPicture>>();

/**
 * The map of `viewport` from `tiles` (see {@link recordMapPicture}), recorded once for each
 * view of those tiles: a widget's map is drawn again with every change to its design. Not freed
 * here: a canvas may still draw it; the garbage collector frees it with its tiles.
 */
export function mapPicture(
  viewport: Viewport,
  tiles: readonly { readonly tile: Tile; readonly features: MapTileFeatures }[],
): SkPicture {
  const key = `${viewport.left}|${viewport.top}|${viewport.scale}|${viewport.width}|${viewport.height}`;
  let byView = pictures.get(tiles);
  if (byView === undefined) {
    byView = new Map();
    pictures.set(tiles, byView);
  }
  let picture = byView.get(key);
  if (picture === undefined) {
    picture = recordMapPicture(viewport, tiles);
    byView.set(key, picture);
  }
  return picture;
}

let paints: { fill: SkPaint; line: SkPaint } | null = null;

function mapPaints() {
  if (paints === null) {
    const fill = Skia.Paint();
    fill.setAntiAlias(true);
    fill.setStyle(PaintStyle.Fill);
    const line = Skia.Paint();
    line.setAntiAlias(true);
    line.setStyle(PaintStyle.Stroke);
    line.setStrokeCap(StrokeCap.Round);
    line.setStrokeJoin(StrokeJoin.Round);
    paints = { fill, line };
  }
  return paints;
}

/**
 * The map of a viewport's drawing, from its loaded tiles, as a picture of the drawing's size:
 * clipped to its size: its background, then each tile clipped to its square (their buffers overlap their
 * neighbors'). The clip isn't antialiased, so neighboring tiles share their edge pixels exactly,
 * without a seam. Time O(t·g) to record t tiles of g groups each, plus O(p) for the points of
 * the tiles not yet made into paths; space O(t·g).
 */
export function recordMapPicture(
  viewport: Viewport,
  tiles: readonly { readonly tile: Tile; readonly features: MapTileFeatures }[],
): SkPicture {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, viewport.width, viewport.height));
  const { fill, line } = mapPaints();
  const bounds = Skia.XYWHRect(0, 0, viewport.width, viewport.height);
  // Tiles run past the drawing: nothing of them out of it.
  canvas.clipRect(bounds, ClipOp.Intersect, false);
  fill.setColor(Skia.Color(MAP_COLORS.background));
  canvas.drawRect(bounds, fill);
  for (const { tile, features } of tiles) {
    const { extent, shapes } = shapesOf(tile, features);
    const { placement, clip } = placeMapTile(tile, extent, viewport);
    canvas.save();
    canvas.clipRect(Skia.XYWHRect(clip.x, clip.y, clip.size, clip.size), ClipOp.Intersect, false);
    canvas.translate(placement.x, placement.y);
    canvas.scale(placement.scale, placement.scale);
    for (const { paint, path } of shapes) {
      if (paint.kind === 'fill') {
        fill.setColor(Skia.Color(paint.color));
        canvas.drawPath(path, fill);
      } else {
        line.setColor(Skia.Color(paint.color));
        line.setStrokeWidth(mapLineWidth(paint.width, viewport.width) / placement.scale);
        canvas.drawPath(path, line);
      }
    }
    canvas.restore();
  }
  const picture = recorder.finishRecordingAsPicture();
  recorder.dispose();
  return picture;
}
