/**
 * Builds the widget gallery with real fonts (CanvasKit): every page fits its tile, the variants
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
const activityData: EditorData = {
  mode: 'activity',
  activity,
  detail: null,
  place: null,
  zones: null,
};

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

const activitySections = () =>
  gallery.gallerySections(
    activityCatalog(activity),
    'story',
    'inter',
    contextFor(activityData),
    SCREEN,
    'Text',
  );

/** Every page of every tile. */
const pagesOf = (sections: ReturnType<typeof activitySections>) =>
  sections.flatMap((section) =>
    section.rows.flatMap((row) => row.widgets.flatMap((widget) => widget.pages)),
  );

describe('gallerySections', () => {
  it('fits every variant in its tile, above its dots, and lays tiles out in rows that fit', () => {
    const sections = activitySections();
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      for (const row of section.rows) {
        const rowWidth =
          row.widgets.length * row.width + (row.widgets.length - 1) * gallery.GALLERY_GAP;
        expect(rowWidth).toBeLessThanOrEqual(SCREEN - 2 * gallery.GALLERY_PADDING);
        for (const widget of row.widgets) {
          const room =
            widget.pages.length > 1 ? row.height - gallery.GALLERY_DOTS_HEIGHT : row.height;
          for (const page of widget.pages) {
            expect(page.prepared.width * page.scale).toBeLessThanOrEqual(row.width);
            expect(page.prepared.height * page.scale).toBeLessThanOrEqual(room);
          }
        }
      }
    }
  });

  it("draws a widget's variants at one size, page after page", () => {
    const widgets = activitySections().flatMap((section) =>
      section.rows.flatMap((row) => row.widgets),
    );
    const scalesOf = (key: string) =>
      new Set(widgets.find((widget) => widget.key === key)?.pages.map((page) => page.scale));
    // Every datum, each way it is written, compares page to page in the data tile.
    expect(scalesOf('data').size).toBe(1);
    expect(scalesOf('route').size).toBe(1);
  });

  it('keeps two data that write the same number: their names and units differ', () => {
    // 172 beats at most and 172 steps per minute (86 per leg) share the data tile.
    const keys = pagesOf(activitySections()).map((page) => page.key);
    expect(keys).toContain('metric-maxHeartRate');
    expect(keys).toContain('metric-averageCadence');
  });

  it('fills each date page with its own date: the short ones are not shrunk to the long one', () => {
    const pages = pagesOf(activitySections());
    const scaleOf = (key: string) => pages.find((page) => page.key === key)?.scale ?? 0;
    expect(scaleOf('info-activityDate-time')).toBeGreaterThan(scaleOf('info-activityDate'));
  });

  it('lays every tile two per row but the charts, which take the whole width', () => {
    const sections = gallery.gallerySections(
      activityCatalog(activity, ['elevation']),
      'story',
      'inter',
      contextFor(activityData),
      SCREEN,
      'Text',
    );
    const full = SCREEN - 2 * gallery.GALLERY_PADDING;
    const half = Math.floor((full - gallery.GALLERY_GAP) / 2);
    for (const section of sections) {
      for (const row of section.rows) {
        const wide = section.id === 'charts' || row.widgets[0].key === 'logo-allrun-lockup';
        expect(row.width).toBe(wide ? full : half);
      }
    }
  });

  it('lays the name and the monogram side by side, and both together under them, as wide', () => {
    const brand = activitySections().find((section) => section.id === 'brand');
    const rows = (brand?.rows ?? []).map((row) => ({
      keys: row.widgets.map((widget) => widget.key),
      width: row.width,
      height: row.height,
    }));
    const full = SCREEN - 2 * gallery.GALLERY_PADDING;
    const half = Math.floor((full - gallery.GALLERY_GAP) / 2);
    // As tall as the tiles over it, so the section stays even.
    const height = rows[0]?.height;
    expect(rows).toEqual([
      { keys: ['logo-allrun', 'logo-allrun-mark'], width: half, height },
      { keys: ['logo-allrun-lockup'], width: full, height },
    ]);
    // Drawn as big as the name and the monogram over it: the wider tile only gives it room.
    const scales = (brand?.rows ?? []).flatMap((row) =>
      row.widgets.map((widget) => widget.pages[0].scale),
    );
    expect(scales[2]).toBeCloseTo(scales[0]);
  });

  it('fills the tile with each date, the short ones bigger than the long ones', () => {
    const pages = pagesOf(activitySections());
    const sizeOf = (key: string) => {
      const page = pages.find((candidate) => candidate.key === key);
      return page === undefined ? 0 : page.prepared.height * page.scale;
    };
    expect(sizeOf('info-activityDate-weekday')).toBeGreaterThan(sizeOf('info-activityDate') * 1.5);
  });

  it("shows a period's name once for each way it is written: a year only reads one way", () => {
    const keysOf = (data: EditorData) =>
      pagesOf(
        gallery.gallerySections(
          data.mode === 'summary' ? summaryCatalog(data.summary, data.bucketSize) : [],
          'story',
          'inter',
          contextFor(data),
          SCREEN,
          'Text',
        ),
      )
        .map((page) => page.key)
        .filter((key) => key.startsWith('info-periodName'));
    expect(keysOf(summaryData('year'))).toEqual(['info-periodName']);
    expect(keysOf(summaryData('week')).length).toBeGreaterThan(1);
  });
});
