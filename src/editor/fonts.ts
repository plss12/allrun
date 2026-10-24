import { useFonts } from '@shopify/react-native-skia';
import { useFonts as useExpoFonts } from 'expo-font';
import { useEffect } from 'react';

import { FONT_IDS, type FontId } from '@/core/template';
import { logError } from '@/ui/log';

/** Skia font family name of each bundled font. */
export const FONT_FAMILIES: Readonly<Record<FontId, string>> = {
  inter: 'Inter',
  barlowCondensed: 'Barlow Condensed',
  playfairDisplay: 'Playfair Display',
  spaceMono: 'Space Mono',
  orbitron: 'Orbitron',
  bangers: 'Bangers',
  permanentMarker: 'Permanent Marker',
  anton: 'Anton',
  unbounded: 'Unbounded',
  bigShoulders: 'Big Shoulders Display',
  bowlbyOneSC: 'Bowlby One SC',
  rubikGlitch: 'Rubik Glitch',
  graduate: 'Graduate',
  sacramento: 'Sacramento',
  doto: 'Doto',
};

/**
 * How tall each font's capitals are, as a share of its size: the `sCapHeight` of its OS/2 table
 * over its units per em, the same in every face it ships. A big datum is cut to it, so the data
 * under it sit as close as they look (Skia measures a line by its ascent, well above a capital).
 */
export const CAP_HEIGHTS: Readonly<Record<FontId, number>> = {
  inter: 0.7275,
  barlowCondensed: 0.7,
  playfairDisplay: 0.708,
  spaceMono: 0.7,
  orbitron: 0.72,
  bangers: 0.721,
  permanentMarker: 0.7402,
  anton: 0.8594,
  unbounded: 0.75,
  bigShoulders: 0.8,
  bowlbyOneSC: 0.7422,
  rubikGlitch: 0.7,
  graduate: 0.75,
  sacramento: 0.7568,
  doto: 0.7,
};

/**
 * How a font's small letters reach past its capitals, as shares of its size: how high the tallest
 * rise without marks (an ascender, "k", or a figure: `plain`) and with them (an accent, a dot, a
 * tilde: "é", "i", "ñ": `marked`), and how far the lowest go under the baseline ("p": `descent`).
 * Measured on the outlines of every face the font ships (CanvasKit's glyph bounds, rounded up to
 * a 64th of its size): a small capitals' font (Bowlby One SC) has no descent, and Sacramento's
 * accents sit lower than its ascenders.
 */
const SMALL_LETTERS: Readonly<
  Record<FontId, { readonly plain: number; readonly marked: number; readonly descent: number }>
> = {
  inter: { plain: 0.7656, marked: 0.7813, descent: 0.2188 },
  barlowCondensed: { plain: 0.7188, marked: 0.7344, descent: 0.2188 },
  playfairDisplay: { plain: 0.7969, marked: 0.8438, descent: 0.2031 },
  spaceMono: { plain: 0.7188, marked: 0.75, descent: 0.2031 },
  orbitron: { plain: 0.7813, marked: 0.8594, descent: 0.2344 },
  bangers: { plain: 0.7656, marked: 1.1094, descent: 0.0625 },
  permanentMarker: { plain: 0.7656, marked: 0.9688, descent: 0.0625 },
  anton: { plain: 0.875, marked: 0.9844, descent: 0.1406 },
  unbounded: { plain: 0.7969, marked: 0.8594, descent: 0.1875 },
  bigShoulders: { plain: 0.8125, marked: 0.8125, descent: 0.2188 },
  bowlbyOneSC: { plain: 0.7656, marked: 0.9531, descent: 0 },
  rubikGlitch: { plain: 0.75, marked: 0.7813, descent: 0.2344 },
  graduate: { plain: 0.75, marked: 0.8281, descent: 0.1094 },
  sacramento: { plain: 0.75, marked: 0.75, descent: 0.5313 },
  doto: { plain: 0.7031, marked: 0.7969, descent: 0.2031 },
};

/** A capital with a mark over it ("É" split into "E" and its accent). */
const MARKED_CAPITAL = /\p{Lu}\p{M}/u;
/** A small letter with a mark over it, split off, or with a dot. */
const MARKED_SMALL = /\p{Ll}\p{M}|[ij]/u;
const SMALL = /\p{Ll}/u;
/** Small letters that go under the baseline. */
const DESCENDERS = /[gjpqyç]/u;

/**
 * How high `text`'s letters rise over its baseline in `font`, and how far its small letters go
 * under it, as shares of its size, to cut a line to its letters: to its capitals' height (see
 * `CAP_HEIGHTS`), or to its small letters' when it has any; `top` is `null` when an accent rises
 * over a capital ("MIÉRCOLES"), whose line keeps its own room above. `text` is as written, in
 * capitals if it is to be. Time O(n) for its n characters.
 */
export function lettersExtent(
  text: string,
  font: FontId,
): { readonly top: number | null; readonly descent: number } {
  const split = text.normalize('NFD');
  const small = SMALL_LETTERS[font];
  const descent = DESCENDERS.test(split) ? small.descent : 0;
  if (MARKED_CAPITAL.test(split)) {
    return { top: null, descent };
  }
  const top = MARKED_SMALL.test(split)
    ? Math.max(small.plain, small.marked)
    : SMALL.test(split)
      ? small.plain
      : 0;
  return { top: Math.max(CAP_HEIGHTS[font], top), descent };
}

/**
 * A font's files: its regular face, and its bold and italics when it ships them; and a light face
 * for the replicas of apps that write thin (an alarm's time), not offered to the user.
 */
interface FontFaces {
  readonly regular: number;
  readonly bold?: number;
  readonly italic?: number;
  readonly boldItalic?: number;
  readonly light?: number;
}

// Fonts with a single weight are display fonts that are already heavy (or, for the marker,
// hand-drawn), so they have no bold. Fonts without an italic are slanted by Skia instead.
const FONT_FACES: Readonly<Record<FontId, FontFaces>> = {
  inter: {
    regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
    italic: require('@expo-google-fonts/inter/400Regular_Italic/Inter_400Regular_Italic.ttf'),
    boldItalic: require('@expo-google-fonts/inter/700Bold_Italic/Inter_700Bold_Italic.ttf'),
    light: require('@expo-google-fonts/inter/200ExtraLight/Inter_200ExtraLight.ttf'),
  },
  barlowCondensed: {
    regular: require('@expo-google-fonts/barlow-condensed/400Regular/BarlowCondensed_400Regular.ttf'),
    bold: require('@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf'),
    italic: require('@expo-google-fonts/barlow-condensed/400Regular_Italic/BarlowCondensed_400Regular_Italic.ttf'),
    boldItalic: require('@expo-google-fonts/barlow-condensed/700Bold_Italic/BarlowCondensed_700Bold_Italic.ttf'),
  },
  playfairDisplay: {
    regular: require('@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf'),
    bold: require('@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf'),
    italic: require('@expo-google-fonts/playfair-display/400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf'),
    boldItalic: require('@expo-google-fonts/playfair-display/700Bold_Italic/PlayfairDisplay_700Bold_Italic.ttf'),
  },
  spaceMono: {
    regular: require('@expo-google-fonts/space-mono/400Regular/SpaceMono_400Regular.ttf'),
    bold: require('@expo-google-fonts/space-mono/700Bold/SpaceMono_700Bold.ttf'),
    italic: require('@expo-google-fonts/space-mono/400Regular_Italic/SpaceMono_400Regular_Italic.ttf'),
    boldItalic: require('@expo-google-fonts/space-mono/700Bold_Italic/SpaceMono_700Bold_Italic.ttf'),
  },
  orbitron: {
    regular: require('@expo-google-fonts/orbitron/400Regular/Orbitron_400Regular.ttf'),
    bold: require('@expo-google-fonts/orbitron/700Bold/Orbitron_700Bold.ttf'),
  },
  bangers: { regular: require('@expo-google-fonts/bangers/400Regular/Bangers_400Regular.ttf') },
  permanentMarker: {
    regular: require('@expo-google-fonts/permanent-marker/400Regular/PermanentMarker_400Regular.ttf'),
  },
  anton: { regular: require('@expo-google-fonts/anton/400Regular/Anton_400Regular.ttf') },
  // Its bold is the black weight, the very wide and heavy one of AURA's widgets.
  unbounded: {
    regular: require('@expo-google-fonts/unbounded/400Regular/Unbounded_400Regular.ttf'),
    bold: require('@expo-google-fonts/unbounded/900Black/Unbounded_900Black.ttf'),
  },
  // Tall and thin: its regular is the thin weight, which is what it is for.
  bigShoulders: {
    regular: require('@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_100Thin.ttf'),
    bold: require('@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_700Bold.ttf'),
  },
  bowlbyOneSC: {
    regular: require('@expo-google-fonts/bowlby-one-sc/400Regular/BowlbyOneSC_400Regular.ttf'),
  },
  rubikGlitch: {
    regular: require('@expo-google-fonts/rubik-glitch/400Regular/RubikGlitch_400Regular.ttf'),
  },
  graduate: { regular: require('@expo-google-fonts/graduate/400Regular/Graduate_400Regular.ttf') },
  sacramento: {
    regular: require('@expo-google-fonts/sacramento/400Regular/Sacramento_400Regular.ttf'),
  },
  // A scoreboard's dot matrix: its thinner weights have dots too small to read on a photo.
  doto: {
    regular: require('@expo-google-fonts/doto/700Bold/Doto_700Bold.ttf'),
    bold: require('@expo-google-fonts/doto/900Black/Doto_900Black.ttf'),
  },
};

/** Every face of each family, for Skia, which picks the one a text's weight and slant ask for. */
const FONT_FILES = Object.fromEntries(
  FONT_IDS.map((font) => [FONT_FAMILIES[font], Object.values(FONT_FACES[font])]),
);

/** Loads every bundled font into a Skia font provider; `null` while loading. */
export function useEditorFonts() {
  return useFonts(FONT_FILES);
}

/**
 * Fonts whose lowercase letters are just uppercase ones (same height and width), so uppercase
 * changes nothing. Checked against the font files' glyph metrics.
 */
const CAPS_ONLY: ReadonlySet<FontId> = new Set(['bangers']);

/** Whether a font only has capital letters, so the uppercase option would do nothing. */
export function isCapsOnly(font: FontId): boolean {
  return CAPS_ONLY.has(font);
}

/** Whether a font ships a bold weight; without one, bold text would look the same. */
export function hasBold(font: FontId): boolean {
  return FONT_FACES[font].bold !== undefined;
}

/**
 * Whether a text asked to be `bold` is drawn in its font's bold face: only when the font ships
 * one. Asked for a weight it lacks, Skia thickens the regular face itself (a fake bold), and the
 * panel turns bold off for those fonts, but a design made bold in another font keeps it on.
 */
export function drawsBold(font: FontId, bold: boolean): boolean {
  return bold && hasBold(font);
}

/**
 * Whether a font ships its own italic. Those without one are still slanted on the canvas: Skia
 * leans their letters.
 */
export function hasItalic(font: FontId): boolean {
  return FONT_FACES[font].italic !== undefined;
}

/** Family name of each font's regular weight in React Native, for the interface. */
export const PREVIEW_FAMILIES: Readonly<Record<FontId, string>> = {
  inter: 'AllRunPreview-Inter',
  barlowCondensed: 'AllRunPreview-BarlowCondensed',
  playfairDisplay: 'AllRunPreview-PlayfairDisplay',
  spaceMono: 'AllRunPreview-SpaceMono',
  orbitron: 'AllRunPreview-Orbitron',
  bangers: 'AllRunPreview-Bangers',
  permanentMarker: 'AllRunPreview-PermanentMarker',
  anton: 'AllRunPreview-Anton',
  unbounded: 'AllRunPreview-Unbounded',
  bigShoulders: 'AllRunPreview-BigShoulders',
  bowlbyOneSC: 'AllRunPreview-BowlbyOneSC',
  rubikGlitch: 'AllRunPreview-RubikGlitch',
  graduate: 'AllRunPreview-Graduate',
  sacramento: 'AllRunPreview-Sacramento',
  doto: 'AllRunPreview-Doto',
};

/** The faces the interface writes with; the light one is only drawn on the canvas. */
const FACES = ['regular', 'bold', 'italic', 'boldItalic'] as const;

/** What each face adds to its font's family name in React Native. */
const FACE_SUFFIXES: Readonly<Record<(typeof FACES)[number], string>> = {
  regular: '',
  bold: '-Bold',
  italic: '-Italic',
  boldItalic: '-BoldItalic',
};

/**
 * React Native family of a font in a weight and slant: custom fonts register each face as a
 * family of its own. Fonts without a bold weight stay regular, as on the canvas; those without an
 * italic stay upright (the text being typed leans them itself, see `hasItalic`).
 */
export function previewFamily(font: FontId, bold: boolean, italic = false): string {
  const faces = FONT_FACES[font];
  const face: (typeof FACES)[number] =
    bold && faces.bold !== undefined
      ? italic && faces.boldItalic !== undefined
        ? 'boldItalic'
        : 'bold'
      : italic && faces.italic !== undefined
        ? 'italic'
        : 'regular';
  return `${PREVIEW_FAMILIES[font]}${FACE_SUFFIXES[face]}`;
}

const PREVIEW_FILES = Object.fromEntries(
  FONT_IDS.flatMap((font) =>
    FACES.flatMap((face) => {
      const file = FONT_FACES[font][face];
      return file === undefined ? [] : [[`${PREVIEW_FAMILIES[font]}${FACE_SUFFIXES[face]}`, file]];
    }),
  ),
);

/**
 * Loads every bundled font for React Native text (the canvas draws with Skia's own copy): the
 * style panel shows each font's name in that font, and a text being typed shows in its font.
 * Until they load, or if they fail, text shows in the system font.
 */
export function usePreviewFonts(): boolean {
  const [loaded, error] = useExpoFonts(PREVIEW_FILES);
  useEffect(() => {
    if (error !== null) {
      logError('Could not load the font previews', error);
    }
  }, [error]);
  return loaded;
}
