import { useFonts } from '@shopify/react-native-skia';

import type { FontId } from '@/core/template';

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
