import { getSkiaExports } from '@shopify/react-native-skia/lib/commonjs/headless';

import type { FontId } from '@/core/template';
import { FONT_FAMILIES } from '@/editor/fonts';

// Node's own module, typed by hand: the app's type-check has no Node globals.
const fs = jest.requireActual<{ readFileSync(path: string): Uint8Array }>('fs');

/** Font files of each font, relative to `node_modules/@expo-google-fonts`. */
const FILES: Partial<Record<FontId, readonly string[]>> = {
  inter: ['inter/400Regular/Inter_400Regular.ttf', 'inter/700Bold/Inter_700Bold.ttf'],
  barlowCondensed: [
    'barlow-condensed/400Regular/BarlowCondensed_400Regular.ttf',
    'barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf',
  ],
  archivoBlack: ['archivo-black/400Regular/ArchivoBlack_400Regular.ttf'],
  playfairDisplay: [
    'playfair-display/400Regular/PlayfairDisplay_400Regular.ttf',
    'playfair-display/700Bold/PlayfairDisplay_700Bold.ttf',
  ],
};

/**
 * A Skia font provider with the given fonts, in every weight they ship, for tests that draw or
 * measure with CanvasKit (load it first; see `editor/template-scene.test.tsx`).
 */
export function loadTestFonts(fonts: readonly FontId[]) {
  const { Skia } = getSkiaExports();
  const provider = Skia.TypefaceFontProvider.Make();
  for (const font of fonts) {
    const files = FILES[font];
    if (files === undefined) {
      throw new Error(`No font files listed for ${font}`);
    }
    for (const file of files) {
      const path = `node_modules/@expo-google-fonts/${file}`;
      const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(
        Skia.Data.fromBytes(new Uint8Array(fs.readFileSync(path))),
      );
      if (typeface === null) {
        throw new Error(`Could not load ${path}`);
      }
      provider.registerFont(typeface, FONT_FAMILIES[font]);
    }
  }
  return provider;
}
