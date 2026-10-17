import {
  clampFraming,
  DEFAULT_FRAMING,
  framePhoto,
  MAX_ZOOM,
  panFraming,
  type PhotoFraming,
  type PhotoPlacement,
  rotateFraming,
  type Size,
  zoomFraming,
} from './photo-framing';

const story = { width: 1080, height: 1920 };
const landscapePhoto = { width: 4032, height: 3024 };
const portraitPhoto = { width: 3024, height: 4032 };

/** Canvas position of a photo point (0..1 of its width and height) under a placement. */
function canvasPoint(placement: PhotoPlacement, canvas: Size, u: number, v: number) {
  const localX = placement.x + u * placement.width;
  const localY = placement.y + v * placement.height;
  const cos = Math.cos(placement.rotation);
  const sin = Math.sin(placement.rotation);
  return {
    x: canvas.width / 2 + localX * cos - localY * sin,
    y: canvas.height / 2 + localX * sin + localY * cos,
  };
}

/** Photo point (0..1) shown at a canvas position under a placement. */
function photoPoint(placement: PhotoPlacement, canvas: Size, x: number, y: number) {
  const dx = x - canvas.width / 2;
  const dy = y - canvas.height / 2;
  const cos = Math.cos(placement.rotation);
  const sin = Math.sin(placement.rotation);
  return {
    u: (dx * cos + dy * sin - placement.x) / placement.width,
    v: (-dx * sin + dy * cos - placement.y) / placement.height,
  };
}

/** Whether every canvas corner shows part of the photo. */
function coversCanvas(placement: PhotoPlacement, canvas: Size): boolean {
  const corners = [
    [0, 0],
    [canvas.width, 0],
    [0, canvas.height],
    [canvas.width, canvas.height],
  ];
  return corners.every(([x, y]) => {
    const { u, v } = photoPoint(placement, canvas, x, y);
    const epsilon = 1e-9;
    return u >= -epsilon && u <= 1 + epsilon && v >= -epsilon && v <= 1 + epsilon;
  });
}

const framing = (overrides: Partial<PhotoFraming>): PhotoFraming => ({
  ...DEFAULT_FRAMING,
  ...overrides,
});

describe('framePhoto', () => {
  it('covers the canvas and centers the photo by default', () => {
    const placement = framePhoto(landscapePhoto, story, DEFAULT_FRAMING);
    // A landscape photo in a story canvas is limited by the height.
    expect(placement.height).toBeCloseTo(1920);
    expect(placement.width).toBeCloseTo(2560);
    expect(canvasPoint(placement, story, 0.5, 0.5).x).toBeCloseTo(540);
    expect(canvasPoint(placement, story, 0, 0).y).toBeCloseTo(0);
  });

  it('gives the same placement for every resolution of the same photo', () => {
    const tilted = framing({ centerX: 0.4, centerY: 0.6, zoom: 1.8, rotation: 0.3 });
    const original = framePhoto({ width: 8064, height: 6048 }, story, tilted);
    const reduced = framePhoto({ width: 4096, height: 3072 }, story, tilted);
    expect(reduced.x).toBeCloseTo(original.x);
    expect(reduced.y).toBeCloseTo(original.y);
    expect(reduced.width).toBeCloseTo(original.width);
    expect(reduced.height).toBeCloseTo(original.height);
  });

  it('zooms in around the framing center', () => {
    const placement = framePhoto(portraitPhoto, story, framing({ zoom: 2 }));
    const coverScale = Math.max(1080 / 3024, 1920 / 4032);
    expect(placement.width).toBeCloseTo(3024 * coverScale * 2);
    const center = canvasPoint(placement, story, 0.5, 0.5);
    expect(center.x).toBeCloseTo(540);
    expect(center.y).toBeCloseTo(960);
  });

  it('never leaves an empty corner, rotated or not', () => {
    for (const rotation of [0, 0.2, -0.7, Math.PI / 2, 3]) {
      for (const centerX of [0, 1]) {
        for (const centerY of [0, 1]) {
          const placement = framePhoto(
            landscapePhoto,
            story,
            framing({ centerX, centerY, zoom: 1, rotation }),
          );
          expect(coversCanvas(placement, story)).toBe(true);
        }
      }
    }
  });

  it('rejects zooms below cover and empty sizes', () => {
    expect(() => framePhoto(landscapePhoto, story, framing({ zoom: 0.5 }))).toThrow(RangeError);
    expect(() => framePhoto({ width: 0, height: 10 }, story, DEFAULT_FRAMING)).toThrow(RangeError);
  });
});

describe('clampFraming', () => {
  it('keeps a framing the canvas can show', () => {
    const shown = framing({ centerX: 0.4, centerY: 0.5, zoom: 2, rotation: 0.1 });
    expect(clampFraming(landscapePhoto, story, shown)).toEqual(shown);
  });

  it('pulls the center back so the photo still covers the canvas', () => {
    // At cover zoom a landscape photo fills the story height: only the horizontal center moves.
    const clamped = clampFraming(landscapePhoto, story, framing({ centerX: 0, centerY: 0 }));
    const halfVisible = 1080 / 2 / 2560;
    expect(clamped.centerX).toBeCloseTo(halfVisible);
    expect(clamped.centerY).toBeCloseTo(0.5);
    expect(clampFraming(landscapePhoto, story, framing({ centerX: 1 })).centerX).toBeCloseTo(
      1 - halfVisible,
    );
  });

  it('limits the zoom between cover and the maximum', () => {
    expect(clampFraming(landscapePhoto, story, framing({ zoom: 0.5 })).zoom).toBe(1);
    expect(clampFraming(landscapePhoto, story, framing({ zoom: 50 })).zoom).toBe(MAX_ZOOM);
  });

  it('keeps the rotation in (-π, π]', () => {
    expect(clampFraming(landscapePhoto, story, framing({ rotation: 7 })).rotation).toBeCloseTo(
      7 - 2 * Math.PI,
    );
  });

  it('rejects a zoom that is not a number', () => {
    expect(() => clampFraming(landscapePhoto, story, framing({ zoom: NaN }))).toThrow(RangeError);
  });
});

describe('panFraming', () => {
  it('moves the photo with the finger, also when rotated', () => {
    for (const rotation of [0, 0.5]) {
      const start = framing({ zoom: 2, rotation });
      const before = canvasPoint(framePhoto(landscapePhoto, story, start), story, 0.5, 0.5);
      const moved = panFraming(landscapePhoto, story, start, 100, -50);
      const after = canvasPoint(framePhoto(landscapePhoto, story, moved), story, 0.5, 0.5);
      expect(after.x - before.x).toBeCloseTo(100);
      expect(after.y - before.y).toBeCloseTo(-50);
    }
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
  it('keeps the photo point under the fingers, also when rotated', () => {
    const focal = { x: 300, y: 1200 };
    for (const rotation of [0, -0.4]) {
      const start = framing({ zoom: 1.5, rotation });
      const under = photoPoint(framePhoto(landscapePhoto, story, start), story, focal.x, focal.y);
      const zoomed = zoomFraming(landscapePhoto, story, start, 1.6, focal);
      expect(zoomed.zoom).toBeCloseTo(2.4);
      const after = canvasPoint(framePhoto(landscapePhoto, story, zoomed), story, under.u, under.v);
      expect(after.x).toBeCloseTo(focal.x);
      expect(after.y).toBeCloseTo(focal.y);
    }
  });

  it('stops at the zoom limits', () => {
    const focal = { x: 540, y: 960 };
    expect(zoomFraming(landscapePhoto, story, DEFAULT_FRAMING, 0.5, focal).zoom).toBe(1);
    expect(zoomFraming(landscapePhoto, story, framing({ zoom: 3 }), 10, focal).zoom).toBe(MAX_ZOOM);
  });

  it('stays covering the canvas when zooming out near an edge', () => {
    const start = clampFraming(landscapePhoto, story, framing({ centerX: 0, centerY: 0, zoom: 3 }));
    const out = zoomFraming(landscapePhoto, story, start, 0.5, { x: 0, y: 0 });
    expect(out).toEqual(clampFraming(landscapePhoto, story, out));
  });

  it('rejects factors that are not positive', () => {
    expect(() => zoomFraming(landscapePhoto, story, DEFAULT_FRAMING, 0, { x: 0, y: 0 })).toThrow(
      RangeError,
    );
  });
});

describe('rotateFraming', () => {
  it('zooms in just enough to keep covering the canvas', () => {
    const straight = framePhoto(landscapePhoto, story, DEFAULT_FRAMING);
    const tilted = framePhoto(
      landscapePhoto,
      story,
      rotateFraming(landscapePhoto, story, DEFAULT_FRAMING, 0.2),
    );
    expect(tilted.width).toBeGreaterThan(straight.width);
    expect(coversCanvas(tilted, story)).toBe(true);
    // Just enough: a slightly smaller photo, still centered, would leave a corner empty.
    const smaller = {
      ...tilted,
      x: tilted.x * 0.99,
      y: tilted.y * 0.99,
      width: tilted.width * 0.99,
      height: tilted.height * 0.99,
    };
    expect(coversCanvas(smaller, story)).toBe(false);
  });

  it('gives back the same framing when straightened again', () => {
    const start = framing({ centerX: 0.45, centerY: 0.5, zoom: 1.3 });
    const tilted = rotateFraming(landscapePhoto, story, start, 0.3);
    expect(rotateFraming(landscapePhoto, story, tilted, 0)).toEqual(start);
  });

  it('covers with a landscape photo turned a quarter as if it were a portrait one', () => {
    const turned = framePhoto(
      landscapePhoto,
      story,
      rotateFraming(landscapePhoto, story, DEFAULT_FRAMING, Math.PI / 2),
    );
    // Turned, the photo stands 3024 × 4032: its long side runs along the 1920 px canvas height.
    expect(turned.width).toBeCloseTo(1920);
    expect(turned.height).toBeCloseTo((1920 * 3024) / 4032);
    expect(coversCanvas(turned, story)).toBe(true);
  });
});
