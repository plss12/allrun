import type { MapTileGroup } from './map-tile-decode';
import {
  placeTile,
  scaleViewport,
  tilesCovering,
  tileZoom,
  type Tile,
  type TilePlacement,
  type Viewport,
} from './map-tiles';
import { MAP_REFERENCE_WIDTH } from './map-style';

/**
 * How a map is drawn from its tiles (ADR 021), as pure steps: which tiles a drawing takes, at the
 * zoom an image of the design's width would take (so a card shows the detail of its exported
 * image), how wide the lines are at the drawing's size, and each group's shape as an SVG path
 * (one string, so the whole group crosses to Skia in a single call).
 */

/** The tiles of a drawing and its zoom. */
export interface MapPlan {
  readonly zoom: number;
  readonly tiles: readonly Tile[];
}

/**
 * The tiles a viewport's drawing takes, at the zoom of the same view drawn
 * {@link MAP_REFERENCE_WIDTH} wide. Time and space O(t) for its t tiles.
 */
export function planMap(viewport: Viewport): MapPlan {
  const zoom = tileZoom(scaleViewport(viewport, MAP_REFERENCE_WIDTH / viewport.width));
  return { zoom, tiles: tilesCovering(viewport, zoom) };
}

/** Where a tile goes in the drawing, and the square it is clipped to (the buffer left out). */
export interface PlacedTile {
  readonly placement: TilePlacement;
  readonly clip: { readonly x: number; readonly y: number; readonly size: number };
}

/** Places a tile of `extent` units in the viewport's drawing. Time and space O(1). */
export function placeMapTile(tile: Tile, extent: number, viewport: Viewport): PlacedTile {
  const placement = placeTile(tile, extent, viewport);
  return { placement, clip: { x: placement.x, y: placement.y, size: extent * placement.scale } };
}

/**
 * A line's width in the drawing's pixels: the style's widths are for a drawing
 * {@link MAP_REFERENCE_WIDTH} wide. Time and space O(1).
 */
export function mapLineWidth(styleWidth: number, drawingWidth: number): number {
  return (styleWidth * drawingWidth) / MAP_REFERENCE_WIDTH;
}

/**
 * A group's rings as one SVG path, in tile units: each ring a move and its lines, and, for areas,
 * closed. Rings of fewer than two points draw nothing and are left out. Time and space O(p) for
 * its p points.
 */
export function svgOfGroup(group: MapTileGroup): string {
  const close = group.paint.kind === 'fill';
  const parts: string[] = [];
  for (const ring of group.rings) {
    if (ring.length < 4) {
      continue;
    }
    parts.push(`M${ring[0]} ${ring[1]}`);
    for (let i = 2; i < ring.length; i += 2) {
      parts.push(`L${ring[i]} ${ring[i + 1]}`);
    }
    if (close) {
      parts.push('Z');
    }
  }
  return parts.join('');
}
