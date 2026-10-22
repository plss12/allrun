/**
 * Draws every chart the gallery offers off-screen with real fonts (CanvasKit): their headers, the
 * zones of a heart rate, the splits as a table, a period's bars. Checks that each draws within the
 * size it measures and that the header and the zones table take their room.
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import { availableActivityCharts } from '@/core/activity-charts';
import { monthRange } from '@/core/dates';
import { newLayer } from '@/core/default-layout';
import { activityCatalog, summaryCatalog } from '@/core/layer-catalog';
import { summarize } from '@/core/summary';
import type { Layer } from '@/core/template';
import { es } from '@/i18n/locales/es';
import { FixtureActivitySource } from '@/sources/fixtures/fixture-source';
import { alphaOutside, DRAWN_ALPHA } from '@/test-utils/skia-bounds';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import type { EditorData } from './editor-data';
import type { LayerContext, PreparedLayer } from './template-scene';

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

/** Spanish labels, the longest of the app's languages. */
function translate(key: string): string {
  const text = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], es);
  if (typeof text !== 'string') {
    throw new Error(`No text for ${key}`);
  }
  return text;
}

const source = new FixtureActivitySource({ endDate: '2026-10-18', days: 30, seed: 42 });

/** A synthetic run with its detail and the athlete's zones, as the editor loads it. */
async function runData(): Promise<Extract<EditorData, { mode: 'activity' }>> {
  const run = (await source.listRecent(30)).find(
    (activity) => activity.sportType === 'Run' && activity.routePolyline !== null,
  );
  if (run === undefined) {
    throw new Error('No run in the fixtures');
  }
  return {
    mode: 'activity',
    activity: run,
    detail: await source.getActivityDetail(run.id),
    place: null,
    zones: await source.getHeartRateZones(),
  };
}

async function monthData(): Promise<EditorData> {
  const range = monthRange('2026-10-01');
  const activities = await source.listInRange(range);
  return {
    mode: 'summary',
    kind: 'month',
    summary: summarize(activities, range),
    activities,
    bucketSize: 'week',
  };
}

/** Every chart of the gallery's charts section for `data`, filled in and measured. */
function prepareCharts(data: EditorData): PreparedLayer[] {
  const catalog =
    data.mode === 'activity'
      ? activityCatalog(
          data.activity,
          data.detail === null ? [] : availableActivityCharts(data.detail, 'km'),
          false,
          data.zones !== null,
        )
      : summaryCatalog(data.summary, data.bucketSize);
  const items = catalog
    .filter((section) => section.id === 'charts')
    .flatMap((section) => section.widgets.flatMap((widget) => widget.variants));
  const layers = items.map((item, i): Layer =>
    newLayer(item.kind === 'text' ? { kind: 'text', content: '' } : item, `chart-${i}`, 'story'),
  );
  return scene.prepareLayers(
    { version: 1, id: 'charts', mode: data.mode, format: 'story', layers },
    {
      data,
      fonts: loadTestFonts(['barlowCondensed']),
      textContext: {
        unit: 'km',
        locale: 'es',
        durationUnits: TEST_DURATION_UNITS,
        unitLabel: testUnitLabel,
      },
      translate,
    } satisfies LayerContext,
  );
}

/** The charts that draw something outside the size they measure, with how much. */
async function overflowing(charts: readonly PreparedLayer[]) {
  const found: { readonly id: string; readonly alpha: number }[] = [];
  for (const chart of charts) {
    const alpha = await alphaOutside(chart);
    if (alpha > DRAWN_ALPHA) {
      found.push({ id: chart.layer.id, alpha });
    }
  }
  return found;
}

describe('charts', () => {
  it('draw every chart of an activity within its size: lines, zones and splits', async () => {
    const charts = prepareCharts(await runData());
    const zoned = charts.filter(
      (chart) => chart.layer.kind === 'activityChart' && chart.layer.zones,
    );
    // Its three zone views, besides the rest.
    expect(zoned).toHaveLength(3);
    expect(await overflowing(charts)).toEqual([]);
  }, 60_000);

  it('draw every chart of a period within its size', async () => {
    expect(await overflowing(prepareCharts(await monthData()))).toEqual([]);
  }, 60_000);

  it('make room over a chart for its header, and under a line for its zones', async () => {
    const data = await runData();
    const heightOf = (chart: Partial<Extract<Layer, { kind: 'activityChart' }>>) => {
      const base = newLayer({ kind: 'activityChart', series: 'heartRate' }, 'chart', 'story');
      if (base.kind !== 'activityChart') {
        throw new Error('Expected an activity chart');
      }
      const layer: Layer = { ...base, ...chart };
      const [prepared] = scene.prepareLayers(
        { version: 1, id: 'one', mode: 'activity', format: 'story', layers: [layer] },
        {
          data,
          fonts: loadTestFonts(['barlowCondensed']),
          textContext: {
            unit: 'km',
            locale: 'es',
            durationUnits: TEST_DURATION_UNITS,
            unitLabel: testUnitLabel,
          },
          translate,
        },
      );
      return prepared.height;
    };
    // Without its two data, a chart still has its name over it.
    const named = heightOf({ header: false });
    const withHeader = heightOf({});
    expect(withHeader).toBeGreaterThan(named);
    // Splits that write each pace go without a header: they would repeat it.
    expect(heightOf({ series: 'splits' })).toBe(heightOf({ series: 'splits', header: false }));
    expect(heightOf({ series: 'splits', splitPace: false })).toBeGreaterThan(
      heightOf({ series: 'splits' }),
    );
    expect(heightOf({ zones: 'line' })).toBe(withHeader);
    expect(heightOf({ zones: 'lineAndTable' })).toBeGreaterThan(withHeader);
    // Without the athlete's zones, the line is drawn alone.
    const unzoned = scene.prepareLayers(
      {
        version: 1,
        id: 'one',
        mode: 'activity',
        format: 'story',
        layers: [
          newLayer(
            { kind: 'activityChart', series: 'heartRate', zones: 'table' },
            'chart',
            'story',
          ),
        ],
      },
      {
        data: { ...data, zones: null },
        fonts: loadTestFonts(['barlowCondensed']),
        textContext: {
          unit: 'km',
          locale: 'es',
          durationUnits: TEST_DURATION_UNITS,
          unitLabel: testUnitLabel,
        },
        translate,
      },
    );
    expect(unzoned[0].height).toBe(withHeader);
  });
});
