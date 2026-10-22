import { getSkiaExports } from '@shopify/react-native-skia/lib/commonjs/headless';

import type { FontId } from '@/core/template';
import { FONT_FAMILIES } from '@/editor/fonts';

// Node's own module, typed by hand: the app's type-check has no Node globals.
const fs = jest.requireActual<{ readFileSync(path: string): Uint8Array }>('fs');

/** Font files of each font, relative to `node_modules/@expo-google-fonts`. */
const FILES: Partial<Record<FontId, readonly string[]>> = {
  spaceMono: [
    'space-mono/400Regular/SpaceMono_400Regular.ttf',
    'space-mono/700Bold/SpaceMono_700Bold.ttf',
    'space-mono/400Regular_Italic/SpaceMono_400Regular_Italic.ttf',
    'space-mono/700Bold_Italic/SpaceMono_700Bold_Italic.ttf',
  ],
  orbitron: [
    'orbitron/400Regular/Orbitron_400Regular.ttf',
    'orbitron/700Bold/Orbitron_700Bold.ttf',
  ],
  bangers: ['bangers/400Regular/Bangers_400Regular.ttf'],
  permanentMarker: ['permanent-marker/400Regular/PermanentMarker_400Regular.ttf'],
  anton: ['anton/400Regular/Anton_400Regular.ttf'],
  unbounded: [
    'unbounded/400Regular/Unbounded_400Regular.ttf',
    'unbounded/900Black/Unbounded_900Black.ttf',
  ],
  bigShoulders: [
    'big-shoulders-display/BigShouldersDisplay_100Thin.ttf',
    'big-shoulders-display/BigShouldersDisplay_700Bold.ttf',
  ],
  bowlbyOneSC: ['bowlby-one-sc/400Regular/BowlbyOneSC_400Regular.ttf'],
  rubikGlitch: ['rubik-glitch/400Regular/RubikGlitch_400Regular.ttf'],
  graduate: ['graduate/400Regular/Graduate_400Regular.ttf'],
  sacramento: ['sacramento/400Regular/Sacramento_400Regular.ttf'],
  doto: ['doto/700Bold/Doto_700Bold.ttf', 'doto/900Black/Doto_900Black.ttf'],
  inter: [
    'inter/400Regular/Inter_400Regular.ttf',
    'inter/700Bold/Inter_700Bold.ttf',
    'inter/400Regular_Italic/Inter_400Regular_Italic.ttf',
    'inter/700Bold_Italic/Inter_700Bold_Italic.ttf',
    'inter/200ExtraLight/Inter_200ExtraLight.ttf',
  ],
  barlowCondensed: [
    'barlow-condensed/400Regular/BarlowCondensed_400Regular.ttf',
    'barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf',
    'barlow-condensed/400Regular_Italic/BarlowCondensed_400Regular_Italic.ttf',
    'barlow-condensed/700Bold_Italic/BarlowCondensed_700Bold_Italic.ttf',
  ],
  playfairDisplay: [
    'playfair-display/400Regular/PlayfairDisplay_400Regular.ttf',
    'playfair-display/700Bold/PlayfairDisplay_700Bold.ttf',
    'playfair-display/400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf',
    'playfair-display/700Bold_Italic/PlayfairDisplay_700Bold_Italic.ttf',
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
