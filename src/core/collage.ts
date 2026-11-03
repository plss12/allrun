import {
  COVER_PLACEMENT,
  coversCanvas,
  drawPhoto,
  type PhotoDrawing,
  type PhotoPlacement,
  type Size,
} from './photo-placement';
import { COLLAGE_LAYOUTS, type Collage, type CollageLayout, MAX_COLLAGE_PHOTOS } from './template';

/**
 * Collages (ADR 009): the canvas split into cells, each with a photo of its own, placed relative to
 * its cell as a photo is to the canvas (see `photo-placement.ts`): so a design fits any photos and
 * any format. The photos themselves aren't in the design: they belong to the image being made.
 * Cells touch; a frame, if the design has one, is drawn over their edges.
 */

/** A part of the canvas, as fractions of it. */
export interface CollageCell {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A rectangle on the canvas, in canvas pixels. */
export interface CanvasRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Rows and columns of equal cells: `columns` wide in each of `rows`, row after row. */
const grid = (columns: number, rows: number): readonly CollageCell[] =>
  Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (__, column) => ({
      x: column / columns,
      y: row / rows,
      width: 1 / columns,
      height: 1 / rows,
    })),
  ).flat();

const CELLS: Readonly<Record<CollageLayout, readonly CollageCell[]>> = {
  two: grid(1, 2),
  three: grid(1, 3),
  oneTwo: [
    { x: 0, y: 0, width: 1, height: 0.5 },
    { x: 0, y: 0.5, width: 0.5, height: 0.5 },
    { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
  ],
  four: grid(2, 2),
  six: grid(2, 3),
};

export { COLLAGE_LAYOUTS };

/** The cells of a layout, in the order photos fill them. */
export const collageCells = (layout: CollageLayout): readonly CollageCell[] => CELLS[layout];

/** A new collage of `layout`: each photo centered, covering its cell. */
export function newCollage(layout: CollageLayout): Collage {
  return {
    layout,
    placements: Array.from({ length: MAX_COLLAGE_PHOTOS }, () => COVER_PLACEMENT),
  };
}

/** `collage` with another placement for the photo of cell `index`. */
export function withCellPlacement(
  collage: Collage,
  index: number,
  placement: PhotoPlacement,
): Collage {
  return {
    ...collage,
    placements: collage.placements.map((current, i) => (i === index ? placement : current)),
  };
}

/**
 * The cell at a point of the canvas (as fractions of it). A point on the edge goes to the next
 * cell, and outside the canvas to the nearest. Time O(c) for c cells.
 */
export function cellAt(layout: CollageLayout, x: number, y: number): number {
  const inside = (value: number) => Math.min(0.999999, Math.max(0, value));
  const px = inside(x);
  const py = inside(y);
  return CELLS[layout].findIndex(
    (cell) => px >= cell.x && px < cell.x + cell.width && py >= cell.y && py < cell.y + cell.height,
  );
}

/** A cell in canvas pixels. */
export function cellRect(cell: CollageCell, canvas: Size): CanvasRect {
  return {
    x: cell.x * canvas.width,
    y: cell.y * canvas.height,
    width: cell.width * canvas.width,
    height: cell.height * canvas.height,
  };
}

/**
 * Where to draw a photo of size `photo` in a cell, in canvas pixels: placed in the cell as a photo
 * is on the canvas.
 */
export function drawInCell(photo: Size, rect: CanvasRect, placement: PhotoPlacement): PhotoDrawing {
  'worklet';
  const drawing = drawPhoto(photo, rect, placement);
  return { ...drawing, x: rect.x + drawing.x, y: rect.y + drawing.y };
}

/** The whole canvas, as the only cell of a design with one photo. */
export const WHOLE_CANVAS: CollageCell = { x: 0, y: 0, width: 1, height: 1 };

/** Width of a design's frame, in canvas pixels. */
export const COLLAGE_FRAME_WIDTH = 16;

/** How close to the canvas's edge a cell's edge counts as on it (fractions add up unevenly). */
const ON_EDGE = 1e-6;

/**
 * The bars of a design's frame, in canvas pixels, all as wide: around the canvas, and in a collage
 * (`layout`; `null` for one photo) between cells, half on each. So the frame is even on every side
 * and every layout, and covers only the
 * edges of the photos. Time O(c) for c cells.
 */
export function collageFrameBars(
  layout: CollageLayout | null,
  canvas: Size,
): readonly CanvasRect[] {
  const half = COLLAGE_FRAME_WIDTH / 2;
  return (layout === null ? [WHOLE_CANVAS] : CELLS[layout]).flatMap((cell) => {
    const rect = cellRect(cell, canvas);
    const left = cell.x < ON_EDGE ? COLLAGE_FRAME_WIDTH : half;
    const top = cell.y < ON_EDGE ? COLLAGE_FRAME_WIDTH : half;
    const right = cell.x + cell.width > 1 - ON_EDGE ? COLLAGE_FRAME_WIDTH : half;
    const bottom = cell.y + cell.height > 1 - ON_EDGE ? COLLAGE_FRAME_WIDTH : half;
    return [
      { x: rect.x, y: rect.y, width: left, height: rect.height },
      { x: rect.x + rect.width - right, y: rect.y, width: right, height: rect.height },
      { x: rect.x, y: rect.y, width: rect.width, height: top },
      { x: rect.x, y: rect.y + rect.height - bottom, width: rect.width, height: bottom },
    ];
  });
}

/**
 * Whether the photos, of the sizes given by cell (`null` for an empty cell), cover the canvas: every
 * cell has a photo that covers it. Time O(c) for c cells.
 */
export function collageCovers(
  collage: Collage,
  photos: readonly (Size | null)[],
  canvas: Size,
): boolean {
  return CELLS[collage.layout].every((cell, index) => {
    const photo = photos[index] ?? null;
    return photo !== null && coversCanvas(photo, cellRect(cell, canvas), collage.placements[index]);
  });
}
