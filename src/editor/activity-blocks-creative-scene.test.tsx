/**
 * Draws a marathon's creative widgets (replicas of apps and things, phrases) off-screen with real
 * fonts (CanvasKit), each in its own, and checks that nothing is drawn outside the size it
 * measures (see `activity-blocks-scene.test.tsx`; apart, so Jest draws both at once).
 *
 * @jest-environment node
 */
import { RUN, testBlocksInTheirFonts } from '@/test-utils/activity-blocks';
import { loadSceneBeforeAll } from '@/test-utils/scene';

// Draw with CanvasKit instead of the native module (see `template-scene.test.tsx`).
jest.mock('@shopify/react-native-skia/lib/commonjs/Platform', () => ({
  Platform: { OS: 'web', PixelRatio: 1 },
}));
jest.mock('@shopify/react-native-skia', () => {
  const headless = jest.requireActual('@shopify/react-native-skia/lib/commonjs/headless');
  const Skia = new Proxy(
    {},
    { get: (_target, key) => Reflect.get(headless.getSkiaExports().Skia, key) },
  );
  return { ...headless, Skia };
});

const scene = loadSceneBeforeAll();

describe('prepareActivityBlock', () => {
  testBlocksInTheirFonts(scene, 'a marathon', RUN, 'creative');
});
