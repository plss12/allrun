import { z } from 'zod';

/**
 * The color menu (ADR 009): one place to choose a color, for a widget or the design's
 * background. A grid of colors, as AURA lays it out (no spectrum, no sliders for the color
 * itself): grays from white to black on top, then twelve hues in nine shades, dark to light. Under
 * it, the opacity, and a row of favorites: the brand's colors, always there, and the ones the
 * user keeps.
 */

/** The grid's hues, column by column, as their angle on the color wheel (degrees). */
export const GRID_HUES = [
  { id: 'teal', hue: 195 },
  { id: 'blue', hue: 215 },
  { id: 'indigo', hue: 235 },
  { id: 'purple', hue: 265 },
  { id: 'magenta', hue: 300 },
  { id: 'pink', hue: 335 },
  { id: 'red', hue: 2 },
  { id: 'orange', hue: 20 },
  { id: 'amber', hue: 38 },
  { id: 'yellow', hue: 52 },
  { id: 'lime', hue: 68 },
  { id: 'green', hue: 100 },
] as const;

export type GridHue = (typeof GRID_HUES)[number]['id'];

/** The lightness of each row of hues, dark to light (HSL, 0..1). */
const SHADE_LIGHTNESS = [0.16, 0.24, 0.32, 0.41, 0.5, 0.6, 0.7, 0.8, 0.9] as const;
/** How vivid the hues are (HSL saturation): strong, without the glare of a full 1. */
const SATURATION = 0.85;

/** How many columns the grid has (its grays and its hues), and how many shades each hue. */
export const GRID_COLUMNS = GRID_HUES.length;
export const GRID_SHADES = SHADE_LIGHTNESS.length;

/** A color of the grid, with what a screen reader says of it. */
export type GridColor =
  | {
      readonly hex: string;
      readonly kind: 'gray';
      /** From 0, white, to `GRID_COLUMNS - 1`, black. */
      readonly step: number;
    }
  | {
      readonly hex: string;
      readonly kind: 'hue';
      readonly hue: GridHue;
      /** From 1, the darkest, to `GRID_SHADES`, the lightest. */
      readonly shade: number;
    };

function channelHex(value: number): string {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

/**
 * The `#RRGGBB` of a pixel's red, green and blue (0..255 each), as the eyedropper reads it. Time
 * and space O(1).
 */
export function rgbToHex(red: number, green: number, blue: number): string {
  return `#${channelHex(red / 255)}${channelHex(green / 255)}${channelHex(blue / 255)}`;
}

/**
 * The `#RRGGBB` of an HSL color: `hue` in degrees, `saturation` and `lightness` in 0..1. The
 * standard conversion (CSS Color 4, "HSL to RGB": https://www.w3.org/TR/css-color-4/#hsl-to-rgb).
 * Time and space O(1).
 */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${channelHex(channel(0))}${channelHex(channel(8))}${channelHex(channel(4))}`;
}

/**
 * The grid, row by row: the grays first, from white to black, then the hues from their darkest
 * shade to their lightest. `GRID_SHADES + 1` rows of `GRID_COLUMNS` colors.
 */
export const COLOR_GRID: readonly (readonly GridColor[])[] = [
  Array.from({ length: GRID_COLUMNS }, (_, step): GridColor => {
    const value = channelHex(1 - step / (GRID_COLUMNS - 1));
    return { hex: `#${value}${value}${value}`, kind: 'gray', step };
  }),
  ...SHADE_LIGHTNESS.map((lightness, row) =>
    GRID_HUES.map(({ id, hue }): GridColor => ({
      hex: hslToHex(hue, SATURATION, lightness),
      kind: 'hue',
      hue: id,
      shade: row + 1,
    })),
  ),
];

/**
 * The brand's colors (Track Red, Night Ink, Chalk), always first among the favorites: the user
 * neither adds nor removes them.
 */
export const BRAND_SWATCHES = ['#C94A2E', '#141B2D', '#F6F1EA'] as const;

/** The faintest a widget or a background can be made: it never fades out entirely. */
export const MIN_OPACITY = 0.1;

const HEX = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/;

/**
 * A `#RRGGBB` or `#RRGGBBAA` color split into its `#RRGGBB` (in capitals) and its opacity, 0..1
 * (1 without an alpha). Time and space O(1).
 *
 * @throws Error for anything that is not such a color.
 */
export function splitOpacity(color: string): { readonly hex: string; readonly opacity: number } {
  const match = HEX.exec(color);
  if (match === null) {
    throw new Error(`Not a #RRGGBB(AA) color: ${color}`);
  }
  return {
    hex: `#${match[1].toUpperCase()}`,
    opacity: match[2] === undefined ? 1 : parseInt(match[2], 16) / 255,
  };
}

/**
 * `hex` (`#RRGGBB`) at `opacity`: itself when opaque, else with its alpha as `#RRGGBBAA`, in
 * capitals. Time and space O(1).
 *
 * @throws Error for anything that is not a `#RRGGBB` color, or an opacity outside 0..1.
 */
export function withOpacity(hex: string, opacity: number): string {
  const { hex: color, opacity: own } = splitOpacity(hex);
  if (own !== 1 || !(opacity >= 0 && opacity <= 1)) {
    throw new Error(`Expected a #RRGGBB color and an opacity in 0..1, got ${hex}, ${opacity}`);
  }
  return opacity === 1 ? color : `${color}${channelHex(opacity)}`;
}

/** How many colors the user can keep among the favorites, besides the brand's. */
export const MAX_FAVORITES = 16;

/**
 * The user's favorite colors as stored: `#RRGGBB`s, newest first. What a damaged or older file
 * holds beyond that is dropped by {@link parseFavorites}.
 */
const favoritesSchema = z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/));

/**
 * Keeps `hex` among the favorites, first: once, in capitals, never a brand color (those are
 * always there), and no more than `MAX_FAVORITES`, the oldest going. `favorites` itself when it
 * is already the first or a brand color. Time and space O(n).
 */
export function addFavorite(favorites: readonly string[], hex: string): readonly string[] {
  const color = splitOpacity(hex).hex;
  if (favorites[0] === color || (BRAND_SWATCHES as readonly string[]).includes(color)) {
    return favorites;
  }
  return [color, ...favorites.filter((kept) => kept !== color)].slice(0, MAX_FAVORITES);
}

/** The favorites without `hex`; `favorites` itself when it isn't one. Time and space O(n). */
export function removeFavorite(favorites: readonly string[], hex: string): readonly string[] {
  const color = splitOpacity(hex).hex;
  return favorites.includes(color) ? favorites.filter((kept) => kept !== color) : favorites;
}

/**
 * The favorites a file held, validated: `#RRGGBB`s in capitals, each once, no brand color, at
 * most `MAX_FAVORITES`. Time and space O(n).
 *
 * @throws ZodError when it isn't a list of such colors.
 */
export function parseFavorites(json: unknown): readonly string[] {
  return favoritesSchema
    .parse(json)
    .reduceRight<readonly string[]>((kept, color) => addFavorite(kept, color), []);
}
