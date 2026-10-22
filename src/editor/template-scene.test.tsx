/**
 * Renders the scene off-screen with CanvasKit (Skia's WebAssembly build) and reads its pixels.
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import {
  drawOffscreen,
  getSkiaExports,
  makeOffscreenSurface,
  type SkImage,
} from '@shopify/react-native-skia/lib/commonjs/headless';

import { monthRange } from '@/core/dates';
import { defaultActivityTemplate, defaultSummaryTemplate, newLayer } from '@/core/default-layout';
import { summarize } from '@/core/summary';
import {
  ACTIVITY_CHART_SERIES,
  type ActivityChartSeries,
  type Layer,
  type Template,
} from '@/core/template';
import { FixtureActivitySource } from '@/sources/fixtures/fixture-source';
import { makeActivity } from '@/test-utils/make-activity';
import { alphaOutside, DRAWN_ALPHA } from '@/test-utils/skia-bounds';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import { FONT_FAMILIES } from './fonts';
import type { LayerContext } from './template-scene';

// Draw with CanvasKit instead of the native module.
jest.mock('@shopify/react-native-skia/lib/commonjs/Platform', () => ({
  Platform: { OS: 'web', PixelRatio: 1 },
}));
jest.mock('@shopify/react-native-skia', () => {
  const headless = jest.requireActual('@shopify/react-native-skia/lib/commonjs/headless');
  // `Skia` only exists once CanvasKit has loaded: resolve it on each use, not on import.
  const Skia = new Proxy(
    {},
    { get: (_target, key) => Reflect.get(headless.getSkiaExports().Skia, key) },
  );
  return { ...headless, Skia };
});

// Node's own modules, typed by hand: the app's type-check has no Node globals.
const fs = jest.requireActual<{ readFileSync(path: string): Uint8Array }>('fs');
const util = jest.requireActual<{ TextDecoder: typeof TextDecoder }>('util');

let scene: typeof import('./template-scene');

// CanvasKit is loaded here rather than by Skia's jest environment, so that it lives in the same
// JavaScript realm as the test: it type-checks arrays with `instanceof`, which fails across realms.
// The scene is imported afterwards, since some modules draw with Skia as they load.
beforeAll(async () => {
  // React Native's test setup expects every React update inside act(), but Skia's off-screen
  // renderer mounts and unmounts its own React root outside it; nothing here is a component
  // under test, so the act checks would only warn about Skia.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  // Expo's test setup swaps in a UTF-8-only TextDecoder; CanvasKit decodes UTF-16 text too.
  globalThis.TextDecoder = util.TextDecoder;
  (globalThis as { CanvasKit?: unknown }).CanvasKit = await CanvasKitInit({});
  scene = jest.requireActual<typeof import('./template-scene')>('./template-scene');
});

function interFonts() {
  const { Skia } = getSkiaExports();
  const file = 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf';
  const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(
    Skia.Data.fromBytes(new Uint8Array(fs.readFileSync(file))),
  );
  if (typeface === null) {
    throw new Error(`Could not load ${file}`);
  }
  const fonts = Skia.TypefaceFontProvider.Make();
  fonts.registerFont(typeface, FONT_FAMILIES.inter);
  return fonts;
}

const activity = makeActivity({ name: 'Morning Run' });

/** Draws only the given layer of the default activity template, with no photo behind it. */
async function render(change: (layer: Layer) => Layer, id: string): Promise<SkImage> {
  const base = defaultActivityTemplate(activity, 'story');
  const layer = base.layers.find((candidate) => candidate.id === id);
  if (layer === undefined) {
    throw new Error(`No layer ${id}`);
  }
  const template: Template = { ...base, layers: [change(layer)] };
  const context: LayerContext = {
    data: { mode: 'activity', activity, detail: null, place: null, zones: null },
    fonts: interFonts(),
    textContext: {
      unit: 'km',
      locale: 'en',
      durationUnits: TEST_DURATION_UNITS,
      unitLabel: testUnitLabel,
    },
    translate: (key) => key,
  };
  const surface = makeOffscreenSurface(1080, 1920);
  return drawOffscreen(
    surface,
    <scene.TemplateScene
      format="story"
      layers={scene.prepareLayers(template, context)}
      background={{ kind: 'none' }}
    />,
  );
}

/** Most opaque pixel of an image (0..255). */
function maxAlpha(image: SkImage): number {
  const pixels = image.readPixels(0, 0, image.getImageInfo());
  if (pixels === null) {
    throw new Error('Could not read the pixels');
  }
  let max = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    max = Math.max(max, pixels[i]);
  }
  return max;
}

describe('prepareLayers', () => {
  it('shrinks a long text to its maximum width on one line instead of wrapping it', () => {
    const template = defaultActivityTemplate(activity, 'story');
    const name = template.layers.find((layer) => layer.id === 'name');
    if (name === undefined || name.kind !== 'info' || name.maxWidth === undefined) {
      throw new Error('The default layout has no name with a maximum width');
    }
    const plain: Layer = { ...name, style: { ...name.style, font: 'inter', bold: false } };
    const prepareName = (activityName: string) => {
      const [prepared] = scene.prepareLayers(
        { ...template, layers: [plain] },
        {
          data: {
            mode: 'activity',
            activity: { ...activity, name: activityName },
            detail: null,
            place: null,
            zones: null,
          },
          fonts: interFonts(),
          textContext: {
            unit: 'km',
            locale: 'en',
            durationUnits: TEST_DURATION_UNITS,
            unitLabel: testUnitLabel,
          },
          translate: (key) => key,
        },
      );
      return prepared;
    };
    const long = prepareName('Tirada larga por el río con los amigos del club de atletismo');
    // The prepared width rounds the longest line up and adds a pixel.
    expect(long.width).toBeLessThanOrEqual(name.maxWidth * 1080 + 2);
    // One line, so no taller than a short name.
    expect(long.height).toBeLessThanOrEqual(prepareName('Morning Run').height);
  });

  it.each([
    ['its own italic', 'inter'],
    ['leaned letters', 'anton'],
  ] as const)(
    'measures slanted texts with %s whole: nothing leans out of the box',
    async (_name, font) => {
      const template = defaultActivityTemplate(activity, 'story');
      const texts = [
        ...template.layers.filter((layer) => layer.kind === 'metric' || layer.kind === 'info'),
        newLayer({ kind: 'text', content: 'Long run\nWith friends' }, 'text', 'story'),
      ];
      const prepare = (italic: boolean) =>
        scene.prepareLayers(
          {
            ...template,
            layers: texts.map((layer) =>
              'style' in layer && layer.kind !== 'activityBlock'
                ? { ...layer, style: { ...layer.style, font, italic } }
                : layer,
            ),
          },
          {
            data: { mode: 'activity', activity, detail: null, place: null, zones: null },
            fonts: loadTestFonts([font]),
            textContext: {
              unit: 'km',
              locale: 'en',
              durationUnits: TEST_DURATION_UNITS,
              unitLabel: testUnitLabel,
            },
            translate: (key) => key,
          },
        );
      const upright = prepare(false);
      const slanted = prepare(true);
      expect(slanted).toHaveLength(texts.length);
      for (const [i, prepared] of slanted.entries()) {
        // The room for the lean, but no line more.
        expect(prepared.width).toBeGreaterThan(upright[i].width);
        expect(prepared.height).toBeLessThanOrEqual(upright[i].height + 1);
        expect(await alphaOutside(prepared)).toBeLessThanOrEqual(DRAWN_ALPHA);
      }
    },
    60_000,
  );
});

/** How many pixels of an image are more opaque than `alpha` (0..255). */
function countAbove(image: SkImage, alpha: number): number {
  const pixels = image.readPixels(0, 0, image.getImageInfo());
  if (pixels === null) {
    throw new Error('Could not read the pixels');
  }
  let count = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > alpha) {
      count++;
    }
  }
  return count;
}

describe('TemplateScene style options', () => {
  const plain = (layer: Layer): Layer =>
    layer.kind === 'info'
      ? { ...layer, style: { ...layer.style, font: 'inter', bold: false } }
      : layer;
  const withStroke = (change: Partial<Extract<Layer, { kind: 'route' }>['stroke']>) => {
    return (layer: Layer): Layer =>
      layer.kind === 'route' ? { ...layer, stroke: { ...layer.stroke, ...change } } : layer;
  };

  it('draws a box behind a text with a backdrop', async () => {
    const bare = countAbove(await render(plain, 'name'), 128);
    const boxed = countAbove(
      await render((layer) => {
        const text = plain(layer);
        return text.kind === 'info'
          ? { ...text, style: { ...text.style, backdrop: 'solid' } }
          : text;
      }, 'name'),
      128,
    );
    // The letters cover a fraction of their box.
    expect(boxed).toBeGreaterThan(bare * 3);
  });

  it('draws dashed and dotted routes with gaps, and a glow around a route', async () => {
    const solid = countAbove(await render((layer) => layer, 'route'), 128);
    const dashed = countAbove(await render(withStroke({ line: 'dashed' }), 'route'), 128);
    const dotted = countAbove(await render(withStroke({ line: 'dotted' }), 'route'), 128);
    expect(dashed).toBeLessThan(solid * 0.8);
    expect(dotted).toBeLessThan(solid * 0.8);
    const halo = (image: SkImage) => countAbove(image, 0);
    expect(halo(await render(withStroke({ glow: true }), 'route'))).toBeGreaterThan(
      halo(await render((layer) => layer, 'route')),
    );
  });
});

describe('activity charts', () => {
  it('draw what the activity recorded, and nothing without its detail', async () => {
    const source = new FixtureActivitySource({ endDate: '2026-10-18', days: 30, seed: 42 });
    const ride = (await source.listRecent(30)).find(
      (candidate) => candidate.sportType === 'Ride' && candidate.averagePowerWatts !== null,
    );
    if (ride === undefined) {
      throw new Error('No ride with power in the fixtures');
    }
    const detail = await source.getActivityDetail(ride.id);
    const base = defaultActivityTemplate(ride, 'story');
    const drawn = async (data: LayerContext['data'], series: ActivityChartSeries) => {
      const chart = newLayer({ kind: 'activityChart', series }, 'chart', 'story');
      const context: LayerContext = {
        data,
        fonts: interFonts(),
        textContext: {
          unit: 'km',
          locale: 'en',
          durationUnits: TEST_DURATION_UNITS,
          unitLabel: testUnitLabel,
        },
        translate: (key) => key,
      };
      const layers = scene.prepareLayers({ ...base, layers: [plainChart(chart)] }, context);
      const image = await drawOffscreen(
        makeOffscreenSurface(1080, 1920),
        <scene.TemplateScene format="story" layers={layers} background={{ kind: 'none' }} />,
      );
      return { layers, pixels: countAbove(image, 128) };
    };
    for (const series of ACTIVITY_CHART_SERIES) {
      const { layers, pixels } = await drawn(
        { mode: 'activity', activity: ride, detail, place: null, zones: null },
        series,
      );
      expect(layers).toHaveLength(1);
      expect(pixels).toBeGreaterThan(5000);
    }
    const { layers } = await drawn(
      { mode: 'activity', activity: ride, detail: null, place: null, zones: null },
      'pace',
    );
    expect(layers).toEqual([]);
    // The splits draw as rows, as tall as their rows.
    const rows = await drawn(
      { mode: 'activity', activity: ride, detail, place: null, zones: null },
      'splits',
    );
    expect(rows.layers[0].height).toBeGreaterThan(400);
  });
});

describe("a period's bar values", () => {
  const context = (data: LayerContext['data']): LayerContext => ({
    data,
    fonts: interFonts(),
    textContext: {
      unit: 'km',
      locale: 'en',
      durationUnits: TEST_DURATION_UNITS,
      unitLabel: testUnitLabel,
    },
    translate: (key) => key,
  });
  const heightOf = (template: Template, layer: Layer, data: LayerContext['data']) =>
    scene.prepareLayers({ ...template, layers: [plainChart(layer)] }, context(data))[0].height;

  it("write each bar's value over a period's chart", () => {
    const month = monthRange('2026-10-14');
    const activities = [
      makeActivity({ localDate: '2026-10-03', distanceMeters: 12_300 }),
      makeActivity({ localDate: '2026-10-17', distanceMeters: 8_000 }),
    ];
    const data = {
      mode: 'summary',
      kind: 'month',
      summary: summarize(activities, month),
      activities,
      bucketSize: 'day',
    } as const;
    const base = defaultSummaryTemplate(data.summary, 'story');
    const chart = newLayer({ kind: 'summaryChart', value: 'distance' }, 'chart', 'story');
    if (chart.kind !== 'summaryChart') {
      throw new Error('No summary chart');
    }
    expect(heightOf(base, { ...chart, barValues: true }, data)).toBeGreaterThan(
      heightOf(base, chart, data),
    );
  });
});

/** A chart written in the only font these tests load. */
function plainChart(layer: Layer): Layer {
  return layer.kind === 'activityChart' || layer.kind === 'summaryChart'
    ? { ...layer, font: 'inter' }
    : layer;
}

describe('TemplateScene opacity', () => {
  const plainText = (layer: Layer): Layer =>
    layer.kind === 'info'
      ? { ...layer, style: { ...layer.style, font: 'inter', bold: false } }
      : layer;

  it('draws an opaque text layer fully opaque', async () => {
    const image = await render((layer) => ({ ...plainText(layer), opacity: 1 }), 'name');
    expect(maxAlpha(image)).toBe(255);
  });

  it('fades text layers too, not only shapes', async () => {
    const image = await render((layer) => ({ ...plainText(layer), opacity: 0.5 }), 'name');
    expect(maxAlpha(image)).toBeGreaterThanOrEqual(124);
    expect(maxAlpha(image)).toBeLessThanOrEqual(132);
  });

  it('fades routes', async () => {
    const image = await render((layer) => ({ ...layer, opacity: 0.5 }), 'route');
    expect(maxAlpha(image)).toBeGreaterThanOrEqual(124);
    expect(maxAlpha(image)).toBeLessThanOrEqual(132);
  });
});
