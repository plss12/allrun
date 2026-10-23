/**
 * Changes a widget's font with real fonts (CanvasKit) and checks it keeps the room it took.
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import { newLayer } from '@/core/default-layout';
import { setBlockOptions, setTextStyle } from '@/core/layer-style';
import type { FontId, Template } from '@/core/template';
import { es } from '@/i18n/locales/es';
import { makeActivity } from '@/test-utils/make-activity';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import type { LayerContext } from './template-scene';

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

let fontChange: typeof import('./font-change');
let scene: typeof import('./template-scene');

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.TextDecoder = util.TextDecoder;
  (globalThis as { CanvasKit?: unknown }).CanvasKit = await CanvasKitInit({});
  fontChange = jest.requireActual<typeof import('./font-change')>('./font-change');
  scene = jest.requireActual<typeof import('./template-scene')>('./template-scene');
});

function translate(key: string): string {
  const text = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], es);
  if (typeof text !== 'string') {
    throw new Error(`No text for ${key}`);
  }
  return text;
}

const activity = makeActivity({ sportType: 'Run', distanceMeters: 11_340 });

const context = (): LayerContext => ({
  data: { mode: 'activity', activity, detail: null, place: null, zones: null },
  fonts: loadTestFonts(['inter', 'anton', 'unbounded', 'bowlbyOneSC']),
  textContext: {
    unit: 'km',
    locale: 'es',
    durationUnits: TEST_DURATION_UNITS,
    unitLabel: testUnitLabel,
  },
  translate,
});

/** The room the only layer of `template` takes on the canvas, its scale applied. */
function area(template: Template, layerContext: LayerContext): number {
  const [prepared] = scene.prepareLayers(template, layerContext);
  const { scale } = template.layers[0].transform;
  return prepared.width * scale * prepared.height * scale;
}

describe('keepingArea', () => {
  it.each([
    ['a big datum', 'activityBlock', 'unbounded', 'anton'],
    ['a big datum', 'activityBlock', 'bowlbyOneSC', 'inter'],
    ['a datum', 'metric', 'anton', 'unbounded'],
  ] as const)(
    'keeps %s covering as much of the canvas in another font',
    (_name, kind, from, to) => {
      const layerContext = context();
      const layer =
        kind === 'activityBlock'
          ? newLayer(
              { kind, block: { design: 'bigTrio', layout: 'wide', top: 'main' } },
              'widget',
              'story',
            )
          : newLayer({ kind, metric: 'distance' }, 'widget', 'story');
      const base: Template = {
        version: 1,
        id: 't',
        mode: 'activity',
        format: 'story',
        layers: [layer],
      };
      const restyle = (font: FontId) => (template: Template) =>
        kind === 'activityBlock'
          ? setBlockOptions(template, 'widget', { font })
          : setTextStyle(template, 'widget', { font });
      const start = restyle(from)(base);
      const plain = restyle(to)(start);
      const kept = fontChange.keepingArea(restyle(to), 'widget', layerContext)(start);
      // Without it, the widget's room changes a lot; with it, it stays (within rounding).
      expect(Math.abs(area(plain, layerContext) / area(start, layerContext) - 1)).toBeGreaterThan(
        0.15,
      );
      expect(area(kept, layerContext) / area(start, layerContext)).toBeCloseTo(1, 1);
      expect(kept.layers[0].transform).toMatchObject({ x: 0.5, y: 0.5, rotation: 0 });
    },
  );

  it('changes nothing when the font is the same', () => {
    const layer = newLayer({ kind: 'metric', metric: 'distance' }, 'widget', 'story');
    const base: Template = {
      version: 1,
      id: 't',
      mode: 'activity',
      format: 'story',
      layers: [layer],
    };
    const same = (template: Template) => template;
    expect(fontChange.keepingArea(same, 'widget', context())(base)).toBe(base);
  });
});
