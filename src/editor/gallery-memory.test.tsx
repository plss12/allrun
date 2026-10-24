/**
 * The widget gallery's native memory: every text it lays out is a native paragraph, each telling
 * Hermes it holds a megabyte, which its garbage collector frees late, so opening the gallery a few
 * times used to pile them up until iOS closed the app: a gallery's paragraphs are freed all at
 * once when it is let go. Its builders, made like the phone's (which have no `dispose`, unlike
 * CanvasKit's), are left to the garbage collector.
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import { activityCatalog } from '@/core/layer-catalog';
import { makeActivity } from '@/test-utils/make-activity';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import type { LayerContext } from './template-scene';

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

let gallery: typeof import('./widget-gallery');

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.TextDecoder = util.TextDecoder;
  (globalThis as { CanvasKit?: unknown }).CanvasKit = await CanvasKitInit({});
  gallery = jest.requireActual<typeof import('./widget-gallery')>('./widget-gallery');
});

/** How many native builders and paragraphs were made, and how many paragraphs freed. */
interface Counts {
  builders: number;
  paragraphs: number;
  freedParagraphs: number;
}

/** A native object's `dispose`, counted in `count` when called. */
function countDispose(object: { dispose: () => void }, count: () => void): void {
  const dispose = object.dispose.bind(object);
  object.dispose = () => {
    count();
    dispose();
  };
}

/**
 * `run`'s result, and the native paragraph builders and paragraphs made while it ran: Skia's
 * factory is wrapped meanwhile, so each builder and paragraph counts when made, and each paragraph
 * when freed, also after `run` returns. A builder has no `dispose`, as on the phone (only
 * CanvasKit's has one): calling it throws, as it crashed the app.
 */
function counting<T>(run: () => T): { readonly value: T; readonly counts: Counts } {
  const headless = jest.requireActual('@shopify/react-native-skia/lib/commonjs/headless');
  const factory = headless.getSkiaExports().Skia.ParagraphBuilder as {
    Make: (...args: unknown[]) => {
      dispose?: () => void;
      build: () => { dispose: () => void };
    };
  };
  const counts: Counts = { builders: 0, paragraphs: 0, freedParagraphs: 0 };
  const make = factory.Make;
  factory.Make = (...args) => {
    const builder = make.apply(factory, args);
    counts.builders++;
    builder.dispose = undefined;
    const build = builder.build.bind(builder);
    builder.build = () => {
      const paragraph = build();
      counts.paragraphs++;
      countDispose(paragraph, () => counts.freedParagraphs++);
      return paragraph;
    };
    return builder;
  };
  try {
    return { value: run(), counts };
  } finally {
    factory.Make = make;
  }
}

const activity = makeActivity({ sportType: 'Run', movingTimeSeconds: 6030 });

const contextOf = (): LayerContext => ({
  data: { mode: 'activity', activity, detail: null, place: null, zones: null },
  fonts: loadTestFonts(['inter']),
  textContext: {
    unit: 'km',
    locale: 'es',
    durationUnits: TEST_DURATION_UNITS,
    unitLabel: testUnitLabel,
  },
  translate: (key) => key,
});

/** The gallery of an activity, on an iPhone's width. */
const build = () =>
  gallery.buildGallery(activityCatalog(activity), 'story', 'inter', contextOf(), 393, 'Text');

describe('buildGallery', () => {
  it("builds with the phone's builders, which have no dispose", () => {
    const { value, counts } = counting(build);
    expect(counts.builders).toBeGreaterThan(100);
    value.dispose();
  });

  it("frees all of a gallery's paragraphs once it is let go, those it draws not before", () => {
    const { value, counts } = counting(build);
    expect(value.sections.length).toBeGreaterThan(0);
    // Only those just measured (a text's words, a text before it was cut short) go before.
    const drawn = counts.paragraphs - counts.freedParagraphs;
    expect(drawn).toBeGreaterThan(counts.paragraphs * 0.9);
    value.dispose();
    expect(counts.freedParagraphs).toBe(counts.paragraphs);
  });
});
