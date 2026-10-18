/**
 * Lays out every starter template with real fonts (CanvasKit) and checks that no widget leaves
 * the canvas or runs into another one, in every format and with awkward data.
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import { yearRange } from '@/core/dates';
import { bucketForPeriod } from '@/core/periods';
import { STARTER_TEMPLATE_IDS, starterTemplate } from '@/core/starter-templates';
import { selectActivities, summarize } from '@/core/summary';
import { CANVAS_FORMATS, type CanvasFormat } from '@/core/template';
import { es } from '@/i18n/locales/es';
import { FixtureActivitySource } from '@/sources/fixtures/fixture-source';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS } from '@/test-utils/text-context';

import type { EditorData } from './editor-data';
import type { LayerContext, PreparedLayer } from './template-scene';

// Measure with CanvasKit instead of the native module (see `template-scene.test.tsx`).
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

/** Spanish labels, the longest of the app's languages. */
function translate(key: string, values: Readonly<Record<string, string>> = {}): string {
  const text = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], es);
  if (typeof text !== 'string') {
    throw new Error(`No text for ${key}`);
  }
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replace(`{{${name}}}`, value),
    text,
  );
}

const FORMATS: readonly CanvasFormat[] = ['story', 'tall', 'portrait', 'square', 'landscape'];

/** Awkward data: a long name, no route, the big totals of a year, a year without distance. */
async function cases(): Promise<Record<string, EditorData>> {
  const source = new FixtureActivitySource({ endDate: '2026-10-18', days: 365, seed: 42 });
  const range = yearRange('2026-10-18');
  const all = selectActivities(await source.listInRange(range), range);
  const run = all.find((activity) => activity.sportFamily === 'run' && activity.routePolyline);
  const indoor = all.find((activity) => activity.routePolyline === null);
  const training = all.filter((activity) => activity.sportFamily === 'training');
  if (run === undefined || indoor === undefined || training.length === 0) {
    throw new Error('The fixtures lack a run with a route, an indoor session or training');
  }
  const year = (activities: typeof all): EditorData => ({
    mode: 'summary',
    kind: 'year',
    summary: summarize(activities, range),
    activities,
    bucketSize: bucketForPeriod('year', range),
  });
  return {
    'a run with a long name': {
      mode: 'activity',
      activity: { ...run, name: 'Tirada larga por el río con los amigos del club de atletismo' },
      detail: null,
    },
    'an activity without a route': { mode: 'activity', activity: indoor, detail: null },
    'a year': year(all),
    'a year without distance': year(training),
  };
}

/** Rectangle a prepared layer covers on its canvas, in pixels (no starter rotates a layer). */
function boxOf({ layer, width, height }: PreparedLayer, format: CanvasFormat) {
  const canvas = CANVAS_FORMATS[format];
  const { x, y, scale } = layer.transform;
  return {
    id: layer.id,
    left: x * canvas.width - (width * scale) / 2,
    right: x * canvas.width + (width * scale) / 2,
    top: y * canvas.height - (height * scale) / 2,
    bottom: y * canvas.height + (height * scale) / 2,
  };
}

/** Text boxes include the line spacing, so lines a pixel or two into each other still clear. */
const TOLERANCE = 2;

describe('starter templates', () => {
  it('keep every widget inside the canvas and clear of the others', async () => {
    const fonts = loadTestFonts(['inter', 'barlowCondensed', 'archivoBlack', 'playfairDisplay']);
    const problems: string[] = [];
    for (const [name, data] of Object.entries(await cases())) {
      const context: LayerContext = {
        data,
        fonts,
        textContext: { unit: 'km', locale: 'es', durationUnits: TEST_DURATION_UNITS },
        translate,
      };
      for (const id of STARTER_TEMPLATE_IDS) {
        for (const format of FORMATS) {
          const where = `${id}, ${format}, ${name}`;
          const canvas = CANVAS_FORMATS[format];
          const boxes = scene
            .prepareLayers(starterTemplate(id, data, format), context)
            .map((layer) => boxOf(layer, format));
          for (const box of boxes) {
            if (
              box.left < 0 ||
              box.top < 0 ||
              box.right > canvas.width ||
              box.bottom > canvas.height
            ) {
              problems.push(`${where}: ${box.id} leaves the canvas`);
            }
          }
          boxes.forEach((a, i) => {
            for (const b of boxes.slice(i + 1)) {
              const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (overlapX > TOLERANCE && overlapY > TOLERANCE) {
                problems.push(`${where}: ${a.id} overlaps ${b.id}`);
              }
            }
          });
        }
      }
    }
    expect(problems).toEqual([]);
  }, 60_000);
});
