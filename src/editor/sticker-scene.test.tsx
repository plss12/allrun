/**
 * A sticker drawn as the phone does (with CanvasKit): cut to its widget, on a transparent ground,
 * and the same widget whatever its scale.
 *
 * @jest-environment node
 */
import {
  drawOffscreen,
  makeOffscreenSurface,
} from '@shopify/react-native-skia/lib/commonjs/headless';

import { STICKER_ROOM, stickerPlan } from '@/core/export';
import { newLayer } from '@/core/default-layout';
import { newTemplate } from '@/core/template';
import { makeActivity } from '@/test-utils/make-activity';
import { loadSceneBeforeAll } from '@/test-utils/scene';
import { DRAWN_ALPHA } from '@/test-utils/skia-bounds';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import type { PreparedLayer } from './template-scene';

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

function preparedMetric(): PreparedLayer {
  const layer = newLayer({ kind: 'metric', metric: 'distance' }, 'metric', 'story', 'inter');
  const activity = makeActivity({ sportType: 'Run' });
  const [prepared] = scene().prepareLayers(
    newTemplate({ id: 't', mode: 'activity', format: 'story', layers: [layer] }),
    {
      data: { mode: 'activity', activity, detail: null, place: null, zones: null },
      fonts: loadTestFonts(['inter']),
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
}

/** The sticker's pixels, and what is drawn in its room around the widget and inside it. */
async function drawnSticker(prepared: PreparedLayer) {
  const { stickerScene } = jest.requireActual<typeof import('./sticker-image')>('./sticker-image');
  const plan = stickerPlan(prepared.width, prepared.height);
  const image = await drawOffscreen(
    makeOffscreenSurface(plan.width, plan.height),
    stickerScene(prepared),
  );
  const pixels = image.readPixels(0, 0, image.getImageInfo());
  if (pixels === null) {
    throw new Error('Could not read the pixels');
  }
  const alpha = (x: number, y: number) => pixels[(y * plan.width + x) * 4 + 3];
  return { plan, alpha };
}

describe('a sticker', () => {
  it('is transparent around the widget', async () => {
    const { plan, alpha } = await drawnSticker(preparedMetric());
    for (const [x, y] of [
      [0, 0],
      [plan.width - 1, 0],
      [0, plan.height - 1],
      [plan.width - 1, plan.height - 1],
    ]) {
      expect(alpha(x, y)).toBe(0);
    }
  });

  it('draws the widget whole, inside its room', async () => {
    const prepared = preparedMetric();
    const { plan, alpha } = await drawnSticker(prepared);
    const room = Math.floor(STICKER_ROOM * plan.scale);
    let drawn = 0;
    let outside = 0;
    for (let y = 0; y < plan.height; y++) {
      for (let x = 0; x < plan.width; x++) {
        if (alpha(x, y) > DRAWN_ALPHA) {
          const inRoom = x >= room && x < plan.width - room && y >= room && y < plan.height - room;
          drawn += inRoom ? 1 : 0;
          outside += inRoom ? 0 : 1;
        }
      }
    }
    expect(drawn).toBeGreaterThan(1000);
    // Only a shadow reaches into the room, never its letters.
    expect(outside).toBeLessThan(drawn);
  }, 60_000);
});
