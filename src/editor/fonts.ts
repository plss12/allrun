import { useFonts } from '@shopify/react-native-skia';
import { useFonts as useExpoFonts } from 'expo-font';
import { useEffect } from 'react';

import { FONT_IDS, type FontId } from '@/core/template';
import { logError } from '@/ui/log';

/** Skia font family name of each bundled font. */
export const FONT_FAMILIES: Readonly<Record<FontId, string>> = {
  inter: 'Inter',
  bebasNeue: 'Bebas Neue',
  oswald: 'Oswald',
  barlowCondensed: 'Barlow Condensed',
  spaceMono: 'Space Mono',
  playfairDisplay: 'Playfair Display',
};

const FONT_FILES = {
  [FONT_FAMILIES.inter]: [
    require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
  ],
  // Bebas Neue only ships a regular weight; it is already a display font.
  [FONT_FAMILIES.bebasNeue]: [
    require('@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf'),
  ],
  [FONT_FAMILIES.oswald]: [
    require('@expo-google-fonts/oswald/400Regular/Oswald_400Regular.ttf'),
    require('@expo-google-fonts/oswald/700Bold/Oswald_700Bold.ttf'),
  ],
  [FONT_FAMILIES.barlowCondensed]: [
    require('@expo-google-fonts/barlow-condensed/400Regular/BarlowCondensed_400Regular.ttf'),
    require('@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf'),
  ],
  [FONT_FAMILIES.spaceMono]: [
    require('@expo-google-fonts/space-mono/400Regular/SpaceMono_400Regular.ttf'),
    require('@expo-google-fonts/space-mono/700Bold/SpaceMono_700Bold.ttf'),
  ],
  [FONT_FAMILIES.playfairDisplay]: [
    require('@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf'),
    require('@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf'),
  ],
};

/** Loads every bundled font into a Skia font provider; `null` while loading. */
export function useEditorFonts() {
  return useFonts(FONT_FILES);
}

/**
 * Fonts whose lowercase letters are just uppercase ones (same height and width), so uppercase
 * changes nothing. Checked against the font files' glyph metrics.
 */
const CAPS_ONLY: ReadonlySet<FontId> = new Set(['bebasNeue']);

/** Whether a font only has capital letters, so the uppercase option would do nothing. */
export function isCapsOnly(font: FontId): boolean {
  return CAPS_ONLY.has(font);
}

/** Whether a font ships a bold weight; without one, bold text would look the same. */
export function hasBold(font: FontId): boolean {
  return FONT_FILES[FONT_FAMILIES[font]].length > 1;
}

/** Family name of each font's regular weight in React Native, for the interface. */
export const PREVIEW_FAMILIES: Readonly<Record<FontId, string>> = {
  inter: 'AllRunPreview-Inter',
  bebasNeue: 'AllRunPreview-BebasNeue',
  oswald: 'AllRunPreview-Oswald',
  barlowCondensed: 'AllRunPreview-BarlowCondensed',
  spaceMono: 'AllRunPreview-SpaceMono',
  playfairDisplay: 'AllRunPreview-PlayfairDisplay',
};

/**
 * React Native family of a font in a weight: custom fonts register each weight as a family of
 * its own. Fonts without a bold weight stay regular, as on the canvas.
 */
export function previewFamily(font: FontId, bold: boolean): string {
  return bold && hasBold(font) ? `${PREVIEW_FAMILIES[font]}-Bold` : PREVIEW_FAMILIES[font];
}

const PREVIEW_FILES = Object.fromEntries(
  FONT_IDS.flatMap((font) => {
    const [regular, bold] = FONT_FILES[FONT_FAMILIES[font]];
    return [
      [previewFamily(font, false), regular],
      ...(bold === undefined ? [] : [[previewFamily(font, true), bold]]),
    ];
  }),
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
