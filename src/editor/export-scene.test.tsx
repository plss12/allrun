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

import { defaultActivityTemplate, newLayer } from '@/core/default-layout';
import { imageBox, instantBox } from '@/core/image-layer';
import { COVER_PLACEMENT, type PhotoPlacement } from '@/core/photo-placement';
import { CANVAS_FORMATS, type ImageFrame, type Template } from '@/core/template';
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
    data: { mode: 'activity', activity, detail: null, place: null, zones: null },
    // No fonts: these tests look at the background, not the text.
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

/** A plain red photo, wider than the canvas. */
function redPhoto(): SkImage {
  const { Skia } = getSkiaExports();
  const surface = makeOffscreenSurface(400, 300);
  surface.getCanvas().clear(Skia.Color('#FF0000'));
  surface.flush();
  return surface.makeImageSnapshot();
}

/** The photo's dominant color in these tests, as the editor would have found it. */
const BLUE = '#0000FF';

function render(
  photo: SkImage | null,
  placement: PhotoPlacement = COVER_PLACEMENT,
  background: Template['background'] = { kind: 'auto' },
) {
  return drawOffscreen(
    makeOffscreenSurface(width, height),
    exportScene({
      template: { ...template, photo: placement, background },
      layerContext: layerContext(),
      photo,
      dominant: photo === null ? null : BLUE,
    }),
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

  it('covers the whole image with the photo, also zoomed in and turned', async () => {
    for (const placement of [COVER_PLACEMENT, { ...COVER_PLACEMENT, rotation: 0.4, scale: 1.2 }]) {
      const image = await render(redPhoto(), placement);
      for (const [x, y] of corners) {
        const [r, g, b, a] = pixel(image, x, y);
        expect(a).toBe(255);
        expect(r).toBeGreaterThan(240);
        expect(g + b).toBeLessThan(20);
      }
    }
  });

  it("shows the photo's dominant color where a smaller photo leaves the canvas empty", async () => {
    const image = await render(redPhoto(), { ...COVER_PLACEMENT, scale: 0.5 });
    for (const [x, y] of corners) {
      expect(pixel(image, x, y)).toEqual([0, 0, 255, 255]);
    }
    // The photo, half as big, still fills the middle.
    const [r, , , a] = pixel(image, width / 2, height / 2 + 300);
    expect([r > 240, a]).toEqual([true, 255]);
  });

  it('shows a chosen color, or nothing over a transparent background', async () => {
    const small = { ...COVER_PLACEMENT, scale: 0.5 };
    const white = await render(redPhoto(), small, { kind: 'color', color: '#FFFFFF' });
    expect(pixel(white, 0, 0)).toEqual([255, 255, 255, 255]);
    const clear = await render(redPhoto(), small, { kind: 'transparent' });
    expect(pixel(clear, 0, 0)[3]).toBe(0);
  });

  it('places the photo where the design says, whatever its resolution', async () => {
    // Half as big and centered on the right edge: the left part shows the background.
    const image = await render(redPhoto(), { ...COVER_PLACEMENT, x: 1, scale: 0.5 });
    expect(pixel(image, 0, height / 2)).toEqual([0, 0, 255, 255]);
    expect(pixel(image, width - 1, height / 2)[0]).toBeGreaterThan(240);
  });
});

describe("the user's pictures", () => {
  /** The red picture (400 × 300) in a frame, in the middle of a gray canvas. */
  async function renderPicture(frame: ImageFrame) {
    const picture = redPhoto();
    const layer = newLayer({ kind: 'image', image: 'picture-1', frame }, 'image', 'story');
    return drawOffscreen(
      makeOffscreenSurface(width, height),
      exportScene({
        template: {
          ...template,
          layers: [{ ...layer, transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 } }],
          background: { kind: 'color', color: '#808080' },
        },
        layerContext: {
          ...layerContext(),
          images: new Map([['picture-1', { size: { width: 400, height: 300 }, image: picture }]]),
        },
        photo: null,
        dominant: null,
      }),
    );
  }

  it('draws the picture in its frame, an even edge of white or black', async () => {
    const box = imageBox({ width: 400, height: 300 }, 'light');
    const edge = (box.width - box.picture.width) / 2;
    const frameX = Math.round(width / 2 + box.picture.x - edge / 2);
    const light = await renderPicture('light');
    expect(pixel(light, width / 2, height / 2)).toEqual([255, 0, 0, 255]);
    expect(pixel(light, frameX, height / 2)).toEqual([255, 255, 255, 255]);
    const dark = await renderPicture('dark');
    expect(pixel(dark, frameX, height / 2)).toEqual([0, 0, 0, 255]);
  });

  it('draws it alone without a frame', async () => {
    const box = imageBox({ width: 400, height: 300 }, 'none');
    const image = await renderPicture('none');
    expect(pixel(image, Math.round(width / 2 + box.picture.x + 2), height / 2)).toEqual([
      255, 0, 0, 255,
    ]);
    // Just outside it, the background, but for its soft shadow.
    expect(pixel(image, Math.round(width / 2 - box.width / 2 - 40), height / 2)).toEqual([
      128, 128, 128, 255,
    ]);
  });
});

describe('an instant photo', () => {
  it('cuts the picture square in a Polaroid frame, with the band of its caption under it', async () => {
    const picture = redPhoto();
    const layer = newLayer(
      { kind: 'image', image: 'picture-1', frame: 'light', caption: 'place' },
      'instant',
      'story',
    );
    const image = await drawOffscreen(
      makeOffscreenSurface(width, height),
      exportScene({
        template: {
          ...template,
          layers: [{ ...layer, transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 } }],
          background: { kind: 'color', color: '#808080' },
        },
        layerContext: {
          ...layerContext(),
          images: new Map([['picture-1', { size: { width: 400, height: 300 }, image: picture }]]),
        },
        photo: null,
        dominant: null,
      }),
    );
    const box = instantBox();
    const at = (x: number, y: number) =>
      pixel(image, Math.round(width / 2 + x), Math.round(height / 2 + y));
    // The wide picture fills its square, cut at its sides.
    const middle = box.picture.y + box.picture.height / 2;
    expect(at(box.picture.x + 3, middle)).toEqual([255, 0, 0, 255]);
    expect(at(box.picture.x + box.picture.width - 3, middle)).toEqual([255, 0, 0, 255]);
    // White around it, the band under it included (no fonts here: no caption drawn).
    expect(at(box.picture.x - 5, middle)).toEqual([255, 255, 255, 255]);
    expect(at(0, box.caption.y + box.caption.height / 2)).toEqual([255, 255, 255, 255]);
    expect(at(0, box.picture.y - 5)).toEqual([255, 255, 255, 255]);
  });
});
