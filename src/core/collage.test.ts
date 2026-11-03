import {
  cellAt,
  cellRect,
  COLLAGE_FRAME_WIDTH,
  COLLAGE_LAYOUTS,
  collageCells,
  collageCovers,
  collageFrameBars,
  drawInCell,
  newCollage,
  withCellPlacement,
} from './collage';
import { COVER_PLACEMENT } from './photo-placement';
import { CANVAS_FORMATS, MAX_COLLAGE_PHOTOS, newTemplate, parseTemplate } from './template';

const canvas = CANVAS_FORMATS.story;

describe('collageCells', () => {
  it.each(COLLAGE_LAYOUTS)('%s covers the canvas exactly, without overlaps', (layout) => {
    const cells = collageCells(layout);
    const area = cells.reduce((sum, cell) => sum + cell.width * cell.height, 0);
    expect(area).toBeCloseTo(1, 6);
    // Sampling it: every point falls in one cell only.
    for (let x = 0.05; x < 1; x += 0.1) {
      for (let y = 0.05; y < 1; y += 0.1) {
        const holding = cells.filter(
          (cell) =>
            x >= cell.x && x < cell.x + cell.width && y >= cell.y && y < cell.y + cell.height,
        );
        expect(holding).toHaveLength(1);
      }
    }
  });

  it('offers the layouts of the design, with their number of photos', () => {
    expect(COLLAGE_LAYOUTS.map((layout) => collageCells(layout).length)).toEqual([2, 3, 3, 4, 6]);
  });

  it('never has more cells than photos a collage keeps', () => {
    for (const layout of COLLAGE_LAYOUTS) {
      expect(collageCells(layout).length).toBeLessThanOrEqual(MAX_COLLAGE_PHOTOS);
    }
  });
});

describe('cellAt', () => {
  it('finds the cell at a point', () => {
    expect(cellAt('two', 0.5, 0.25)).toBe(0);
    expect(cellAt('two', 0.5, 0.75)).toBe(1);
    expect(cellAt('oneTwo', 0.9, 0.2)).toBe(0);
    expect(cellAt('oneTwo', 0.2, 0.7)).toBe(1);
    expect(cellAt('oneTwo', 0.8, 0.7)).toBe(2);
    expect(cellAt('six', 0.75, 0.9)).toBe(5);
  });

  it('gives the next cell on an edge', () => {
    expect(cellAt('two', 0.5, 0.5)).toBe(1);
  });

  it('gives the nearest cell at the ends of the canvas and outside it', () => {
    expect(cellAt('four', 1, 1)).toBe(3);
    expect(cellAt('four', 0, 0)).toBe(0);
    expect(cellAt('four', 1.5, -1)).toBe(1);
  });
});

describe('drawInCell', () => {
  it('centers a covering photo in its cell', () => {
    const rect = cellRect(collageCells('two')[1], canvas);
    const drawing = drawInCell({ width: 1000, height: 1000 }, rect, COVER_PLACEMENT);
    expect(drawing.x).toBeCloseTo(rect.x + rect.width / 2);
    expect(drawing.y).toBeCloseTo(rect.y + rect.height / 2);
    expect(drawing.width).toBeGreaterThanOrEqual(rect.width);
    expect(drawing.height).toBeGreaterThanOrEqual(rect.height);
  });
});

describe('collageFrameBars', () => {
  /** How much of the frame covers a pixel row or column, at `value` across the canvas. */
  const covers = (
    bars: ReturnType<typeof collageFrameBars>,
    axis: 'x' | 'y',
    at: number,
    value: number,
  ) =>
    bars.some((bar) => {
      const [from, length, otherFrom, otherLength] =
        axis === 'x'
          ? [bar.x, bar.width, bar.y, bar.height]
          : [bar.y, bar.height, bar.x, bar.width];
      return (
        value >= from && value < from + length && at >= otherFrom && at < otherFrom + otherLength
      );
    });

  it('goes around the canvas, as wide on every side', () => {
    const bars = collageFrameBars('two', canvas);
    const w = COLLAGE_FRAME_WIDTH;
    expect(covers(bars, 'x', 100, 0)).toBe(true);
    expect(covers(bars, 'x', 100, w - 1)).toBe(true);
    expect(covers(bars, 'x', 100, w + 1)).toBe(false);
    expect(covers(bars, 'x', 100, canvas.width - 1)).toBe(true);
    expect(covers(bars, 'x', 100, canvas.width - w - 1)).toBe(false);
    expect(covers(bars, 'y', 100, 0)).toBe(true);
    expect(covers(bars, 'y', 100, canvas.height - 1)).toBe(true);
  });

  it('goes between cells as wide, half on each', () => {
    const bars = collageFrameBars('two', canvas);
    const middle = canvas.height / 2;
    const w = COLLAGE_FRAME_WIDTH;
    expect(covers(bars, 'y', 100, middle - w / 2)).toBe(true);
    expect(covers(bars, 'y', 100, middle + w / 2 - 1)).toBe(true);
    expect(covers(bars, 'y', 100, middle - w / 2 - 1)).toBe(false);
    expect(covers(bars, 'y', 100, middle + w / 2 + 1)).toBe(false);
  });

  it('leaves the photos clear inside their cells', () => {
    const bars = collageFrameBars('six', canvas);
    for (const cell of collageCells('six')) {
      const rect = cellRect(cell, canvas);
      expect(covers(bars, 'x', rect.y + rect.height / 2, rect.x + rect.width / 2)).toBe(false);
    }
  });
});

describe('the frame of a single photo', () => {
  const bars = collageFrameBars(null, canvas);

  it('goes only around the canvas', () => {
    const w = COLLAGE_FRAME_WIDTH;
    const inside = (x: number, y: number) =>
      bars.some(
        (bar) => x >= bar.x && x < bar.x + bar.width && y >= bar.y && y < bar.y + bar.height,
      );
    expect(inside(1, canvas.height / 2)).toBe(true);
    expect(inside(canvas.width - 1, canvas.height / 2)).toBe(true);
    expect(inside(canvas.width / 2, 1)).toBe(true);
    expect(inside(canvas.width / 2, canvas.height - 1)).toBe(true);
    expect(inside(w + 1, canvas.height / 2)).toBe(false);
    expect(inside(canvas.width / 2, canvas.height / 2)).toBe(false);
  });
});

describe('collageCovers', () => {
  const photo = { width: 2000, height: 2000 };

  it('needs a photo in every cell', () => {
    const collage = newCollage('two');
    expect(collageCovers(collage, [photo, photo], canvas)).toBe(true);
    expect(collageCovers(collage, [photo, null], canvas)).toBe(false);
    expect(collageCovers(collage, [photo], canvas)).toBe(false);
  });

  it('needs each photo to cover its cell', () => {
    const smaller = withCellPlacement(newCollage('two'), 1, { ...COVER_PLACEMENT, scale: 0.5 });
    expect(collageCovers(smaller, [photo, photo], canvas)).toBe(false);
  });

  it('ignores the photos beyond the cells of its layout', () => {
    expect(collageCovers(newCollage('two'), [photo, photo, null, null], canvas)).toBe(true);
  });
});

describe('a collage in a design', () => {
  const base = newTemplate({ id: 'design', mode: 'activity', format: 'story', layers: [] });

  it('is read back from a saved design', () => {
    const collage = withCellPlacement(newCollage('four'), 2, { ...COVER_PLACEMENT, x: 0.3 });
    expect(parseTemplate({ ...base, collage }).collage).toEqual(collage);
  });

  it('is optional: a design saved before them still reads', () => {
    expect(parseTemplate(base).collage).toBeUndefined();
  });

  it('gives its old frame to the design, which has it now', () => {
    const old = { ...base, collage: { ...newCollage('two'), frame: 'dark' } };
    const read = parseTemplate(old);
    expect(read.frame).toBe('dark');
    expect(read.collage).toEqual(newCollage('two'));
  });

  it('keeps the frame of the design over that old one', () => {
    const both = { ...base, frame: 'light', collage: { ...newCollage('two'), frame: 'dark' } };
    expect(parseTemplate(both).frame).toBe('light');
  });

  it('reads a design without a frame as having none', () => {
    expect(parseTemplate(base).frame).toBeUndefined();
    expect(parseTemplate({ ...base, frame: 'light' }).frame).toBe('light');
    expect(() => parseTemplate({ ...base, frame: 'gold' })).toThrow();
  });

  it('refuses a layout it does not know, and a wrong number of placements', () => {
    expect(() =>
      parseTemplate({ ...base, collage: { ...newCollage('two'), layout: 'seven' } }),
    ).toThrow();
    expect(() =>
      parseTemplate({ ...base, collage: { ...newCollage('two'), placements: [COVER_PLACEMENT] } }),
    ).toThrow();
  });
});
