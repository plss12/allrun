/**
 * Draws every mixed widget off-screen with real fonts (CanvasKit) and checks that nothing is drawn
 * outside the size it measures: the editor grabs, frames and snaps a widget by that size.
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import { activityBlocks } from '@/core/activity-block';
import type { Activity } from '@/core/activity';
import { newLayer } from '@/core/default-layout';
import type { FontId, Layer } from '@/core/template';
import { es } from '@/i18n/locales/es';
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

/** The blocks of `activity` in `font`, signed with the logo, filled in and measured. */
function prepareBlocks(activity: Activity, font: FontId): PreparedLayer[] {
  const context: LayerContext = {
    data: { mode: 'activity', activity, detail: null, place: null, zones: null },
    fonts: loadTestFonts([font]),
    textContext: {
      unit: 'km',
      locale: 'es',
      durationUnits: TEST_DURATION_UNITS,
      unitLabel: testUnitLabel,
    },
    translate,
  };
  const layers = activityBlocks(activity).map((block, i): Layer => {
    const layer = newLayer({ kind: 'activityBlock', block }, `block-${i}`, 'story', font);
    return layer.kind === 'activityBlock' ? { ...layer, logo: true } : layer;
  });
  return scene.prepareLayers(
    { version: 1, id: 'blocks', mode: 'activity', format: 'story', layers },
    context,
  );
}

const RUN = makeActivity({ sportType: 'Run', distanceMeters: 42_195, movingTimeSeconds: 12_345 });
const GYM = makeActivity({ sportType: 'WeightTraining', distanceMeters: 0, averageSpeed: null });

describe('prepareActivityBlock', () => {
  it.each([
    ['a marathon', 'barlowCondensed', RUN],
    ['a marathon', 'archivoBlack', RUN],
    ['a gym session', 'inter', GYM],
  ] as const)(
    'draws every block of %s in %s within the size it measures',
    async (_name, font, activity) => {
      const blocks = prepareBlocks(activity, font);
      expect(blocks).toHaveLength(activityBlocks(activity).length);
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
      { kind: 'activityBlock', block: { design: 'headline', layout: 'stacked' } },
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
