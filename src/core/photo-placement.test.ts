import {
  clampPlacement,
  COVER_PLACEMENT,
  coversCanvas,
  drawPhoto,
  MAX_PHOTO_SCALE,
  MIN_PHOTO_SCALE,
  panPlacement,
  type PhotoPlacement,
  rotatePlacement,
  samePlacement,
  snapPlacement,
  zoomPlacement,
} from './photo-placement';

const story = { width: 1080, height: 1920 };
const landscapePhoto = { width: 4032, height: 3024 };
const portraitPhoto = { width: 3024, height: 4032 };
const thresholds = { distance: 20, rotation: (4 * Math.PI) / 180, scale: 0.04 };

const placed = (overrides: Partial<PhotoPlacement>): PhotoPlacement => ({
  ...COVER_PLACEMENT,
  ...overrides,
});

describe('drawPhoto', () => {
  it('covers the canvas exactly at scale 1, centered, whatever the photo', () => {
    // A landscape photo in a story covers its height and reaches past its sides.
    const landscape = drawPhoto(landscapePhoto, story, COVER_PLACEMENT);
    expect(landscape.height).toBeCloseTo(1920);
    expect(landscape.width).toBeCloseTo((1920 * 4032) / 3024);
    expect([landscape.x, landscape.y]).toEqual([540, 960]);
    // A portrait photo covers the story's width.
    expect(drawPhoto(portraitPhoto, story, COVER_PLACEMENT).width).toBeCloseTo(1440);
  });

  it('is the same for any resolution of the photo, so the export matches the editor', () => {
    const placement = placed({ x: 0.3, y: 0.7, scale: 0.6, rotation: 0.4 });
    const editorCopy = drawPhoto({ width: 2048, height: 1536 }, story, placement);
    const exportCopy = drawPhoto(landscapePhoto, story, placement);
    expect(editorCopy.width).toBeCloseTo(exportCopy.width);
    expect(editorCopy.height).toBeCloseTo(exportCopy.height);
    expect([editorCopy.x, editorCopy.y]).toEqual([exportCopy.x, exportCopy.y]);
  });

  it('rejects photos or canvases without area', () => {
    expect(() => drawPhoto({ width: 0, height: 10 }, story, COVER_PLACEMENT)).toThrow(RangeError);
    expect(() => drawPhoto(landscapePhoto, { width: 10, height: 0 }, COVER_PLACEMENT)).toThrow(
      RangeError,
    );
  });
});

describe('coversCanvas', () => {
  it('covers at the cover placement and when zoomed in', () => {
    expect(coversCanvas(landscapePhoto, story, COVER_PLACEMENT)).toBe(true);
    expect(coversCanvas(landscapePhoto, story, placed({ scale: 2, x: 0.6 }))).toBe(true);
  });

  it('leaves room when smaller, moved off or turned', () => {
    expect(coversCanvas(landscapePhoto, story, placed({ scale: 0.8 }))).toBe(false);
    expect(coversCanvas(portraitPhoto, story, placed({ y: 0.6 }))).toBe(false);
    // Turned, the photo just covering no longer reaches the corners.
    expect(coversCanvas(portraitPhoto, story, placed({ rotation: 0.2 }))).toBe(false);
  });
});

describe('clampPlacement', () => {
  it('keeps the scale within its limits, the center on the canvas and the angle in (-π, π]', () => {
    expect(clampPlacement({ x: -0.5, y: 1.4, scale: 0.01, rotation: 3 * Math.PI })).toEqual({
      x: 0,
      y: 1,
      scale: MIN_PHOTO_SCALE,
      rotation: Math.PI,
    });
    expect(clampPlacement(placed({ scale: 99 })).scale).toBe(MAX_PHOTO_SCALE);
  });
});

describe('panPlacement', () => {
  it('moves the center by canvas pixels, keeping it on the canvas', () => {
    expect(panPlacement(COVER_PLACEMENT, story, 108, -192)).toEqual(placed({ x: 0.6, y: 0.4 }));
    expect(panPlacement(COVER_PLACEMENT, story, 5000, 0).x).toBe(1);
  });
});

describe('zoomPlacement', () => {
  it('keeps the point under the fingers where it was', () => {
    const focal = { x: 200, y: 300 };
    const before = drawPhoto(landscapePhoto, story, COVER_PLACEMENT);
    const zoomed = zoomPlacement(COVER_PLACEMENT, story, 0.5, focal);
    const after = drawPhoto(landscapePhoto, story, zoomed);
    // The focal point, as a share of the photo from its top-left corner, is the same.
    const share = (drawing: typeof before) => ({
      u: (focal.x - (drawing.x - drawing.width / 2)) / drawing.width,
      v: (focal.y - (drawing.y - drawing.height / 2)) / drawing.height,
    });
    expect(zoomed.scale).toBeCloseTo(0.5);
    expect(share(after).u).toBeCloseTo(share(before).u);
    expect(share(after).v).toBeCloseTo(share(before).v);
  });

  it('stops at its limits instead of drifting, and ignores factors that are not positive', () => {
    const smallest = placed({ scale: MIN_PHOTO_SCALE });
    expect(zoomPlacement(smallest, story, 0.5, { x: 0, y: 0 })).toEqual(smallest);
    expect(zoomPlacement(COVER_PLACEMENT, story, 0, { x: 0, y: 0 })).toBe(COVER_PLACEMENT);
    expect(zoomPlacement(COVER_PLACEMENT, story, Number.NaN, { x: 0, y: 0 })).toBe(COVER_PLACEMENT);
  });
});

describe('rotatePlacement', () => {
  it('turns around the photo center, within (-π, π]', () => {
    expect(rotatePlacement(placed({ x: 0.3 }), 0.5)).toEqual(placed({ x: 0.3, rotation: 0.5 }));
    expect(rotatePlacement(placed({ rotation: 3 }), 1).rotation).toBeCloseTo(4 - 2 * Math.PI);
  });
});

describe('snapPlacement', () => {
  it('gives back the covering placement when close to it', () => {
    const near = placed({ x: 0.505, y: 0.497, scale: 1.02, rotation: 0.03 });
    const snap = snapPlacement(near, landscapePhoto, story, thresholds);
    expect(snap.placement).toEqual(COVER_PLACEMENT);
    expect(snap).toMatchObject({ x: 'center', y: 'center', rotation: true, cover: true });
    expect(coversCanvas(landscapePhoto, story, snap.placement)).toBe(true);
  });

  it("puts a photo's edge on a canvas edge", () => {
    // Half as big, its left edge a few pixels from the canvas's.
    const small = placed({ scale: 0.5, y: 0.3 });
    const half = drawPhoto(portraitPhoto, story, small).width / 2;
    const snap = snapPlacement(
      { ...small, x: (half + 6) / story.width },
      portraitPhoto,
      story,
      thresholds,
    );
    expect(snap.x).toBe('start');
    expect(snap.placement.x * story.width).toBeCloseTo(half);
    expect(snap.y).toBe('none');
    expect(snap.cover).toBe(false);
  });

  it('leaves a placement far from every snap as it is', () => {
    const free = placed({ x: 0.31, y: 0.62, scale: 0.7, rotation: 0.6 });
    const snap = snapPlacement(free, landscapePhoto, story, thresholds);
    expect(snap.placement).toEqual(free);
    expect(snap).toMatchObject({ x: 'none', y: 'none', rotation: false, cover: false });
  });
});

describe('samePlacement', () => {
  it('compares value by value', () => {
    expect(samePlacement(COVER_PLACEMENT, { ...COVER_PLACEMENT })).toBe(true);
    expect(samePlacement(COVER_PLACEMENT, placed({ scale: 1.1 }))).toBe(false);
  });
});
