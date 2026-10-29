/**
 * Draws the eyedropper's snapshot off-screen with CanvasKit (Skia's WebAssembly build) and picks
 * colors from it as the eyedropper does. Setup as in `export-scene.test.tsx`.
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

import { defaultActivityTemplate } from '@/core/default-layout';
import { COVER_PLACEMENT } from '@/core/photo-placement';
import { CANVAS_FORMATS, type Template } from '@/core/template';
import { makeActivity } from '@/test-utils/make-activity';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import type { LayerContext } from './template-scene';

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

let eyedropper: typeof import('./eyedropper-snapshot');
let exportScene: typeof import('./export-scene').exportScene;

beforeAll(async () => {
  // Skia's off-screen renderer mounts its own React root outside act(); see template-scene.test.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.TextDecoder = util.TextDecoder;
  (globalThis as { CanvasKit?: unknown }).CanvasKit = await CanvasKitInit({});
  eyedropper = jest.requireActual<typeof import('./eyedropper-snapshot')>('./eyedropper-snapshot');
  ({ exportScene } = jest.requireActual<typeof import('./export-scene')>('./export-scene'));
});

const activity = makeActivity({ name: 'Morning Run' });
// No widgets: these tests look at the photo and the background.
const template: Template = { ...defaultActivityTemplate(activity, 'story'), layers: [] };
const { width, height } = CANVAS_FORMATS.story;

function layerContext(): LayerContext {
  const { Skia } = getSkiaExports();
  return {
    data: { mode: 'activity', activity, detail: null, place: null, zones: null },
    fonts: Skia.TypefaceFontProvider.Make(),
    textContext: {
      unit: 'km',
      locale: 'en',
      durationUnits: TEST_DURATION_UNITS,
      unitLabel: testUnitLabel,
    },
    translate: (key) => key,
  };
}

/** A photo of one color, wider than the canvas. */
function plainPhoto(color: string): SkImage {
  const { Skia } = getSkiaExports();
  const surface = makeOffscreenSurface(400, 300);
  surface.getCanvas().clear(Skia.Color(color));
  surface.flush();
  return surface.makeImageSnapshot();
}

function snapshot(photo: SkImage | null, background: Template['background']) {
  return drawOffscreen(
    makeOffscreenSurface(width, height),
    exportScene({
      template: { ...template, photo: { ...COVER_PLACEMENT, scale: 0.5 }, background },
      layerContext: layerContext(),
      photo,
      dominant: photo === null ? null : '#0000FF',
    }),
  );
}

/** RGB of a pixel of a drawing, as `#RRGGBB`. */
function shown(image: SkImage, x: number, y: number): string | null {
  return eyedropper.pixelColor(image, x, y);
}

describe("the eyedropper's snapshot", () => {
  it("picks the photo's color where the photo is", async () => {
    const image = await snapshot(plainPhoto('#C94A2E'), { kind: 'transparent' });
    expect(eyedropper.pixelColor(image, width / 2, height / 2)).toBe('#C94A2E');
  });

  it('picks the background where the photo leaves the canvas empty', async () => {
    const image = await snapshot(plainPhoto('#C94A2E'), { kind: 'color', color: '#141B2D' });
    expect(eyedropper.pixelColor(image, 0, 0)).toBe('#141B2D');
  });

  it('picks nothing where the design is transparent', async () => {
    const image = await snapshot(null, { kind: 'transparent' });
    expect(eyedropper.pixelColor(image, 0, 0)).toBeNull();
  });

  it("picks a see-through background's own color, not what shows through it", async () => {
    const image = await snapshot(null, { kind: 'color', color: '#C94A2E80' });
    expect(eyedropper.pixelColor(image, 0, 0)).toBe('#C94A2E');
  });
});

describe('the loupe', () => {
  /** A 100 × 100 snapshot: red on its left half, blue on its right, transparent at the bottom. */
  function halves(): SkImage {
    const { Skia } = getSkiaExports();
    const surface = makeOffscreenSurface(100, 100);
    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    paint.setColor(Skia.Color('#FF0000'));
    canvas.drawRect(Skia.XYWHRect(0, 0, 50, 80), paint);
    paint.setColor(Skia.Color('#0000FF'));
    canvas.drawRect(Skia.XYWHRect(50, 0, 50, 80), paint);
    surface.flush();
    return surface.makeImageSnapshot();
  }

  /** The loupe over the pixel (`x`, `y`) of `image`, shown at 2 points per pixel. */
  function loupe(image: SkImage, x: number, y: number) {
    const ratio = 2;
    const { at, lens, fill } = eyedropper.loupePlacement(x, y, ratio);
    return drawOffscreen(
      makeOffscreenSurface(200, 200),
      <eyedropper.Loupe image={image} ratio={ratio} at={at} lens={lens} fill={fill} />,
    );
  }

  it('sits on the pixel, shows it in the middle and fills its ring with its color', async () => {
    const image = halves();
    // The pixel (24, 40), red, is at (49, 81) on screen; its ring reaches 52..64 points around.
    const onRed = await loupe(image, 24, 40);
    expect(shown(onRed, 49, 81)).toBe('#FF0000');
    expect(shown(onRed, 49 + 58, 81)).toBe('#FF0000');
    // Magnified, a pixel is 12 points wide: the blue half, 25.5 pixels away, is out of the loupe.
    expect(shown(onRed, 49 + 40, 81)).toBe('#FF0000');
    const onBlue = await loupe(image, 74, 40);
    expect(shown(onBlue, 149, 81)).toBe('#0000FF');
    expect(shown(onBlue, 149, 81 + 58)).toBe('#0000FF');
  });

  it('magnifies: a pixel next to the edge shows the other half a few points away', async () => {
    const image = halves();
    // The pixel (49, 40) is the last red one, 12 points wide: 7 points right of its center,
    // the first blue one.
    const atEdge = await loupe(image, 49, 40);
    expect(shown(atEdge, 99, 81)).toBe('#FF0000');
    expect(shown(atEdge, 99 + 7, 81)).toBe('#0000FF');
  });

  it('shows the checkerboard where the design is transparent', async () => {
    const image = halves();
    const onNothing = await loupe(image, 24, 90);
    expect(['#1C1C1E', '#2C2C2E']).toContain(shown(onNothing, 49, 181));
  });
});
