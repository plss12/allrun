/**
 * Builds the widget gallery with real fonts (CanvasKit): every tile fits its widget, the variants
 * of a widget compare at one size, and variants that read the same are shown once.
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import { weekRange, yearRange } from '@/core/dates';
import { activityCatalog, summaryCatalog } from '@/core/layer-catalog';
import { summarize } from '@/core/summary';
import { makeActivity } from '@/test-utils/make-activity';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import type { EditorData } from './editor-data';
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

/** An iPhone's width, in points. */
const SCREEN = 393;

function contextFor(data: EditorData): LayerContext {
  return {
    data,
    fonts: loadTestFonts(['inter']),
    textContext: {
      unit: 'km',
      locale: 'es',
      durationUnits: TEST_DURATION_UNITS,
      unitLabel: testUnitLabel,
    },
    translate: (key) => key,
  };
}

const activity = makeActivity({ sportType: 'Run', movingTimeSeconds: 6030 });
const activityData: EditorData = { mode: 'activity', activity, detail: null };

function summaryData(kind: 'week' | 'year'): EditorData {
  const range = kind === 'week' ? weekRange('2026-10-14') : yearRange('2026-10-14');
  const activities = [makeActivity({ localDate: '2026-10-13' })];
  return {
    mode: 'summary',
    kind,
    summary: summarize(activities, range),
    activities,
    bucketSize: kind === 'week' ? 'day' : 'month',
  };
}

describe('gallerySections', () => {
  it('fits every widget in its tile, and lays tiles out in rows that fit the screen', () => {
    const sections = gallery.gallerySections(
      activityCatalog(activity),
      'story',
      'inter',
      contextFor(activityData),
      SCREEN,
      'Text',
    );
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      for (const row of section.data) {
        const rowWidth = row.length * section.width + (row.length - 1) * gallery.GALLERY_GAP;
        expect(rowWidth).toBeLessThanOrEqual(SCREEN - 2 * gallery.GALLERY_PADDING);
        for (const tile of row) {
          expect(tile.prepared.width * tile.scale).toBeLessThanOrEqual(section.width);
          expect(tile.prepared.height * tile.scale).toBeLessThanOrEqual(section.height);
        }
      }
    }
  });

  it('draws the variants of a widget at one size', () => {
    const sections = gallery.gallerySections(
      activityCatalog(activity),
      'story',
      'inter',
      contextFor(activityData),
      SCREEN,
      'Text',
    );
    const tiles = sections.flatMap((section) => section.data.flat());
    const scalesOf = (prefix: string) =>
      new Set(tiles.filter((tile) => tile.key.startsWith(prefix)).map((tile) => tile.scale));
    expect(scalesOf('metric-distance').size).toBe(1);
    expect(scalesOf('metric-movingTime').size).toBe(1);
  });

  it('fills each date tile with its own date: the short ones are not shrunk to the long one', () => {
    const tiles = gallery
      .gallerySections(
        activityCatalog(activity),
        'story',
        'inter',
        contextFor(activityData),
        SCREEN,
        'Text',
      )
      .flatMap((section) => section.data.flat());
    const scaleOf = (key: string) => tiles.find((tile) => tile.key === key)?.scale ?? 0;
    expect(scaleOf('info-activityDate-time')).toBeGreaterThan(scaleOf('info-activityDate'));
  });

  it('puts the dark and colored logos on a light tile, and the rest on a dark one', () => {
    const tiles = gallery
      .gallerySections(
        activityCatalog(activity),
        'story',
        'inter',
        contextFor(activityData),
        SCREEN,
        'Text',
      )
      .flatMap((section) => section.data.flat());
    const backgroundOf = (key: string) => tiles.find((tile) => tile.key === key)?.background;
    expect(backgroundOf('logo-allrun')).toBe('dark');
    expect(backgroundOf('logo-allrun-mark-dark')).toBe('light');
    expect(backgroundOf('logo-allrun-color')).toBe('light');
    expect(backgroundOf('metric-distance')).toBe('dark');
  });

  it("shows a period's name once for each way it is written: a year only reads one way", () => {
    const keysOf = (data: EditorData) =>
      gallery
        .gallerySections(
          data.mode === 'summary' ? summaryCatalog(data.summary, data.bucketSize) : [],
          'story',
          'inter',
          contextFor(data),
          SCREEN,
          'Text',
        )
        .flatMap((section) => section.data.flat())
        .map((tile) => tile.key)
        .filter((key) => key.startsWith('info-periodName'));
    expect(keysOf(summaryData('year'))).toEqual(['info-periodName']);
    expect(keysOf(summaryData('week')).length).toBeGreaterThan(1);
  });
});
