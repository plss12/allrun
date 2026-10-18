/**
 * Renders exported designs off-screen with CanvasKit (Skia's WebAssembly build) and reads their
 * pixels. Setup as in `template-scene.test.tsx`.
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
import { DEFAULT_FRAMING, type PhotoFraming } from '@/core/photo-framing';
import { CANVAS_FORMATS } from '@/core/template';
import { makeActivity } from '@/test-utils/make-activity';
import { TEST_DURATION_UNITS } from '@/test-utils/text-context';

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
  // Skia's off-screen renderer mounts its own React root outside act(); see template-scene.test.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.TextDecoder = util.TextDecoder;
  (globalThis as { CanvasKit?: unknown }).CanvasKit = await CanvasKitInit({});
  ({ exportScene } = jest.requireActual<typeof import('./export-scene')>('./export-scene'));
});

const activity = makeActivity({ name: 'Morning Run' });
const template = defaultActivityTemplate(activity, 'story');
const { width, height } = CANVAS_FORMATS.story;

function layerContext(): LayerContext {
  const { Skia } = getSkiaExports();
  return {
    data: { mode: 'activity', activity, detail: null },
    // No fonts: these tests look at the background, not the text.
    fonts: Skia.TypefaceFontProvider.Make(),
    textContext: { unit: 'km', locale: 'en', durationUnits: TEST_DURATION_UNITS },
    translate: (key) => key,
  };
}

/** A plain red photo, wider than the canvas. */
function redPhoto(): SkImage {
  const { Skia } = getSkiaExports();
  const surface = makeOffscreenSurface(400, 300);
  surface.getCanvas().clear(Skia.Color('#FF0000'));
  surface.flush();
  return surface.makeImageSnapshot();
}

function render(photo: SkImage | null, framing: PhotoFraming = DEFAULT_FRAMING) {
  return drawOffscreen(
    makeOffscreenSurface(width, height),
    exportScene({ template, layerContext: layerContext(), photo, framing }),
  );
}

/** RGBA of a pixel. */
function pixel(image: SkImage, x: number, y: number): number[] {
  const pixels = image.readPixels(0, 0, image.getImageInfo());
  if (pixels === null) {
    throw new Error('Could not read the pixels');
  }
  const i = (y * image.width() + x) * 4;
  return Array.from(pixels.slice(i, i + 4));
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

const corners = [
  [0, 0],
  [width - 1, 0],
  [0, height - 1],
  [width - 1, height - 1],
] as const;

describe('exportScene', () => {
  it('draws the export size', async () => {
    const image = await render(null);
    expect([image.width(), image.height()]).toEqual([width, height]);
  });

  it('leaves a sticker transparent around its widgets', async () => {
    const image = await render(null);
    for (const [x, y] of corners) {
      expect(pixel(image, x, y)[3]).toBe(0);
    }
    // The widgets are drawn (the route crosses the middle).
    expect(maxAlpha(image)).toBeGreaterThan(200);
  });

  it('covers the whole image with the photo, also rotated', async () => {
    for (const framing of [DEFAULT_FRAMING, { ...DEFAULT_FRAMING, rotation: 0.4, zoom: 1.2 }]) {
      const image = await render(redPhoto(), framing);
      for (const [x, y] of corners) {
        const [r, g, b, a] = pixel(image, x, y);
        expect(a).toBe(255);
        expect(r).toBeGreaterThan(240);
        expect(g + b).toBeLessThan(20);
      }
    }
  });
});
