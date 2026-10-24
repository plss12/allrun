/**
 * Draws the mixed widgets off-screen with real fonts (CanvasKit) in the user's lettering, and the
 * camera in every format, checking that nothing is drawn outside the size they measure (see
 * `activity-blocks-scene.test.tsx`, which draws them in their own fonts).
 *
 * @jest-environment node
 */
import { newLayer } from '@/core/default-layout';
import { CANVAS_FORMATS, type CanvasFormat } from '@/core/template';
import { RUN, testBlocksRestyled, translate } from '@/test-utils/activity-blocks';
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

describe("prepareActivityBlock in the user's lettering", () => {
  // Slanted, in `activity-blocks-slanted-scene.test.tsx`: Jest draws both files at once.
  testBlocksRestyled(scene, 'a wide font', 'unbounded', false);
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
      const [camera] = scene().prepareLayers(
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
