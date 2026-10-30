/**
 * Builds the widget gallery with real fonts (CanvasKit): every page fits its tile, the variants
 * of a widget compare at one size, and variants that read the same are shown once.
 *
 * @jest-environment node
 */
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

import { weekRange, yearRange } from '@/core/dates';
import {
  activityCatalog,
  creativeTheme,
  isCreativeWildcard,
  rowPartner,
  summaryCatalog,
} from '@/core/layer-catalog';
import { summarize } from '@/core/summary';
import { generateStravaDetail } from '@/sources/fixtures/detail';
import { parseStravaDetail } from '@/sources/strava/detail';
import { makeActivity } from '@/test-utils/make-activity';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import type { EditorData, SummaryData } from './editor-data';
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

function summaryData(kind: 'week' | 'year'): SummaryData {
  const range = kind === 'week' ? weekRange('2026-10-14') : yearRange('2026-10-14');
  const activities = [makeActivity({ localDate: '2026-10-13' })];
  return {
    mode: 'summary',
    kind,
    summary: summarize(activities, range),
    activities,
    bucketSize: kind === 'week' ? 'day' : 'month',
    families: [],
    current: false,
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

/** The keys of each row of a section's tiles. */
const rowKeys = (sections: ReturnType<typeof activitySections>, id: string) =>
  sections
    .find((section) => section.id === id)
    ?.rows.map((row) => row.widgets.map((widget) => widget.key)) ?? [];

describe('gallerySections', () => {
  /** The rows of creative tiles of an activity, with its place, splits and laps or not. */
  const activityRows = (withPlace: boolean, withDetail: boolean) => {
    const detail = generateStravaDetail(activity, 1);
    const parsed = parseStravaDetail(JSON.parse(JSON.stringify(detail.streams)), detail.detailed);
    const data: EditorData = {
      mode: 'activity',
      activity,
      detail: withDetail ? parsed : null,
      place: withPlace ? { city: 'Madrid', region: 'Madrid', country: 'España' } : null,
      zones: null,
    };
    return rowKeys(
      gallery.gallerySections(
        activityCatalog(
          activity,
          withDetail ? ['splits'] : [],
          withPlace,
          false,
          withDetail && parsed.laps.length > 1,
        ),
        'story',
        'inter',
        contextFor(data),
        SCREEN,
        'Text',
      ),
      'creative',
    );
  };
  const summaryRows = (kind: 'week' | 'year') =>
    rowKeys(
      gallery.gallerySections(
        summaryCatalog(summaryData(kind).summary, kind === 'week' ? 'day' : 'month'),
        'story',
        'inter',
        contextFor(summaryData(kind)),
        SCREEN,
        'Text',
      ),
      'creative',
    );

  it.each([
    ['an activity without its place or splits', () => activityRows(false, false)],
    ['an activity with its place', () => activityRows(true, false)],
    ['an activity with its place, splits and laps', () => activityRows(true, true)],
    ['a week', () => summaryRows('week')],
    ['a year', () => summaryRows('year')],
  ] as const)(
    'lays the creative tiles of %s by themes, every pair in a row',
    (_name, rowsOf) => {
      const rows = rowsOf();
      const keys = rows.flat();
      // Every tile has its theme, and no row mixes two, but for a wildcard gone up.
      for (const key of keys) {
        expect(creativeTheme(key)).not.toBeNull();
      }
      for (const row of rows) {
        const own = row.filter((key) => !isCreativeWildcard(key) || row.length === 1);
        expect(new Set((own.length === 0 ? row : own).map(creativeTheme)).size).toBe(1);
      }
      // Themes come one after another, never back.
      const themes = rows.map((row) => creativeTheme(row[0]) ?? -1);
      expect(themes).toEqual([...themes].sort((a, b) => a - b));
      // A pair offered whole always shares its row.
      for (const key of keys) {
        const partner = rowPartner(key);
        if (partner !== null && keys.includes(partner)) {
          expect(rows).toContainEqual([key, partner]);
        }
      }
      // A tile is alone only at the end of its theme.
      rows.forEach((row, i) => {
        if (row.length === 1 && i + 1 < rows.length) {
          expect(creativeTheme(rows[i + 1][0])).not.toBe(creativeTheme(row[0]));
        }
      });
    },
    60_000,
  );

  it('keeps the camera among the apps, and takes the boarding pass up beside a tile alone', () => {
    // Without its place, the badge waits for the camera; the pass, with no one alone, alone.
    const plain = activityRows(false, false);
    expect(plain).toContainEqual(['block-verified', 'block-camera']);
    expect(plain).toContainEqual(['block-boardingPass']);
    // The user's pictures go last, the photo and the instant photo together: a wildcard goes up
    // beside a tile, never down.
    expect(plain.at(-1)).toEqual(['image', 'image-instant']);
    // With it, the camera is left alone at the end of the apps: the pass goes up beside it.
    expect(activityRows(true, false)).toContainEqual(['block-camera', 'block-boardingPass']);
    // With its splits, the camera has its note, and the splits are left alone among the races.
    const full = activityRows(true, true);
    expect(full).toContainEqual(['block-camera', 'block-notes']);
    expect(full).toContainEqual(['block-splits', 'block-boardingPass']);
  }, 60_000);

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

  it('draws each page of a creative widget as big as it fits, none small beside a bigger one', () => {
    // An interval session: its laps' board and timing sheet differ a lot in size.
    const { streams, detailed } = generateStravaDetail(activity, 1);
    const detail = parseStravaDetail(JSON.parse(JSON.stringify(streams)), detailed);
    const sections = gallery.gallerySections(
      activityCatalog(activity, ['splits'], false, false, true),
      'story',
      'inter',
      contextFor({ ...activityData, detail }),
      SCREEN,
      'Text',
    );
    const creative = sections.find((section) => section.id === 'creative');
    const tiles = (creative?.rows ?? []).flatMap((row) =>
      row.widgets.map((widget) => ({ row, widget })),
    );
    expect(tiles.some(({ widget }) => widget.key === 'block-laps')).toBe(true);
    for (const { row, widget } of tiles) {
      const room = widget.pages.length > 1 ? row.height - gallery.GALLERY_DOTS_HEIGHT : row.height;
      const filled = widget.pages.map((page) =>
        Math.max(
          (page.prepared.width * page.scale) / row.width,
          (page.prepared.height * page.scale) / room,
        ),
      );
      for (const share of filled) {
        expect(share).toBeCloseTo(filled[0], 3);
      }
    }
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

  it('lays every tile two per row but the charts and a creative tile alone in its theme, which take the whole width', () => {
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
        const wide =
          section.id === 'charts' ||
          row.widgets[0].key === 'logo-allrun-lockup' ||
          (section.id === 'creative' && row.widgets.length === 1);
        expect(row.width).toBe(wide ? full : half);
      }
    }
  });

  it('draws each page of a data widget as big as it fits, its own size', () => {
    const data = activitySections().find((section) => section.id === 'data');
    const pages = (data?.rows ?? []).flatMap((row) =>
      row.widgets.flatMap((widget) => widget.pages),
    );
    const scaleOf = (key: string) => pages.find((page) => page.key === key)?.scale ?? 0;
    // The weekday small over the big datum is not shrunk to the stretched page's height: it was
    // drawn at the same scale as it.
    expect(scaleOf('block-bigSolo-smallDay')).toBeGreaterThan(
      scaleOf('block-bigSolo-stretchedDay'),
    );
  });

  it('gives a row of tall data widgets more height, up to square tiles', () => {
    const data = activitySections().find((section) => section.id === 'data');
    const rows = data?.rows ?? [];
    const base = Math.round(rows[0].width * 0.6);
    const heightOf = (key: string) =>
      rows.find((row) => row.widgets.some((widget) => widget.key === key))?.height ?? 0;
    // Every row between the usual tiles and square ones; the route over the data, taller.
    for (const row of rows) {
      expect(row.height).toBeGreaterThanOrEqual(base);
      expect(row.height).toBeLessThanOrEqual(row.width);
    }
    expect(heightOf('block-bigRoute')).toBeGreaterThan(base);
  });

  it("gives the user's pictures a row as tall as square tiles, the photo over its hint", () => {
    const creative = activitySections().find((section) => section.id === 'creative');
    const row = (creative?.rows ?? []).find((candidate) =>
      candidate.widgets.some((widget) => widget.key === 'image'),
    );
    const full = SCREEN - 2 * gallery.GALLERY_PADDING;
    const half = Math.floor((full - gallery.GALLERY_GAP) / 2);
    expect(row?.height).toBe(half);
    // Room for the dots and the hint over them, under the sample photo.
    const room = half - gallery.GALLERY_DOTS_HEIGHT - gallery.GALLERY_HINT_HEIGHT;
    for (const page of row?.widgets[0].pages ?? []) {
      expect(page.prepared.height * page.scale).toBeLessThanOrEqual(room);
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
