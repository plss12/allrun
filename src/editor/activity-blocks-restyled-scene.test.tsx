/**
 * Draws the mixed widgets off-screen with real fonts (CanvasKit) in the user's lettering, and the
 * camera in every format, checking that nothing is drawn outside the size they measure (see
 * `activity-blocks-scene.test.tsx`, which draws them in their own fonts).
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import { isAppReplica } from '@/core/activity-block';
import { newLayer } from '@/core/default-layout';
import { CANVAS_FORMATS, type CanvasFormat } from '@/core/template';
import { prepareBlocks, RUN, translate } from '@/test-utils/activity-blocks';
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

describe("prepareActivityBlock in the user's lettering", () => {
  it.each([
    ['a wide font', 'unbounded', false],
    ['its own fonts slanted', null, true],
    ['a font without an italic, leaned', 'anton', true],
  ] as const)(
    'draws every block of a marathon in %s within the size it measures',
    async (_fontName, font, italic) => {
      const own = prepareBlocks(scene, RUN, null);
      const blocks = prepareBlocks(scene, RUN, font, italic);
      expect(blocks).toHaveLength(own.length);
      const overflowing: { readonly id: string; readonly alpha: number }[] = [];
      for (const [i, block] of blocks.entries()) {
        // A replica keeps its app's look whatever the lettering: the same as in its own, which
        // the other test draws.
        if (block.layer.kind === 'activityBlock' && isAppReplica(block.layer.block.design)) {
          expect([block.width, block.height]).toEqual([own[i].width, own[i].height]);
          continue;
        }
        const alpha = await alphaOutside(block);
        if (alpha > DRAWN_ALPHA) {
          overflowing.push({ id: block.layer.id, alpha });
        }
      }
      expect(overflowing).toEqual([]);
    },
    60_000,
  );
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
