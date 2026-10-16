import { BRAND_GEOMETRY } from './geometry.generated';
import { WATERMARK_WIDTH, watermarkLayout } from './watermark-layout';

const { mark, wordmark } = BRAND_GEOMETRY;

describe('watermarkLayout', () => {
  it('keeps the proportions of the name', () => {
    const layout = watermarkLayout('wordmark');
    expect(layout.width).toBe(WATERMARK_WIDTH.wordmark);
    expect(layout.width / layout.height).toBeCloseTo(wordmark.width / wordmark.height);
    expect(layout.mark).toBeNull();
  });

  it('keeps the proportions of the monogram', () => {
    const layout = watermarkLayout('mark');
    expect(layout.width / layout.height).toBeCloseTo(mark.width / mark.height);
    expect(layout.wordmark).toBeNull();
  });

  it('puts the name to the right of the monogram, centered and inside the box', () => {
    const layout = watermarkLayout('lockup');
    const markPlacement = layout.mark;
    const wordPlacement = layout.wordmark;
    if (markPlacement === null || wordPlacement === null) {
      throw new Error('The lockup has both parts');
    }
    const markRight = mark.width * markPlacement.scale;
    const wordHeight = wordmark.height * wordPlacement.scale;
    expect(wordPlacement.x).toBeGreaterThan(markRight);
    expect(wordPlacement.x + wordmark.width * wordPlacement.scale).toBeCloseTo(layout.width);
    expect(wordPlacement.y + wordHeight / 2).toBeCloseTo(layout.height / 2);
    expect(wordHeight / layout.height).toBeCloseTo(0.42);
  });
});
