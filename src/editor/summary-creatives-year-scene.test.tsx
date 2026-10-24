/**
 * Draws every creative widget of a year summary off-screen with real fonts (CanvasKit) and checks that
 * nothing is drawn outside the size it measures (see `testSummaryWidgets`); one period a file,
 * so Jest draws them at once. The data widgets: `summary-blocks-scene.test.tsx`.
 *
 * @jest-environment node
 */
import { loadSceneBeforeAll } from '@/test-utils/scene';
import { testSummaryWidgets } from '@/test-utils/summary-blocks';

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

describe('prepareSummaryBlock', () => {
  testSummaryWidgets(scene, 'year', 'creative');
});
