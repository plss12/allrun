/**
 * Draws a marathon's mixed widgets off-screen with real fonts (CanvasKit) slanted, in their own
 * fonts' italics and leaned in a font without one, and checks that nothing is drawn outside the
 * size they measure (see `activity-blocks-restyled-scene.test.tsx`; apart, so Jest draws both at
 * once).
 *
 * @jest-environment node
 */
import { testBlocksRestyled } from '@/test-utils/activity-blocks';
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

describe("prepareActivityBlock in the user's lettering", () => {
  testBlocksRestyled(scene, 'its own fonts slanted', null, true);
  testBlocksRestyled(scene, 'a font without an italic, leaned', 'anton', true);
});
