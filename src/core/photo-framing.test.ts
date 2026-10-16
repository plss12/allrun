import { DEFAULT_FRAMING, framePhoto } from './photo-framing';

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
