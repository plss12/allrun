/**
 * Lays out AllRun's designs with the real fonts (CanvasKit) and checks that, in every format and in
 * both modes, their widgets stay on the canvas and don't run into each other, but for the photos a
 * design overlaps on purpose.
 *
 * @jest-environment node
 */
import { READY_DESIGN_IDS, type ReadyDesignId } from '@/core/designs';
import { isPhotoSlot, mountBox, SAMPLE_IMAGE } from '@/core/image-layer';
import { CANVAS_FORMATS, type CanvasFormat, FONT_IDS } from '@/core/template';
import { makeActivity } from '@/test-utils/make-activity';
import { makeSummary } from '@/test-utils/make-summary';
import { loadSceneBeforeAll } from '@/test-utils/scene';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';
import { es } from '@/i18n/locales/es';

import type { EditorData } from './editor-data';
import { mountCaption } from './mount-caption';
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

const scene = loadSceneBeforeAll();

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

const FORMATS = Object.keys(CANVAS_FORMATS) as CanvasFormat[];
const textContext = {
  unit: 'km',
  locale: 'es',
  durationUnits: TEST_DURATION_UNITS,
  unitLabel: testUnitLabel,
} as const;

const activity: EditorData = {
  mode: 'activity',
  activity: makeActivity(),
  detail: null,
  place: null,
} as unknown as EditorData;
const summary = makeSummary();
const period: EditorData = {
  mode: 'summary',
  kind: 'week',
  current: true,
  summary,
  activities: [],
  families: [],
} as unknown as EditorData;

function contextOf(data: EditorData): LayerContext {
  return {
    data,
    fonts: loadTestFonts(FONT_IDS),
    textContext,
    translate: translate as LayerContext['translate'],
  };
}

describe.each(READY_DESIGN_IDS)('%s', (id: ReadyDesignId) => {
  describe.each(FORMATS)('in %s', (format) => {
    it.each([
      ['an activity', activity],
      ['a period', period],
    ])('stays on the canvas and clear of itself with %s', (_name, data) => {
      const context = contextOf(data);
      const { readyTemplate } =
        jest.requireActual<typeof import('./ready-design')>('./ready-design');
      const template = readyTemplate(id, context, format);
      const canvas = CANVAS_FORMATS[format];
      const boxes = scene()
        .prepareLayers(template, context)
        .map(({ layer, width, height }) => {
          const halfWidth = (width * layer.transform.scale) / 2;
          const halfHeight = (height * layer.transform.scale) / 2;
          const x = layer.transform.x * canvas.width;
          const y = layer.transform.y * canvas.height;
          return {
            id: layer.id,
            slot: isPhotoSlot(layer),
            left: x - halfWidth,
            right: x + halfWidth,
            top: y - halfHeight,
            bottom: y + halfHeight,
          };
        });
      expect(boxes.length).toBe(template.layers.length);
      for (const box of boxes) {
        expect([box.id, box.left]).toEqual([box.id, expect.any(Number)]);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(canvas.width);
        expect(box.bottom).toBeLessThanOrEqual(canvas.height);
      }
      for (const a of boxes) {
        for (const b of boxes) {
          // Only two photos may overlap: Message's, on purpose.
          if (a.id < b.id && !(a.slot && b.slot)) {
            const clear =
              a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
            expect([a.id, b.id, clear]).toEqual([a.id, b.id, true]);
          }
        }
      }
    });
  });
});

describe('a design with no photo chosen', () => {
  it('draws nothing in the window in the image, and a sign on the canvas', () => {
    const context = contextOf(activity);
    const { template } = jest
      .requireActual<typeof import('@/core/designs')>('@/core/designs')
      .readyDesign('filmFrame', { mode: 'activity', activity: makeActivity() }, 'story');
    const [slot] = template.layers;
    expect(isPhotoSlot(slot) && slot.image).toBe(SAMPLE_IMAGE);
    const box = mountBox('filmFrame');
    const [prepared] = scene().prepareLayers(template, { ...context, emptySlots: 'blank' });
    expect([prepared.width, prepared.height]).toEqual([box.width, box.height]);
  });
});

describe('mountCaption', () => {
  it('writes the sport, start time and three data on a film frame', () => {
    const { sides, marks } = mountCaption('filmFrame', activity, textContext, translate as never);
    const [left, right] = sides;
    expect(left.texts).toEqual([es.widgets.tower.sports[makeActivity().sportModality]]);
    expect(right.texts).toHaveLength(3);
    expect(marks.bottomRight).toBe('ALLRUN');
  });

  it('marks a film with its date and time over its place, never a film of its own', () => {
    const { marks } = mountCaption('filmFrame', activity, textContext, translate as never);
    expect(marks.topLeft).toMatch(/^\d{2}-\d{2}-\d{4}$/);
    expect(marks.topRight).toMatch(/^\d{1,2}:\d{2}/);
    expect(marks.bottomLeft).toBeNull();
    const there = {
      ...activity,
      place: { city: 'Andújar', region: 'Andalucía', country: 'España' },
    };
    expect(
      mountCaption('filmFrame', there as EditorData, textContext, translate as never).marks
        .bottomLeft,
    ).toBe('Andújar');
  });

  it('writes the date and one line on a negative, with the date as a camera stamps it', () => {
    const [left, right] = mountCaption(
      'lightNegative',
      activity,
      textContext,
      translate as never,
    ).sides;
    expect(left.texts).toHaveLength(2);
    expect(left.texts[0]).toBe('ALLRUN');
    expect(left.texts[1]).toMatch(/^\d{2}-\d{2}-\d{4} /);
    expect(right.texts).toHaveLength(1);
    expect(right.texts[0]).toContain('·');
  });

  it('writes the name and totals of a period, without ever a lone "m" for minutes', () => {
    const [left, right] = mountCaption('filmFrame', period, textContext, translate as never).sides;
    expect(left.texts[0]).toContain('▸');
    expect(right.texts.length).toBeGreaterThan(0);
    for (const text of right.texts) {
      expect(text).not.toMatch(/\d+m\b/);
    }
  });
});
