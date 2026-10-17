import {
  clampFraming,
  DEFAULT_FRAMING,
  framePhoto,
  MAX_ZOOM,
  panFraming,
  type PhotoFraming,
  zoomFraming,
} from './photo-framing';

const story = { width: 1080, height: 1920 };
const landscapePhoto = { width: 4032, height: 3024 };
const portraitPhoto = { width: 3024, height: 4032 };

describe('framePhoto', () => {
  it('covers the canvas and centers the photo by default', () => {
    const rect = framePhoto(landscapePhoto, story, DEFAULT_FRAMING);
    // A landscape photo in a story canvas is limited by the height.
    expect(rect.height).toBeCloseTo(1920);
    expect(rect.width).toBeCloseTo(2560);
    expect(rect.x).toBeCloseTo((1080 - 2560) / 2);
    expect(rect.y).toBeCloseTo(0);
  });

  it('gives the same rectangle for every resolution of the same photo', () => {
    const framing = { centerX: 0.3, centerY: 0.6, zoom: 1.8 };
    const original = framePhoto({ width: 8064, height: 6048 }, story, framing);
    const reduced = framePhoto({ width: 4096, height: 3072 }, story, framing);
    expect(reduced.x).toBeCloseTo(original.x);
    expect(reduced.y).toBeCloseTo(original.y);
    expect(reduced.width).toBeCloseTo(original.width);
    expect(reduced.height).toBeCloseTo(original.height);
  });

  it('zooms in around the framing center', () => {
    const rect = framePhoto(portraitPhoto, story, { centerX: 0.5, centerY: 0.5, zoom: 2 });
    const coverScale = Math.max(1080 / 3024, 1920 / 4032);
    expect(rect.width).toBeCloseTo(3024 * coverScale * 2);
    // The photo center stays at the canvas center.
    expect(rect.x + rect.width / 2).toBeCloseTo(540);
    expect(rect.y + rect.height / 2).toBeCloseTo(960);
  });

  it('never leaves an empty band at an edge', () => {
    for (const centerX of [0, 1]) {
      for (const centerY of [0, 1]) {
        const rect = framePhoto(landscapePhoto, story, { centerX, centerY, zoom: 1.5 });
        expect(rect.x).toBeLessThanOrEqual(0);
        expect(rect.y).toBeLessThanOrEqual(0);
        expect(rect.x + rect.width).toBeGreaterThanOrEqual(1080 - 1e-9);
        expect(rect.y + rect.height).toBeGreaterThanOrEqual(1920 - 1e-9);
      }
    }
  });

  it('rejects zooms below cover and empty sizes', () => {
    expect(() => framePhoto(landscapePhoto, story, { ...DEFAULT_FRAMING, zoom: 0.5 })).toThrow(
      RangeError,
    );
    expect(() => framePhoto({ width: 0, height: 10 }, story, DEFAULT_FRAMING)).toThrow(RangeError);
  });
});

/** Canvas position of a photo point (0..1) under a framing. */
const canvasPositionOf = (framing: PhotoFraming, u: number, v: number) => {
  const rect = framePhoto(landscapePhoto, story, framing);
  return { x: rect.x + u * rect.width, y: rect.y + v * rect.height };
};

describe('clampFraming', () => {
  it('keeps a framing the canvas can show', () => {
    const framing = { centerX: 0.4, centerY: 0.5, zoom: 2 };
    expect(clampFraming(landscapePhoto, story, framing)).toEqual(framing);
  });

  it('pulls the center back so the photo still covers the canvas', () => {
    // At cover zoom a landscape photo fills the story height: only the horizontal center moves.
    const clamped = clampFraming(landscapePhoto, story, { centerX: 0, centerY: 0, zoom: 1 });
    const halfVisible = 1080 / 2 / 2560;
    expect(clamped.centerX).toBeCloseTo(halfVisible);
    expect(clamped.centerY).toBeCloseTo(0.5);
    expect(
      clampFraming(landscapePhoto, story, { ...DEFAULT_FRAMING, centerX: 1 }).centerX,
    ).toBeCloseTo(1 - halfVisible);
  });

  it('limits the zoom between cover and the maximum', () => {
    expect(clampFraming(landscapePhoto, story, { ...DEFAULT_FRAMING, zoom: 0.5 }).zoom).toBe(1);
    expect(clampFraming(landscapePhoto, story, { ...DEFAULT_FRAMING, zoom: 50 }).zoom).toBe(
      MAX_ZOOM,
    );
  });

  it('rejects a zoom that is not a number', () => {
    expect(() => clampFraming(landscapePhoto, story, { ...DEFAULT_FRAMING, zoom: NaN })).toThrow(
      RangeError,
    );
  });
});

describe('panFraming', () => {
  it('moves the photo with the finger', () => {
    const framing = { centerX: 0.5, centerY: 0.5, zoom: 2 };
    const before = canvasPositionOf(framing, 0.5, 0.5);
    const after = canvasPositionOf(panFraming(landscapePhoto, story, framing, 100, -50), 0.5, 0.5);
    expect(after.x - before.x).toBeCloseTo(100);
    expect(after.y - before.y).toBeCloseTo(-50);
  });

  it('stops at the edges without storing the overshoot', () => {
    const atEdge = panFraming(landscapePhoto, story, DEFAULT_FRAMING, 10_000, 0);
    // Dragging back responds at once: the overshoot was not kept.
    const back = panFraming(landscapePhoto, story, atEdge, -10, 0);
    expect(atEdge.centerX).toBeCloseTo(1080 / 2 / 2560);
    expect(back.centerX).toBeGreaterThan(atEdge.centerX);
  });
});

describe('zoomFraming', () => {
  it('keeps the photo point under the fingers', () => {
    const focal = { x: 300, y: 1200 };
    const framing = { centerX: 0.5, centerY: 0.5, zoom: 1.5 };
    const before = framePhoto(landscapePhoto, story, framing);
    const u = (focal.x - before.x) / before.width;
    const v = (focal.y - before.y) / before.height;
    const zoomed = zoomFraming(landscapePhoto, story, framing, 1.6, focal);
    expect(zoomed.zoom).toBeCloseTo(2.4);
    const after = canvasPositionOf(zoomed, u, v);
    expect(after.x).toBeCloseTo(focal.x);
    expect(after.y).toBeCloseTo(focal.y);
  });

  it('stops at the zoom limits', () => {
    const focal = { x: 540, y: 960 };
    expect(zoomFraming(landscapePhoto, story, DEFAULT_FRAMING, 0.5, focal).zoom).toBe(1);
    expect(
      zoomFraming(landscapePhoto, story, { ...DEFAULT_FRAMING, zoom: 3 }, 10, focal).zoom,
    ).toBe(MAX_ZOOM);
  });

  it('stays covering the canvas when zooming out near an edge', () => {
    const framing = clampFraming(landscapePhoto, story, { centerX: 0, centerY: 0, zoom: 3 });
    const out = zoomFraming(landscapePhoto, story, framing, 0.5, { x: 0, y: 0 });
    expect(out).toEqual(clampFraming(landscapePhoto, story, out));
  });

  it('rejects factors that are not positive', () => {
    expect(() => zoomFraming(landscapePhoto, story, DEFAULT_FRAMING, 0, { x: 0, y: 0 })).toThrow(
      RangeError,
    );
  });
});
