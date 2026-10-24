/**
 * Draws every data widget of a period summary off-screen with real fonts (CanvasKit), in its own
 * lettering and on a backdrop, and checks that nothing is drawn outside the size it measures: the
 * editor grabs, frames and snaps a widget by that size. Its creative ones are drawn in
 * `summary-creatives-scene.test.tsx`.
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import { weekRange } from '@/core/dates';
import { newLayer } from '@/core/default-layout';
import { summarize } from '@/core/summary';
import { isSummaryDataWidget, summaryBlocks } from '@/core/summary-block';
import { translate } from '@/test-utils/activity-blocks';
import { alphaOutside, DRAWN_ALPHA } from '@/test-utils/skia-bounds';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { overflowingSummaryBlocks, periodData } from '@/test-utils/summary-blocks';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import type { SummaryData } from './editor-data';

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
    'draws every data widget of a %s within the size it measures, bare and on a backdrop',
    async (kind) => {
      const data = await periodData(kind);
      const blocks = summaryBlocks(data.summary).filter((block) =>
        isSummaryDataWidget(block.design),
      );
      // A period of every sport offers them all.
      expect(blocks.map((block) => block.design)).toEqual(
        expect.arrayContaining(['periodData', 'periodTable', 'periodSports']),
      );
      const { prepared, layers, overflowing } = await overflowingSummaryBlocks(
        scene,
        data,
        blocks,
        true,
      );
      expect(prepared).toHaveLength(layers.length);
      expect(overflowing).toEqual([]);
    },
    60_000,
  );

  it("draws a period without routes with its sport's icon over its totals", async () => {
    const week = await periodData('week');
    const gym = week.activities.map((activity) => ({ ...activity, routePolyline: null }));
    const data: SummaryData = {
      ...week,
      summary: summarize(gym, week.summary.range),
      activities: gym,
    };
    const layer = newLayer(
      { kind: 'summaryBlock', block: { design: 'periodRoutes', layout: 'overlay' } },
      'block',
      'story',
    );
    const [prepared] = scene.prepareLayers(
      { version: 1, id: 'blocks', mode: 'summary', format: 'story', layers: [layer] },
      {
        data,
        fonts: loadTestFonts(['unbounded']),
        textContext: {
          unit: 'km',
          locale: 'es',
          durationUnits: TEST_DURATION_UNITS,
          unitLabel: testUnitLabel,
        },
        translate,
      },
    );
    expect(prepared).toBeDefined();
    expect(await alphaOutside(prepared)).toBeLessThanOrEqual(DRAWN_ALPHA);
  }, 60_000);

  it('draws nothing for a period without activities', async () => {
    const range = weekRange('2020-01-08');
    const data: SummaryData = {
      mode: 'summary',
      kind: 'week',
      summary: summarize([], range),
      activities: [],
      bucketSize: 'day',
      families: [],
      current: false,
    };
    const layer = newLayer(
      { kind: 'summaryBlock', block: { design: 'periodData', count: 1 } },
      'block',
      'story',
    );
    const prepared = scene.prepareLayers(
      { version: 1, id: 'blocks', mode: 'summary', format: 'story', layers: [layer] },
      {
        data,
        fonts: loadTestFonts(['unbounded']),
        textContext: {
          unit: 'km',
          locale: 'es',
          durationUnits: TEST_DURATION_UNITS,
          unitLabel: testUnitLabel,
        },
        translate,
      },
    );
    expect(prepared).toEqual([]);
  });
});
