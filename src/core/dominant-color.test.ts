import { dominantColor } from './dominant-color';

type Rgba = readonly [number, number, number, number];

/** `count` pixels of each color, one after another. */
function pixelsOf(...groups: readonly (readonly [Rgba, number])[]): Uint8Array {
  const pixels: number[] = [];
  for (const [color, count] of groups) {
    for (let i = 0; i < count; i++) {
      pixels.push(...color);
    }
  }
  return Uint8Array.from(pixels);
}

const SKY: Rgba = [70, 130, 200, 255];
const SAND: Rgba = [220, 190, 140, 255];
const RED: Rgba = [230, 30, 30, 255];

describe('dominantColor', () => {
  it('is the color itself for a plain image', () => {
    expect(dominantColor(pixelsOf([SKY, 100]))).toBe('#4682C8');
  });

  it('is the color of the largest group, not the average of all', () => {
    // Two thirds of sky and a third of sand: the average would be a grey neither has.
    expect(dominantColor(pixelsOf([SKY, 200], [SAND, 100]))).toBe('#4682C8');
    expect(dominantColor(pixelsOf([SKY, 100], [SAND, 300]))).toBe('#DCBE8C');
  });

  it('groups close shades together, and they beat a larger single color', () => {
    // Many slightly different greens, each fewer than the reds, but more than them together.
    const greens = Array.from(
      { length: 12 },
      (_, i) => [[40 + i * 2, 140 + i, 60, 255] as const, 40] as const,
    );
    const color = dominantColor(pixelsOf([RED, 200], ...greens));
    expect(color).not.toBe('#E61E1E');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color?.slice(i, i + 2) ?? '', 16));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('ignores see-through pixels, and has no color without opaque ones', () => {
    expect(dominantColor(pixelsOf([[0, 0, 0, 0], 500], [SAND, 10]))).toBe('#DCBE8C');
    expect(dominantColor(pixelsOf([[255, 255, 255, 20], 50]))).toBeNull();
    expect(dominantColor(new Uint8Array(0))).toBeNull();
  });

  it('rejects bytes that are not whole RGBA pixels', () => {
    expect(() => dominantColor(new Uint8Array(6))).toThrow(RangeError);
  });
});
