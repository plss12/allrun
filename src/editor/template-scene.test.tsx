/**
 * Renders the scene off-screen with CanvasKit (Skia's WebAssembly build) and reads its pixels.
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
import type { Layer, Template } from '@/core/template';
import { makeActivity } from '@/test-utils/make-activity';

import { FONT_FAMILIES } from './fonts';
import type { LayerContext } from './template-scene';

// Draw with CanvasKit instead of the native module.
jest.mock('@shopify/react-native-skia/lib/commonjs/Platform', () => ({
  Platform: { OS: 'web', PixelRatio: 1 },
}));
jest.mock('@shopify/react-native-skia', () => {
  const headless = jest.requireActual('@shopify/react-native-skia/lib/commonjs/headless');
  // `Skia` only exists once CanvasKit has loaded: resolve it on each use, not on import.
  const Skia = new Proxy(
    {},
    { get: (_target, key) => Reflect.get(headless.getSkiaExports().Skia, key) },
  );
  return { ...headless, Skia };
});

// Node's own modules, typed by hand: the app's type-check has no Node globals.
const fs = jest.requireActual<{ readFileSync(path: string): Uint8Array }>('fs');
const util = jest.requireActual<{ TextDecoder: typeof TextDecoder }>('util');

let scene: typeof import('./template-scene');

// CanvasKit is loaded here rather than by Skia's jest environment, so that it lives in the same
// JavaScript realm as the test: it type-checks arrays with `instanceof`, which fails across realms.
// The scene is imported afterwards, since some modules draw with Skia as they load.
beforeAll(async () => {
  // React Native's test setup expects every React update inside act(), but Skia's off-screen
  // renderer mounts and unmounts its own React root outside it; nothing here is a component
  // under test, so the act checks would only warn about Skia.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  // Expo's test setup swaps in a UTF-8-only TextDecoder; CanvasKit decodes UTF-16 text too.
  globalThis.TextDecoder = util.TextDecoder;
  (globalThis as { CanvasKit?: unknown }).CanvasKit = await CanvasKitInit({});
  scene = jest.requireActual<typeof import('./template-scene')>('./template-scene');
});

function interFonts() {
  const { Skia } = getSkiaExports();
  const file = 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf';
  const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(
    Skia.Data.fromBytes(new Uint8Array(fs.readFileSync(file))),
  );
  if (typeface === null) {
    throw new Error(`Could not load ${file}`);
  }
  const fonts = Skia.TypefaceFontProvider.Make();
  fonts.registerFont(typeface, FONT_FAMILIES.inter);
  return fonts;
}

const activity = makeActivity({ name: 'Morning Run' });

/** Draws only the given layer of the default activity template, with no photo behind it. */
async function render(change: (layer: Layer) => Layer, id: string): Promise<SkImage> {
  const base = defaultActivityTemplate(activity, 'story');
  const layer = base.layers.find((candidate) => candidate.id === id);
  if (layer === undefined) {
    throw new Error(`No layer ${id}`);
  }
  const template: Template = { ...base, layers: [change(layer)] };
  const context: LayerContext = {
    data: { mode: 'activity', activity },
    fonts: interFonts(),
    textContext: { unit: 'km', locale: 'en' },
    translate: (key) => key,
  };
  const surface = makeOffscreenSurface(1080, 1920);
  return drawOffscreen(
    surface,
    <scene.TemplateScene
      format="story"
      layers={scene.prepareLayers(template, context)}
      background={{ kind: 'none' }}
    />,
  );
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

describe('TemplateScene opacity', () => {
  const plainText = (layer: Layer): Layer =>
    layer.kind === 'info'
      ? { ...layer, style: { ...layer.style, font: 'inter', bold: false } }
      : layer;

  it('draws an opaque text layer fully opaque', async () => {
    const image = await render((layer) => ({ ...plainText(layer), opacity: 1 }), 'name');
    expect(maxAlpha(image)).toBe(255);
  });

  it('fades text layers too, not only shapes', async () => {
    const image = await render((layer) => ({ ...plainText(layer), opacity: 0.5 }), 'name');
    expect(maxAlpha(image)).toBeGreaterThanOrEqual(124);
    expect(maxAlpha(image)).toBeLessThanOrEqual(132);
  });

  it('fades routes', async () => {
    const image = await render((layer) => ({ ...layer, opacity: 0.5 }), 'route');
    expect(maxAlpha(image)).toBeGreaterThanOrEqual(124);
    expect(maxAlpha(image)).toBeLessThanOrEqual(132);
  });
});
