import { useImage } from '@shopify/react-native-skia';

import type { BrandLogos } from './template-scene';

/**
 * Loads the AllRun watermarks (horizontal lockup with the reduced monogram), generated from the
 * brand geometry by `npm run brand`.
 */
export function useBrandLogos(): BrandLogos {
  return {
    light: useImage(require('../../assets/brand/watermark-light.png')),
    dark: useImage(require('../../assets/brand/watermark-dark.png')),
    color: useImage(require('../../assets/brand/watermark-color.png')),
  };
}
