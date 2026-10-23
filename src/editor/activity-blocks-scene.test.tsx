/**
 * Draws every mixed widget off-screen with real fonts (CanvasKit), each in its own, and checks that
 * nothing is drawn outside the size it measures: the editor grabs, frames and snaps a widget by
 * that size. In the user's lettering, and the camera, in `activity-blocks-restyled-scene.test.tsx`
 * (apart, so Jest draws both at once).
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import { newLayer } from '@/core/default-layout';
import {
  BLOCK_FONTS,
  blocksOf,
  GYM,
  prepareBlocks,
  RUN,
  translate,
} from '@/test-utils/activity-blocks';
import { makeActivity } from '@/test-utils/make-activity';
import { alphaOutside, DRAWN_ALPHA } from '@/test-utils/skia-bounds';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

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

describe('prepareActivityBlock', () => {
  // In the user's lettering, see `activity-blocks-restyled-scene.test.tsx`.
  it.each([
    ['a marathon', RUN],
    ['a gym session', GYM],
  ] as const)(
    'draws every block of %s in its own font within the size it measures',
    async (_name, activity) => {
      const blocks = prepareBlocks(scene, activity, null);
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
