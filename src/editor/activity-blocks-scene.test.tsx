/**
 * Draws every mixed widget off-screen with real fonts (CanvasKit) and checks that nothing is drawn
 * outside the size it measures: the editor grabs, frames and snaps a widget by that size.
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import { activityBlocks } from '@/core/activity-block';
import type { Activity } from '@/core/activity';
import type { ActivityDetail } from '@/core/activity-detail';
import { newLayer } from '@/core/default-layout';
import { CANVAS_FORMATS, type CanvasFormat, type FontId, type Layer } from '@/core/template';
import { es } from '@/i18n/locales/es';
import { generateStravaDetail } from '@/sources/fixtures/detail';
import { parseStravaDetail } from '@/sources/strava/detail';
import { makeActivity } from '@/test-utils/make-activity';
import { alphaOutside, DRAWN_ALPHA } from '@/test-utils/skia-bounds';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

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

/**
 * The blocks of `activity`, signed with the logo, filled in and measured: each in its own font
 * (see `blockLettering`), or all in `font` as if the user had changed it (but the replicas, which
 * keep their apps' look), slanted when `italic`.
 */
function prepareBlocks(activity: Activity, font: FontId | null, italic = false): PreparedLayer[] {
  const context: LayerContext = {
    data: { mode: 'activity', activity, detail: detailOf(activity), place: PLACE, zones: null },
    fonts: loadTestFonts(
      font === null ? BLOCK_FONTS : [font, ...BLOCK_FONTS.filter((other) => other !== font)],
    ),
    textContext: {
      unit: 'km',
      locale: 'es',
      durationUnits: TEST_DURATION_UNITS,
      unitLabel: testUnitLabel,
    },
    translate,
  };
  const layers = blocksOf(activity).map((block, i): Layer => {
    const layer = newLayer({ kind: 'activityBlock', block }, `block-${i}`, 'story');
    if (layer.kind !== 'activityBlock') {
      throw new Error('Expected a mixed widget');
    }
    return {
      ...layer,
      logo: true,
      style: { ...layer.style, ...(font === null ? {} : { font }), italic },
    };
  });
  return scene.prepareLayers(
    { version: 1, id: 'blocks', mode: 'activity', format: 'story', layers },
    context,
  );
}

/**
 * Synthetic streams, splits and laps for `activity`, through the same mapping as Strava's; for a
 * run, an interval session, so its laps are drawn too.
 */
function detailOf(activity: Activity): ActivityDetail {
  const { streams, detailed } = generateStravaDetail(activity, 1);
  return parseStravaDetail(JSON.parse(JSON.stringify(streams)), detailed);
}

/** Every block of `activity`, its splits and laps too when it has them, and its place. */
const blocksOf = (activity: Activity) => {
  const detail = detailOf(activity);
  return activityBlocks(activity, detail.splits.metric.length > 0, true, detail.laps.length > 1);
};

/** Where the activities started, with a long name. */
const PLACE = { city: 'San Sebastián de los Reyes', region: 'Madrid', country: 'España' };

/** The fonts mixed widgets start in. */
const BLOCK_FONTS: readonly FontId[] = [
  'inter',
  'barlowCondensed',
  'anton',
  'unbounded',
  'bigShoulders',
  'bowlbyOneSC',
  'playfairDisplay',
  'spaceMono',
  'orbitron',
  'graduate',
  'doto',
  'permanentMarker',
];

const RUN = makeActivity({ sportType: 'Run', distanceMeters: 42_195, movingTimeSeconds: 12_345 });
const GYM = makeActivity({ sportType: 'WeightTraining', distanceMeters: 0, averageSpeed: null });

describe('prepareActivityBlock', () => {
  it.each([
    ['a marathon', 'its own font', null, false, RUN],
    ['a marathon', 'a wide font', 'unbounded', false, RUN],
    ['a marathon', 'its own fonts slanted', null, true, RUN],
    ['a marathon', 'a font without an italic, leaned', 'anton', true, RUN],
    ['a gym session', 'its own font', null, false, GYM],
  ] as const)(
    'draws every block of %s in %s within the size it measures',
    async (_name, _fontName, font, italic, activity) => {
      const blocks = prepareBlocks(activity, font, italic);
      // The run is an interval session: its tables of laps are among the blocks.
      if (activity === RUN) {
        expect(blocksOf(activity).some((block) => block.design === 'laps')).toBe(true);
      }
      expect(blocks).toHaveLength(blocksOf(activity).length);
      const overflowing: { readonly id: string; readonly alpha: number }[] = [];
      for (const block of blocks) {
        expect(block.width).toBeGreaterThan(0);
        expect(block.height).toBeGreaterThan(0);
        const alpha = await alphaOutside(block);
        if (alpha > DRAWN_ALPHA) {
          overflowing.push({ id: block.layer.id, alpha });
        }
      }
      expect(overflowing).toEqual([]);
    },
    60_000,
  );

  it('draws nothing for an activity without data', () => {
    const empty = makeActivity({
      sportType: 'Workout',
      distanceMeters: 0,
      movingTimeSeconds: 0,
      elapsedTimeSeconds: 0,
      averageSpeed: null,
      averageHeartRate: null,
      maxHeartRate: null,
      calories: null,
    });
    const layer = newLayer(
      { kind: 'activityBlock', block: { design: 'receipt' } },
      'block',
      'story',
    );
    expect(
      scene.prepareLayers(
        { version: 1, id: 'blocks', mode: 'activity', format: 'story', layers: [layer] },
        {
          data: { mode: 'activity', activity: empty, detail: null, place: null, zones: null },
          fonts: loadTestFonts(['inter']),
          textContext: {
            unit: 'km',
            locale: 'es',
            durationUnits: TEST_DURATION_UNITS,
            unitLabel: testUnitLabel,
          },
          translate,
        },
      ),
    ).toEqual([]);
  });
});

describe('the camera', () => {
  it.each(Object.keys(CANVAS_FORMATS) as CanvasFormat[])(
    'frames the whole canvas of a %s, its view of the photo see-through to touches',
    async (format) => {
      const layer = newLayer(
        { kind: 'activityBlock', block: { design: 'camera', cover: 'red' } },
        'camera',
        format,
      );
      const [camera] = scene.prepareLayers(
        { version: 1, id: 'camera', mode: 'activity', format, layers: [layer] },
        {
          data: { mode: 'activity', activity: RUN, detail: null, place: null, zones: null },
          fonts: loadTestFonts(['inter']),
          textContext: {
            unit: 'km',
            locale: 'es',
            durationUnits: TEST_DURATION_UNITS,
            unitLabel: testUnitLabel,
          },
          translate,
        },
      );
      const canvas = CANVAS_FORMATS[format];
      expect(camera.layer.transform.scale).toBe(1);
      expect([camera.width, camera.height]).toEqual([canvas.width, canvas.height]);
      // The view lies between the bands, across the whole width.
      const { hole } = camera;
      expect(hole).toMatchObject({ x: 0, width: canvas.width });
      expect(hole?.y).toBeGreaterThan(0);
      expect((hole?.y ?? 0) + (hole?.height ?? 0)).toBeLessThan(canvas.height);
      expect(await alphaOutside(camera)).toBeLessThanOrEqual(DRAWN_ALPHA);
    },
    60_000,
  );
});

describe('a data widget in small letters', () => {
  it.each(['tower', 'dataStack'] as const)(
    'cuts the lines of the %s to their letters, as close as in capitals, and within its size',
    async (design) => {
      const block = design === 'tower' ? { design } : { design, layout: 'three' as const };
      const prepared = (uppercase: boolean) => {
        const layer = newLayer({ kind: 'activityBlock', block }, design, 'story');
        if (layer.kind !== 'activityBlock') {
          throw new Error('Expected a mixed widget');
        }
        const [widget] = scene.prepareLayers(
          {
            version: 1,
            id: design,
            mode: 'activity',
            format: 'story',
            layers: [{ ...layer, style: { ...layer.style, uppercase } }],
          },
          {
            data: { mode: 'activity', activity: RUN, detail: null, place: null, zones: null },
            fonts: loadTestFonts(BLOCK_FONTS),
            textContext: {
              unit: 'km',
              locale: 'es',
              durationUnits: TEST_DURATION_UNITS,
              unitLabel: testUnitLabel,
            },
            translate,
          },
        );
        return widget;
      };
      const capitals = prepared(true);
      const small = prepared(false);
      // Small letters rise a little over capitals and go under the baseline: a little taller,
      // never their font's whole line, stretched.
      expect(small.height).toBeLessThan(capitals.height * 1.15);
      expect(await alphaOutside(small)).toBeLessThanOrEqual(DRAWN_ALPHA);
    },
    60_000,
  );
});

describe('a wrapped text', () => {
  it('never breaks inside a word, even one wider than its lines may be', () => {
    const chat = (own: string) => {
      const layer = newLayer(
        { kind: 'activityBlock', block: { design: 'chat', layout: 'dark', phrase: { own } } },
        'chat',
        'story',
      );
      const [prepared] = scene.prepareLayers(
        { version: 1, id: 'chat', mode: 'activity', format: 'story', layers: [layer] },
        {
          data: { mode: 'activity', activity: RUN, detail: null, place: null, zones: null },
          fonts: loadTestFonts(['inter']),
          textContext: {
            unit: 'km',
            locale: 'es',
            durationUnits: TEST_DURATION_UNITS,
            unitLabel: testUnitLabel,
          },
          translate,
        },
      );
      return prepared;
    };
    // One word, longer than a message's lines: one line, as tall as a short message.
    const long = chat('Supercalifragilisticoespialidoso');
    expect(long.height).toBe(chat('Hola').height);
    expect(long.width).toBeGreaterThan(chat('Hola').width);
  });
});
