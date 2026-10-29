import {
  addFavorite,
  BRAND_SWATCHES,
  COLOR_GRID,
  GRID_COLUMNS,
  GRID_SHADES,
  hslToHex,
  MAX_FAVORITES,
  parseFavorites,
  removeFavorite,
  splitOpacity,
  withOpacity,
} from './color-menu';
import { relativeLuminance } from './layer-style';

describe('hslToHex', () => {
  it('converts the primaries, the grays and a known color', () => {
    expect(hslToHex(0, 1, 0.5)).toBe('#FF0000');
    expect(hslToHex(120, 1, 0.5)).toBe('#00FF00');
    expect(hslToHex(240, 1, 0.5)).toBe('#0000FF');
    expect(hslToHex(0, 0, 0)).toBe('#000000');
    expect(hslToHex(0, 0, 1)).toBe('#FFFFFF');
    expect(hslToHex(210, 0.5, 0.4)).toBe('#336699');
  });
});

describe('COLOR_GRID', () => {
  it('has a row of grays over a row per shade, each as wide as the hues', () => {
    expect(COLOR_GRID).toHaveLength(GRID_SHADES + 1);
    for (const row of COLOR_GRID) {
      expect(row).toHaveLength(GRID_COLUMNS);
    }
  });

  it('goes from white to black in the grays', () => {
    const grays = COLOR_GRID[0];
    expect(grays[0].hex).toBe('#FFFFFF');
    expect(grays[GRID_COLUMNS - 1].hex).toBe('#000000');
    for (let i = 1; i < grays.length; i++) {
      expect(relativeLuminance(grays[i].hex)).toBeLessThan(relativeLuminance(grays[i - 1].hex));
    }
  });

  it('lightens each hue row by row, and repeats no color', () => {
    for (let column = 0; column < GRID_COLUMNS; column++) {
      for (let row = 2; row < COLOR_GRID.length; row++) {
        expect(relativeLuminance(COLOR_GRID[row][column].hex)).toBeGreaterThan(
          relativeLuminance(COLOR_GRID[row - 1][column].hex),
        );
      }
    }
    const all = COLOR_GRID.flat().map((color) => color.hex);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('splitOpacity and withOpacity', () => {
  it('reads the alpha of a color, in capitals', () => {
    expect(splitOpacity('#c94a2e')).toEqual({ hex: '#C94A2E', opacity: 1 });
    expect(splitOpacity('#000000FF')).toEqual({ hex: '#000000', opacity: 1 });
    expect(splitOpacity('#FFFFFF80').opacity).toBeCloseTo(128 / 255);
  });

  it('writes an alpha only when there is one', () => {
    expect(withOpacity('#c94a2e', 1)).toBe('#C94A2E');
    expect(withOpacity('#FFFFFF', 0.5)).toBe('#FFFFFF80');
    expect(splitOpacity(withOpacity('#123456', 0.3)).opacity).toBeCloseTo(0.3, 2);
  });

  it('throws for what is not a color, or an opacity out of range', () => {
    expect(() => splitOpacity('red')).toThrow();
    expect(() => withOpacity('#FFFFFF80', 0.5)).toThrow();
    expect(() => withOpacity('#FFFFFF', 1.5)).toThrow();
  });
});

describe('favorites', () => {
  it('keeps the newest first, once, in capitals', () => {
    let favorites: readonly string[] = [];
    favorites = addFavorite(favorites, '#ff0000');
    favorites = addFavorite(favorites, '#00FF00');
    favorites = addFavorite(favorites, '#FF0000');
    expect(favorites).toEqual(['#FF0000', '#00FF00']);
  });

  it('keeps no opacity, and no brand color', () => {
    expect(addFavorite([], '#FF000080')).toEqual(['#FF0000']);
    const favorites = ['#00FF00'];
    expect(addFavorite(favorites, BRAND_SWATCHES[0])).toBe(favorites);
  });

  it('drops the oldest past the limit', () => {
    let favorites: readonly string[] = [];
    for (let i = 0; i <= MAX_FAVORITES; i++) {
      favorites = addFavorite(favorites, `#0000${i.toString(16).padStart(2, '0')}`);
    }
    expect(favorites).toHaveLength(MAX_FAVORITES);
    expect(favorites[0]).toBe(`#0000${MAX_FAVORITES.toString(16).padStart(2, '0').toUpperCase()}`);
    expect(favorites).not.toContain('#000000');
  });

  it('removes one', () => {
    expect(removeFavorite(['#FF0000', '#00FF00'], '#ff0000')).toEqual(['#00FF00']);
    const favorites = ['#00FF00'];
    expect(removeFavorite(favorites, '#0000FF')).toBe(favorites);
  });

  it('reads a stored list, cleaning it up', () => {
    expect(parseFavorites(['#ff0000', '#00FF00', '#FF0000', BRAND_SWATCHES[1]])).toEqual([
      '#FF0000',
      '#00FF00',
    ]);
    expect(() => parseFavorites(['red'])).toThrow();
    expect(() => parseFavorites({ colors: [] })).toThrow();
  });
});
