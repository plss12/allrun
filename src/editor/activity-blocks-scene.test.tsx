/**
 * Draws every mixed widget off-screen with real fonts (CanvasKit), each in its own, and checks that
 * nothing is drawn outside the size it measures: the editor grabs, frames and snaps a widget by
 * that size. A marathon's data widgets and a gym session here; its creative widgets, and the
 * blocks in the user's lettering, in other files, so Jest draws them at once.
 *
 * @jest-environment node
 */
import { newLayer } from '@/core/default-layout';
import {
  BLOCK_FONTS,
  blocksOf,
  GYM,
  testBlocksInTheirFonts,
  RUN,
  translate,
} from '@/test-utils/activity-blocks';
import { makeActivity } from '@/test-utils/make-activity';
import { loadSceneBeforeAll } from '@/test-utils/scene';
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

const scene = loadSceneBeforeAll();

describe('prepareActivityBlock', () => {
  // A marathon's creative widgets in `activity-blocks-creative-scene.test.tsx`, and in the
  // user's lettering in `activity-blocks-restyled-scene.test.tsx`: Jest draws the files at once.
  it('offers the laps of an interval session among its blocks', () => {
    expect(blocksOf(RUN).some((block) => block.design === 'laps')).toBe(true);
  });
  testBlocksInTheirFonts(scene, 'a marathon', RUN, 'data');
  testBlocksInTheirFonts(scene, 'a gym session', GYM, 'all');

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
      scene().prepareLayers(
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
        const [widget] = scene().prepareLayers(
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
      const [prepared] = scene().prepareLayers(
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
