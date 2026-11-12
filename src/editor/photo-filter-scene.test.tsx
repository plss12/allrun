/**
 * The filters of the canvas's photo drawn with CanvasKit, in the exported image: the looks change
 * its colors, the blurs smear it, and the widgets never take them.
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

import { newTemplate } from '@/core/template';
import type { PhotoFilterId } from '@/core/photo-filter';
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

let exportScene: typeof import('./export-scene').exportScene;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.TextDecoder = util.TextDecoder;
  (globalThis as { CanvasKit?: unknown }).CanvasKit = await CanvasKitInit({});
  ({ exportScene } = jest.requireActual<typeof import('./export-scene')>('./export-scene'));
});

const activity = makeActivity();

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

/**
 * A photo of upright stripes, red and blue, 4 px each: covering the story canvas (1080 × 1920), each
 * stripe is 25.6 pixels of the canvas, and its middle, the canvas's, is where two meet.
 */
function stripedPhoto(): SkImage {
  const { Skia } = getSkiaExports();
  const surface = makeOffscreenSurface(400, 300);
  const canvas = surface.getCanvas();
  const red = Skia.Paint();
  red.setColor(Skia.Color('#FF0000'));
  const blue = Skia.Paint();
  blue.setColor(Skia.Color('#0000FF'));
  for (let x = 0; x < 400; x += 4) {
    canvas.drawRect(Skia.XYWHRect(x, 0, 4, 300), (x / 4) % 2 === 0 ? red : blue);
  }
  surface.flush();
  return surface.makeImageSnapshot();
}

/** The story design with the striped photo and `filter`, as exported, the photo `scale` times covering. */
async function exported(filter: PhotoFilterId | null, scale = 1): Promise<SkImage> {
  const plain = newTemplate({ id: 't', mode: 'activity', format: 'story', layers: [] });
  const template = {
    ...plain,
    photo: { ...plain.photo, scale },
    ...(filter === null ? {} : { filter }),
  };
  return drawOffscreen(
    makeOffscreenSurface(1080, 1920),
    exportScene({ template, layerContext: layerContext(), photo: stripedPhoto(), dominant: null }),
  );
}

/** RGB of a pixel. */
function pixel(image: SkImage, x: number, y: number): number[] {
  const pixels = image.readPixels(x, y, { ...image.getImageInfo(), width: 1, height: 1 });
  if (pixels === null) {
    throw new Error('Could not read the pixel');
  }
  return [pixels[0], pixels[1], pixels[2]];
}

/** Inside a stripe, right of the middle (canvas pixels), and far to the left of it. */
const NEAR_MIDDLE = { x: 540 + 10, y: 960 };
const FAR_LEFT = { x: 100, y: 960 };

describe('the filters of the photo, as exported', () => {
  it('leave the photo as it is without one', async () => {
    const image = await exported(null);
    const [r, g, b] = pixel(image, NEAR_MIDDLE.x, NEAR_MIDDLE.y);
    expect(r + b).toBeGreaterThan(240);
    expect(g).toBeLessThan(10);
  });

  it('turn it grey in Mono', async () => {
    const image = await exported('mono');
    for (const { x, y } of [NEAR_MIDDLE, FAR_LEFT]) {
      const [r, g, b] = pixel(image, x, y);
      expect(Math.abs(r - g)).toBeLessThanOrEqual(2);
      expect(Math.abs(g - b)).toBeLessThanOrEqual(2);
    }
  });

  it('smear the stripes together sideways in Motion Blur, everywhere', async () => {
    const image = await exported('motionBlur');
    for (const { x, y } of [NEAR_MIDDLE, FAR_LEFT]) {
      const [r, , b] = pixel(image, x, y);
      // Neither pure red nor pure blue: both mixed in.
      expect(r).toBeGreaterThan(60);
      expect(b).toBeGreaterThan(60);
    }
  });

  it('smear as far as the photo is big in Motion Blur: twice its size, twice the trail', async () => {
    // At twice covering, each stripe is 51.2 canvas pixels: a trail of the canvas's 4.5 % (48.6
    // pixels) would leave a stripe's middle pure, and the photo's own, twice that, mixes it.
    const stripeMiddle = { x: 540 + 26, y: 960 };
    const sharp = await exported(null, 2);
    const [sr, , sb] = pixel(sharp, stripeMiddle.x, stripeMiddle.y);
    expect(Math.min(sr, sb)).toBeLessThan(15);
    const image = await exported('motionBlur', 2);
    const [r, , b] = pixel(image, stripeMiddle.x, stripeMiddle.y);
    expect(r).toBeGreaterThan(60);
    expect(b).toBeGreaterThan(60);
  });

  it('smear the edges out from the middle in Zoom Blur, and leave the middle sharp', async () => {
    const image = await exported('zoomBlur');
    const [mr, , mb] = pixel(image, NEAR_MIDDLE.x, NEAR_MIDDLE.y);
    expect(Math.max(mr, mb)).toBeGreaterThan(240);
    expect(Math.min(mr, mb)).toBeLessThan(15);
    const [r, , b] = pixel(image, FAR_LEFT.x, FAR_LEFT.y);
    expect(r).toBeGreaterThan(60);
    expect(b).toBeGreaterThan(60);
  });
});
