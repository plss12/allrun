/**
 * Draws every data widget of a period summary off-screen with real fonts (CanvasKit), in its own
 * lettering and on a backdrop, and checks that nothing is drawn outside the size it measures: the
 * editor grabs, frames and snaps a widget by that size.
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import { monthRange, weekRange, yearRange } from '@/core/dates';
import { newLayer } from '@/core/default-layout';
import { bucketForPeriod, type PeriodKind } from '@/core/periods';
import { summarize } from '@/core/summary';
import { summaryBlockLettering, summaryBlocks } from '@/core/summary-block';
import type { Layer } from '@/core/template';
import { FixtureActivitySource } from '@/sources/fixtures/fixture-source';
import { translate } from '@/test-utils/activity-blocks';
import { alphaOutside, DRAWN_ALPHA } from '@/test-utils/skia-bounds';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import type { SummaryData } from './editor-data';
import type { LayerContext } from './template-scene';

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

const source = new FixtureActivitySource({ endDate: '2026-10-21', days: 400, seed: 42 });

/** A summary of the period of `kind` around 2026, of every sport, as the editor loads it. */
async function periodData(kind: Exclude<PeriodKind, 'custom'>): Promise<SummaryData> {
  const range =
    kind === 'week'
      ? weekRange('2026-10-14')
      : kind === 'month'
        ? monthRange('2026-09-01')
        : yearRange('2025-06-01');
  const activities = await source.listInRange(range);
  return {
    mode: 'summary',
    kind,
    summary: summarize(activities, range),
    activities,
    bucketSize: bucketForPeriod(kind, range),
    families: [],
    current: true,
  };
}

describe('prepareSummaryBlock', () => {
  it.each(['week', 'month', 'year'] as const)(
    'draws every widget of a %s within the size it measures, bare and on a backdrop',
    async (kind) => {
      const data = await periodData(kind);
      const blocks = summaryBlocks(data.summary);
      // A period of every sport offers them all.
      expect(blocks.map((block) => block.design)).toEqual(
        expect.arrayContaining(['periodData', 'periodTable', 'periodSports']),
      );
      const layers = blocks.flatMap((block, i): Layer[] => {
        const layer = newLayer({ kind: 'summaryBlock', block }, `block-${i}`, 'story');
        if (layer.kind !== 'summaryBlock') {
          throw new Error('Expected a summary widget');
        }
        const signed = { ...layer, logo: true };
        return [
          signed,
          { ...signed, id: `${layer.id}-soft`, style: { ...layer.style, backdrop: 'soft' } },
        ];
      });
      const prepared = scene.prepareLayers(
        { version: 1, id: 'blocks', mode: 'summary', format: 'story', layers },
        {
          data,
          fonts: loadTestFonts(blocks.map((block) => summaryBlockLettering(block).font)),
          textContext: {
            unit: 'km',
            locale: 'es',
            durationUnits: TEST_DURATION_UNITS,
            unitLabel: testUnitLabel,
          },
          translate,
        } satisfies LayerContext,
      );
      expect(prepared).toHaveLength(layers.length);
      const overflowing: { readonly id: string; readonly alpha: number }[] = [];
      for (const block of prepared) {
        const alpha = await alphaOutside(block);
        if (alpha > DRAWN_ALPHA) {
          overflowing.push({ id: block.layer.id, alpha });
        }
      }
      expect(overflowing).toEqual([]);
    },
    60_000,
  );

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
