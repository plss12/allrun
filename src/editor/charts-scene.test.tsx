/**
 * Draws every chart the gallery offers off-screen with real fonts (CanvasKit): their headers, the
 * zones of a heart rate, the splits as a table, a period's bars. Checks that each draws within the
 * size it measures and that the header and the zones table take their room.
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import type { Activity } from '@/core/activity';
import { availableActivityCharts } from '@/core/activity-charts';
import { monthRange } from '@/core/dates';
import { newLayer } from '@/core/default-layout';
import { activityCatalog, summaryCatalog } from '@/core/layer-catalog';
import { summarize } from '@/core/summary';
import { type Layer, newTemplate } from '@/core/template';
import { es } from '@/i18n/locales/es';
import { FixtureActivitySource } from '@/sources/fixtures/fixture-source';
import { alphaOutside, DRAWN_ALPHA } from '@/test-utils/skia-bounds';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import type { EditorData } from './editor-data';
import { zonedCharts } from './load-editor-data';
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

/**
 * A synthetic run (or the first activity `matching`) with its detail and the athlete's zones, as
 * the editor loads it.
 */
async function runData(
  matching: (activity: Activity) => boolean = (activity) =>
    activity.sportType === 'Run' && activity.routePolyline !== null,
): Promise<Extract<EditorData, { mode: 'activity' }>> {
  const run = (await source.listRecent(30)).find(matching);
  if (run === undefined) {
    throw new Error('No such activity in the fixtures');
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
    families: [],
    current: false,
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
          zonedCharts(data),
        )
      : summaryCatalog(data.summary, data.bucketSize);
  const items = catalog
    .filter((section) => section.id === 'charts')
    .flatMap((section) => section.widgets.flatMap((widget) => widget.variants));
  const layers = items.map((item, i): Layer =>
    newLayer(item.kind === 'text' ? { kind: 'text', content: '' } : item, `chart-${i}`, 'story'),
  );
  return scene.prepareLayers(
    newTemplate({ id: 'charts', mode: data.mode, format: 'story', layers }),
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
    // The three zone views of its heart rate and of its pace (Strava's six zones).
    expect(zoned).toHaveLength(6);
    // Its cadence too.
    expect(
      charts.some(
        (chart) => chart.layer.kind === 'activityChart' && chart.layer.series === 'cadence',
      ),
    ).toBe(true);
    expect(await overflowing(charts)).toEqual([]);
  }, 60_000);

  it("draw a ride's power in its seven zones within its size", async () => {
    const charts = prepareCharts(
      await runData(
        (activity) => activity.sportFamily === 'ride' && activity.averagePowerWatts !== null,
      ),
    );
    const zonedPower = charts.filter(
      (chart) =>
        chart.layer.kind === 'activityChart' &&
        chart.layer.series === 'power' &&
        chart.layer.zones !== undefined,
    );
    expect(zonedPower).toHaveLength(3);
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
        newTemplate({ id: 'one', mode: 'activity', format: 'story', layers: [layer] }),
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
      newTemplate({
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
      }),
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

describe('zones', () => {
  it('paints five, six and seven zones from grey to red, the seventh in purple', () => {
    const five = scene.zoneColors(5);
    const six = scene.zoneColors(6);
    const seven = scene.zoneColors(7);
    expect(new Set(five).size).toBe(5);
    expect(new Set(six).size).toBe(6);
    expect(new Set(seven).size).toBe(7);
    // Each starts grey and runs to red; a heart rate's keeps its five colors.
    for (const colors of [five, six, seven]) {
      expect(colors[0]).toBe(five[0]);
    }
    expect(six[5]).toBe(five[4]);
    expect(seven.slice(0, 6)).toEqual(six);
  });

  it('offers zones on the charts that have them', async () => {
    const run = await runData();
    expect(zonedCharts(run)).toEqual(['heartRate', 'pace']);
    // Strava's own time in zones of the activity is enough for its heart rate.
    expect(zonedCharts({ ...run, zones: null })).toEqual(['heartRate', 'pace']);
    const detail =
      run.detail === null
        ? null
        : { ...run.detail, zones: run.detail.zones && { ...run.detail.zones, heartRate: null } };
    expect(zonedCharts({ ...run, detail, zones: null })).toEqual(['pace']);
    expect(zonedCharts({ ...run, detail: null, zones: null })).toEqual([]);
  });
});

describe('zoneBands', () => {
  // Heart rate zones as Strava writes them: edges at 120.5 and 150.5.
  const zones = [
    { min: 0, max: 120 },
    { min: 121, max: 150 },
    { min: 151, max: null },
  ];
  // 100 bpm at the bottom of a 240 px chart, 200 at its top.
  const yOf = (value: number) => 240 - ((value - 100) / 100) * 240;

  it("cuts the chart across at each zone's edge, the outer bands past it by the stroke", () => {
    expect(scene.zoneBands(zones, yOf, 240, 8)).toEqual([
      { zone: 0, top: yOf(120.5), bottom: 248 },
      { zone: 1, top: yOf(150.5), bottom: yOf(120.5) },
      { zone: 2, top: -8, bottom: yOf(150.5) },
    ]);
  });

  it("leaves out the bands of zones the chart doesn't reach", () => {
    // A chart from 130 to 170 bpm: zone 1 (up to 120) is under it.
    const high = (value: number) => 240 - ((value - 130) / 40) * 240;
    expect(scene.zoneBands(zones, high, 240, 8).map((band) => band.zone)).toEqual([1, 2]);
  });

  it("places a pace's edges as its chart places them, the faster up", () => {
    const pace = [
      { min: 0, max: 2.6 },
      { min: 2.6, max: 3.1 },
      { min: 3.1, max: null },
    ];
    const paceY = (speed: number) => 240 - (1 - 1 / speed) * 300;
    expect(scene.zoneBands(pace, paceY, 240, 8)).toEqual([
      { zone: 0, top: paceY(2.6), bottom: 248 },
      { zone: 1, top: paceY(3.1), bottom: paceY(2.6) },
      { zone: 2, top: -8, bottom: paceY(3.1) },
    ]);
  });
});
