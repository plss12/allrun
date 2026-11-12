import {
  composeMatrices,
  FILTER_PAGES,
  filteredColor,
  PHOTO_FILTERS,
  pageAfterSwipe,
  pageBeside,
  photoFilterLook,
  swipeOffset,
} from './photo-filter';

const WIDTH = 400;
const COUNT = FILTER_PAGES.length;

/** The channels of `#RRGGBB`, 0..255. */
const rgb = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

describe('photo filters', () => {
  it('start with the photo as it is, then every filter once, in the order the owner chose', () => {
    expect(FILTER_PAGES[0]).toBeNull();
    expect(FILTER_PAGES.slice(1)).toEqual([...PHOTO_FILTERS]);
    expect(PHOTO_FILTERS).toEqual([
      'chrome',
      'golden',
      'portra',
      'fade',
      'mono',
      'motionBlur',
      'zoomBlur',
    ]);
  });

  it('compose color matrices as one after the other', () => {
    const double = [2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0];
    const lift = [1, 0, 0, 0, 0.1, 0, 1, 0, 0, 0.1, 0, 0, 1, 0, 0.1, 0, 0, 0, 1, 0];
    // Lifted and then doubled: 2 · (x + 0.1).
    const composed = composeMatrices(double, lift);
    expect(composed[0]).toBe(2);
    expect(composed[4]).toBeCloseTo(0.2);
  });
});

describe('filteredColor', () => {
  it('leaves a color as it is without a filter or with a blur', () => {
    expect(filteredColor(null, '#c94a2e')).toBe('#C94A2E');
    expect(filteredColor('motionBlur', '#C94A2E')).toBe('#C94A2E');
    expect(filteredColor('zoomBlur', '#C94A2E')).toBe('#C94A2E');
  });

  it('turns any color grey in black and white', () => {
    const [r, g, b] = rgb(filteredColor('mono', '#C94A2E'));
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it('gives Chrome more contrast and color than the photo has', () => {
    const spread = (hex: string) => {
      const [r, g, b] = rgb(hex);
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    expect(spread(filteredColor('chrome', '#A0604A'))).toBeGreaterThan(spread('#A0604A'));
    expect(rgb(filteredColor('chrome', '#303030'))[0]).toBeLessThan(0x30);
    expect(rgb(filteredColor('chrome', '#D0D0D0'))[0]).toBeGreaterThan(0xd0);
  });

  it('warms the colors in Golden and Portra, and washes them out in Fade', () => {
    const grey = '#808080';
    for (const filter of ['golden', 'portra'] as const) {
      const [r, , b] = rgb(filteredColor(filter, grey));
      expect(r).toBeGreaterThan(b);
    }
    const [r, g, b] = rgb(filteredColor('fade', '#C94A2E'));
    const [r0, g0, b0] = rgb('#C94A2E');
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(
      Math.max(r0, g0, b0) - Math.min(r0, g0, b0),
    );
    // Its blacks lifted: matte.
    expect(rgb(filteredColor('fade', '#000000'))[0]).toBeGreaterThan(0);
  });

  it('gives every look a matrix, and the blurs a size', () => {
    for (const filter of PHOTO_FILTERS) {
      const look = photoFilterLook(filter);
      if (look.kind === 'matrix') {
        expect(look.matrix).toHaveLength(20);
      } else {
        expect(look.kind === 'motionBlur' ? look.length : look.strength).toBeGreaterThan(0);
      }
    }
  });
});

describe('pageBeside', () => {
  it('goes round the pages: after the last the first, before the first the last', () => {
    expect(pageBeside(2, 1, COUNT)).toBe(3);
    expect(pageBeside(COUNT - 1, 1, COUNT)).toBe(0);
    expect(pageBeside(0, -1, COUNT)).toBe(COUNT - 1);
  });
});

describe('swipeOffset', () => {
  it('follows the finger either way, never past the canvas', () => {
    expect(swipeOffset(-120, WIDTH)).toBe(-120);
    expect(swipeOffset(120, WIDTH)).toBe(120);
    expect(swipeOffset(-900, WIDTH)).toBe(-WIDTH);
  });
});

describe('pageAfterSwipe', () => {
  it('goes to the next page past half the canvas to the left, and back to the right', () => {
    expect(pageAfterSwipe(2, -201, 0, WIDTH, COUNT)).toBe(3);
    expect(pageAfterSwipe(2, 201, 0, WIDTH, COUNT)).toBe(1);
  });

  it('stays short of half the canvas, unless flung that way', () => {
    expect(pageAfterSwipe(2, -150, 0, WIDTH, COUNT)).toBe(2);
    expect(pageAfterSwipe(2, -60, -900, WIDTH, COUNT)).toBe(3);
    // Flung back the other way: the same page.
    expect(pageAfterSwipe(2, -150, 900, WIDTH, COUNT)).toBe(2);
    // A tiny way, however fast: a tap that slid.
    expect(pageAfterSwipe(2, -10, -900, WIDTH, COUNT)).toBe(2);
  });

  it('goes on round the pages past either end, never stopping', () => {
    expect(pageAfterSwipe(COUNT - 1, -300, 0, WIDTH, COUNT)).toBe(0);
    expect(pageAfterSwipe(0, 300, 0, WIDTH, COUNT)).toBe(COUNT - 1);
  });
});
