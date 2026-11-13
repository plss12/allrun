/**
 * The big datum with its route on a map (ADR 021): drawn off-screen with real fonts (CanvasKit),
 * the map in a rounded square as wide as the big datum, in the map's own colors, and nothing
 * outside the size it measures; the route alone until the map has loaded.
 *
 * @jest-environment node
 */
import {
  drawOffscreen,
  Group,
  makeOffscreenSurface,
} from '@shopify/react-native-skia/lib/commonjs/headless';

import { type LocalDate, monthRange } from '@/core/dates';
import { newLayer } from '@/core/default-layout';
import { planMap } from '@/core/map-drawing';
import { MAP_COLORS, MAP_REFERENCE_WIDTH, paintFor, type MapPaint } from '@/core/map-style';
import { bucketForPeriod } from '@/core/periods';
import { encodePolyline } from '@/core/polyline';
import { summarize } from '@/core/summary';
import { newTemplate } from '@/core/template';
import { BLOCK_FONTS, RUN, translate } from '@/test-utils/activity-blocks';
import { makeActivity } from '@/test-utils/make-activity';
import { loadSceneBeforeAll } from '@/test-utils/scene';
import { alphaOutside, DRAWN_ALPHA } from '@/test-utils/skia-bounds';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { SUMMARY_TEXT_CONTEXT } from '@/test-utils/summary-blocks';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import { periodPlacesOf, type SummaryData } from './editor-data';
import type { PreparedLayer } from './template-scene';
import { type WidgetMap, widgetMapPoints, widgetMapViewport } from './widget-map';

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

const scene = loadSceneBeforeAll();

const WATER = paintFor('water', { class: 'lake' }, 'polygon') as MapPaint;

/** The tiles of RUN's widget map, each all water. */
function waterMap(): WidgetMap {
  const points = widgetMapPoints(RUN);
  if (points === null) {
    throw new Error('The run needs a route');
  }
  const { tiles } = planMap(widgetMapViewport(points, MAP_REFERENCE_WIDTH));
  return {
    tiles: tiles.map((tile) => ({
      tile,
      features: {
        extent: 4096,
        groups: [{ paint: WATER, rings: [[0, 0, 4096, 0, 4096, 4096, 0, 4096]] }],
      },
    })),
  };
}

function prepared(
  map: WidgetMap | null | undefined,
  layout: 'map' | 'route' = 'map',
): PreparedLayer {
  const layer = newLayer(
    { kind: 'activityBlock', block: { design: 'bigPair', layout, top: 'main' } },
    'map',
    'story',
  );
  const [widget] = scene().prepareLayers(
    newTemplate({ id: 'map', mode: 'activity', format: 'story', layers: [layer] }),
    {
      data: { mode: 'activity', activity: RUN, detail: null, place: null, zones: null, map },
      fonts: loadTestFonts(BLOCK_FONTS),
      textContext: {
        unit: 'km',
        locale: 'es',
        durationUnits: TEST_DURATION_UNITS,
        unitLabel: testUnitLabel,
      },
      translate,
    },
  );
  return widget;
}

/** The color of the widget's pixel at (x, y) of its own box, as #RRGGBB, and its alpha. */
async function pixelAt(widget: PreparedLayer, x: number, y: number) {
  const width = Math.ceil(widget.width);
  const height = Math.ceil(widget.height);
  const image = await drawOffscreen(
    makeOffscreenSurface(width, height),
    <Group transform={[{ translateX: widget.width / 2 }, { translateY: widget.height / 2 }]}>
      {widget.content}
    </Group>,
  );
  const pixels = image.readPixels(0, 0, image.getImageInfo());
  if (pixels === null) {
    throw new Error('Could not read the pixels');
  }
  const at = (Math.round(y) * width + Math.round(x)) * 4;
  const hex = (value: number) => value.toString(16).padStart(2, '0').toUpperCase();
  return {
    color: `#${hex(pixels[at])}${hex(pixels[at + 1])}${hex(pixels[at + 2])}`,
    alpha: pixels[at + 3],
  };
}

describe('the big datum on its map', () => {
  it('draws the map in a rounded square as wide as the widget, over the data', async () => {
    const widget = prepared(waterMap());
    // Over the route's room at the square's top, halfway across: the map's water.
    expect(await pixelAt(widget, widget.width / 2, widget.width * 0.04)).toEqual({
      color: MAP_COLORS.water,
      alpha: 255,
    });
    // The square's corner is rounded off.
    expect((await pixelAt(widget, 0.5, 0.5)).alpha).toBe(0);
    // Under the square, the data on the photo: nothing of the map.
    expect((await pixelAt(widget, 1, widget.width + 4)).alpha).toBe(0);
  }, 60_000);

  it('draws nothing outside the size it measures', async () => {
    expect(await alphaOutside(prepared(waterMap()))).toBeLessThanOrEqual(DRAWN_ALPHA);
  }, 60_000);

  it('is the route alone until its map has loaded', () => {
    const route = prepared(null, 'route');
    for (const map of [null, undefined]) {
      const waiting = prepared(map);
      expect([waiting.width, waiting.height]).toEqual([route.width, route.height]);
    }
    expect(prepared(waterMap()).height).toBeGreaterThan(route.height);
  }, 60_000);
});

describe('the route on its map', () => {
  const routeLayer = (map: WidgetMap | null | undefined): PreparedLayer => {
    const layer = newLayer({ kind: 'route', map: true }, 'route', 'story');
    const [route] = scene().prepareLayers(
      newTemplate({ id: 'route', mode: 'activity', format: 'story', layers: [layer] }),
      {
        data: { mode: 'activity', activity: RUN, detail: null, place: null, zones: null, map },
        fonts: loadTestFonts(['inter']),
        textContext: {
          unit: 'km',
          locale: 'es',
          durationUnits: TEST_DURATION_UNITS,
          unitLabel: testUnitLabel,
        },
        translate,
      },
    );
    return route;
  };

  it('is a rounded square of the map with the route over it', async () => {
    const route = routeLayer(waterMap());
    expect(route.width).toBe(route.height);
    expect(await pixelAt(route, route.width / 2, route.width * 0.04)).toEqual({
      color: MAP_COLORS.water,
      alpha: 255,
    });
    expect((await pixelAt(route, 0.5, 0.5)).alpha).toBe(0);
    expect(await alphaOutside(route)).toBeLessThanOrEqual(DRAWN_ALPHA);
  }, 60_000);

  it('is the line alone until its map has loaded', () => {
    const waiting = routeLayer(null);
    expect(waiting.width).not.toBe(waiting.height);
    expect(routeLayer(undefined).width).toBe(waiting.width);
  });
});

describe("a big datum's route", () => {
  /** How many pixels across the route's line takes on the row halfway down its box. */
  async function lineCrossing(widget: PreparedLayer, routeHeight: number): Promise<number> {
    const width = Math.ceil(widget.width);
    const height = Math.ceil(widget.height);
    const image = await drawOffscreen(
      makeOffscreenSurface(width, height),
      <Group transform={[{ translateX: widget.width / 2 }, { translateY: widget.height / 2 }]}>
        {widget.content}
      </Group>,
    );
    const pixels = image.readPixels(0, 0, image.getImageInfo());
    if (pixels === null) {
      throw new Error('Could not read the pixels');
    }
    const y = Math.round(routeHeight / 2);
    let count = 0;
    for (let x = 0; x < width; x++) {
      count += pixels[(y * width + x) * 4 + 3] > 128 ? 1 : 0;
    }
    return count;
  }

  it('is as heavy for its size in a narrow letter as in a wide one', async () => {
    const widget = (font: 'unbounded' | 'bigShoulders') => {
      const layer = newLayer(
        { kind: 'activityBlock', block: { design: 'bigPair', layout: 'route', top: 'main' } },
        font,
        'story',
      );
      if (layer.kind !== 'activityBlock') {
        throw new Error('Expected a mixed widget');
      }
      const [prepared] = scene().prepareLayers(
        newTemplate({
          id: font,
          mode: 'activity',
          format: 'story',
          layers: [{ ...layer, style: { ...layer.style, font } }],
        }),
        {
          data: { mode: 'activity', activity: RUN, detail: null, place: null, zones: null },
          fonts: loadTestFonts(BLOCK_FONTS),
          textContext: {
            unit: 'km',
            locale: 'es',
            durationUnits: TEST_DURATION_UNITS,
            unitLabel: testUnitLabel,
          },
          translate,
        },
      );
      return prepared;
    };
    const wide = widget('unbounded');
    const narrow = widget('bigShoulders');
    // The route's box takes the top of the widget, 0.9 of its width tall (see `BIG_HEADER`).
    const share = async (prepared: PreparedLayer) =>
      (await lineCrossing(prepared, prepared.width * 0.9 * 0.5)) / prepared.width;
    expect(narrow.width).toBeLessThan(wide.width * 0.6);
    const ratio = (await share(narrow)) / (await share(wide));
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.25);
  }, 60_000);
});

describe("a period's place on its map", () => {
  it('draws the routes of each place on its map, within its size, the routes alone before', async () => {
    const range = monthRange('2026-10-01');
    const near = (lat: number, lng: number, id: string, localDate: LocalDate) =>
      makeActivity({
        id,
        localDate,
        routePolyline: encodePolyline([
          [lat, lng],
          [lat + 0.01, lng + 0.01],
        ]),
      });
    const activities = [
      near(40.41, -3.7, 'm1', '2026-10-02'),
      near(40.412, -3.701, 'm2', '2026-10-09'),
      near(41.38, 2.19, 'b1', '2026-10-15'),
    ];
    const data: SummaryData = {
      mode: 'summary',
      kind: 'month',
      summary: summarize(activities, range),
      activities,
      bucketSize: bucketForPeriod('month', range),
      families: [],
      current: false,
      placeNames: ['Madrid', null],
    };
    const places = periodPlacesOf(data);
    expect(places.map((place) => place.activities.length)).toEqual([2, 1]);
    const water = (rank: number): WidgetMap => ({
      tiles: planMap(widgetMapViewport(places[rank].routes.flat(), MAP_REFERENCE_WIDTH)).tiles.map(
        (tile) => ({
          tile,
          features: {
            extent: 4096,
            groups: [{ paint: WATER, rings: [[0, 0, 4096, 0, 4096, 4096, 0, 4096]] }],
          },
        }),
      ),
    });
    const prepare = (shown: SummaryData) =>
      scene().prepareLayers(
        newTemplate({
          id: 'places',
          mode: 'summary',
          format: 'story',
          layers: ([0, 1, 2] as const).map((place) =>
            newLayer(
              { kind: 'summaryBlock', block: { design: 'periodRouteData', count: 2, place } },
              `place-${place}`,
              'story',
            ),
          ),
        }),
        {
          data: shown,
          fonts: loadTestFonts(BLOCK_FONTS),
          textContext: SUMMARY_TEXT_CONTEXT,
          translate,
        },
      );
    const waiting = prepare(data);
    // Two places: the third rank draws nothing.
    expect(waiting).toHaveLength(2);
    const mapped = prepare({ ...data, placeMaps: [water(0), water(1)] });
    expect(mapped).toHaveLength(2);
    for (const [i, widget] of mapped.entries()) {
      expect(widget.height).toBeGreaterThan(waiting[i].height);
      expect(await alphaOutside(widget)).toBeLessThanOrEqual(DRAWN_ALPHA);
    }
  }, 60_000);
});
