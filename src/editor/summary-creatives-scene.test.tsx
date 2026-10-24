/**
 * Draws every creative widget of a period summary off-screen with real fonts (CanvasKit), and
 * checks that nothing is drawn outside the size it measures (see `summary-blocks-scene.test.tsx`,
 * which draws its data widgets). They go on no backdrop: none offers one.
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import { isSummaryDataWidget, summaryBlocks } from '@/core/summary-block';
import { overflowingSummaryBlocks, periodData } from '@/test-utils/summary-blocks';

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

const util = jest.requireActual<{ TextDecoder: typeof TextDecoder }>('util');

let scene: typeof import('./template-scene');

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.TextDecoder = util.TextDecoder;
  (globalThis as { CanvasKit?: unknown }).CanvasKit = await CanvasKitInit({});
  scene = jest.requireActual<typeof import('./template-scene')>('./template-scene');
});

describe('prepareSummaryBlock', () => {
  it.each(['week', 'month', 'year'] as const)(
    'draws every creative widget of a %s within the size it measures',
    async (kind) => {
      const data = await periodData(kind);
      const blocks = summaryBlocks(data.summary).filter(
        (block) => !isSummaryDataWidget(block.design),
      );
      expect(blocks.length).toBeGreaterThan(0);
      const { prepared, layers, overflowing } = await overflowingSummaryBlocks(
        scene,
        data,
        blocks,
        false,
      );
      expect(prepared).toHaveLength(layers.length);
      expect(overflowing).toEqual([]);
    },
    60_000,
  );
});
