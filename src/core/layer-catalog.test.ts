import { makeActivity } from '@/test-utils/make-activity';
import { makeSummary } from '@/test-utils/make-summary';

import { monthRange, weekRange } from './dates';
import { defaultActivityTemplate, defaultSummaryTemplate, newLayer } from './default-layout';
import {
  activityCatalog,
  type CatalogItem,
  type CatalogSection,
  type CatalogSectionId,
  catalogItemKey,
  catalogWidgetKey,
  type NewLayer,
  summaryCatalog,
} from './layer-catalog';
import { summarize } from './summary';
import {
  CANVAS_FORMATS,
  type CanvasFormat,
  type Layer,
  parseTemplate,
  PERIOD_FORMATS,
  type Template,
} from './template';
import { addLayer, uniqueLayerId } from './template-edit';

const week = weekRange('2026-10-14');
const widgets = (catalog: readonly CatalogSection[]) =>
  catalog.flatMap((section) => section.widgets);
const items = (catalog: readonly CatalogSection[]) =>
  widgets(catalog).flatMap((widget) => widget.variants);
const keys = (catalog: readonly CatalogSection[]) => items(catalog).map(catalogItemKey);

/** Keys of the tiles of one section. */
const tileKeys = (catalog: readonly CatalogSection[], id: CatalogSectionId) =>
  (catalog.find((section) => section.id === id)?.widgets ?? []).map((widget) => widget.key);

/** Keys of the variants that scroll in one tile. */
const variantKeys = (catalog: readonly CatalogSection[], tile: string) =>
  (widgets(catalog).find((widget) => widget.key === tile)?.variants ?? []).map(catalogItemKey);

/**
 * The layer each catalog item adds to `template` (free text with some content), each validated in
 * the template on its own: all of them together would pass the most layers a template can hold.
 */
function addEach(template: Template, catalog: readonly CatalogSection[]): Layer[] {
  return items(catalog).map((item: CatalogItem) => {
    const pick: NewLayer = item.kind === 'text' ? { kind: 'text', content: 'PB!' } : item;
    const id = uniqueLayerId(template, catalogItemKey(item));
    const added = parseTemplate(addLayer(template, newLayer(pick, id, template.format)));
    return added.layers[added.layers.length - 1];
  });
}

/** The layer a catalog item adds to a story. */
const layerOf = (item: Exclude<NewLayer, { kind: 'text' }>) =>
  newLayer(item, catalogItemKey(item), 'story');

describe('activityCatalog', () => {
  const trail = activityCatalog(makeActivity({ sportType: 'TrailRun' }));

  it('groups the widgets in sections, in the gallery order', () => {
    expect(trail.map((section) => section.id)).toEqual(['mixed', 'basic', 'brand']);
  });

  it('opens with the mixed widgets, a tile per design with its versions', () => {
    expect(tileKeys(trail, 'mixed')).toEqual([
      'block-headline',
      'block-columns',
      'block-route',
      'block-day',
      'block-sport',
    ]);
    expect(variantKeys(trail, 'block-headline')).toEqual([
      'block-headline-stacked',
      'block-headline-inline',
      'block-headline-condensed',
    ]);
    expect(variantKeys(trail, 'block-columns')).toEqual([
      'block-columns-2',
      'block-columns-3',
      'block-columns-4',
      'block-columns-6',
    ]);
  });

  it('puts the basics in order: data, route, free text, name, date', () => {
    expect(tileKeys(trail, 'basic')).toEqual([
      'data',
      'route',
      'text',
      'info-activityName',
      'info-activityDate',
    ]);
  });

  it('scrolls through every datum in one tile, in the sport order, each way of writing it after it', () => {
    // Distances keep their two decimals, and times their seconds: nothing is rounded.
    expect(variantKeys(trail, 'data')).toEqual([
      'metric-distance',
      'metric-elevationGain',
      'metric-movingTime',
      'metric-movingTime-units',
      'metric-maxElevation',
      'metric-pace',
      'metric-pace-marks',
      'metric-averageHeartRate',
      'metric-maxHeartRate',
      'metric-averageCadence',
      'metric-calories',
      'metric-elapsedTime',
      'metric-elapsedTime-units',
    ]);
  });

  it('offers every date format in its tile', () => {
    // Every format but the weekday with the start time; the start time alone stays.
    expect(variantKeys(trail, 'info-activityDate')).toEqual([
      'info-activityDate',
      'info-activityDate-weekday',
      'info-activityDate-long',
      'info-activityDate-short',
      'info-activityDate-numeric',
      'info-activityDate-time',
    ]);
  });

  it('offers the route solid, glowing, dashed and dotted', () => {
    expect(variantKeys(trail, 'route')).toEqual([
      'route',
      'route-glow',
      'route-dashed',
      'route-dotted',
    ]);
  });

  it('offers the logo as the name, the monogram or both; its tone is styled', () => {
    expect(tileKeys(trail, 'brand')).toEqual(['logo-allrun']);
    expect(variantKeys(trail, 'logo-allrun')).toEqual([
      'logo-allrun',
      'logo-allrun-mark',
      'logo-allrun-lockup',
    ]);
  });

  it('offers each line chart under its header, with its average, and alone', () => {
    const catalog = activityCatalog(makeActivity(), ['elevation', 'heartRate']);
    expect(tileKeys(catalog, 'charts')).toEqual(['chart-elevation', 'chart-heartRate']);
    expect(variantKeys(catalog, 'chart-elevation')).toEqual([
      'chart-elevation',
      'chart-elevation-average',
      'chart-elevation-noheader',
    ]);
    expect(variantKeys(catalog, 'chart-heartRate')).toEqual([
      'chart-heartRate',
      'chart-heartRate-average',
      'chart-heartRate-noheader',
    ]);
  });

  it("offers a heart rate's zones as a colored line, with their table, or the table alone", () => {
    const catalog = activityCatalog(makeActivity(), ['elevation', 'heartRate'], false, true);
    expect(variantKeys(catalog, 'chart-heartRate')).toEqual([
      'chart-heartRate',
      'chart-heartRate-average',
      'chart-heartRate-zones-line',
      'chart-heartRate-zones-lineAndTable',
      'chart-heartRate-zones-table',
      'chart-heartRate-noheader',
    ]);
    // Only a heart rate has zones.
    expect(variantKeys(catalog, 'chart-elevation')).toHaveLength(3);
  });

  it('offers splits with their paces first, then more columns, and last under their header', () => {
    const catalog = activityCatalog(makeActivity(), ['splits']);
    expect(variantKeys(catalog, 'chart-splits')).toEqual([
      'chart-splits',
      'chart-splits-elevation',
      'chart-splits-heartRate',
      'chart-splits-elevation-heartRate',
      'chart-splits-nopace',
    ]);
    // Without a heart rate monitor, no column of heart rates.
    const unmonitored = activityCatalog(makeActivity({ averageHeartRate: null }), ['splits']);
    expect(variantKeys(unmonitored, 'chart-splits')).toEqual([
      'chart-splits',
      'chart-splits-elevation',
      'chart-splits-nopace',
    ]);
  });

  it('offers the place after the date, in each format, only when it can be named', () => {
    const named = activityCatalog(makeActivity(), [], true);
    expect(tileKeys(named, 'basic')).toEqual([
      'data',
      'route',
      'text',
      'info-activityName',
      'info-activityDate',
      'info-activityPlace',
    ]);
    expect(variantKeys(named, 'info-activityPlace')).toEqual([
      'info-activityPlace',
      'info-activityPlace-cityRegion',
      'info-activityPlace-cityCountry',
    ]);
    expect(tileKeys(activityCatalog(makeActivity()), 'basic')).not.toContain('info-activityPlace');
  });

  it('leaves out the route of an activity without GPS', () => {
    const catalog = activityCatalog(makeActivity({ sportType: 'Yoga', routePolyline: null }));
    expect(tileKeys(catalog, 'basic')).not.toContain('route');
    expect(tileKeys(catalog, 'mixed')).not.toContain('block-route');
  });

  it('gives every item and every tile its own key, and the variants of a widget one widget key', () => {
    const catalog = activityCatalog(makeActivity(), ['elevation', 'pace', 'splits']);
    const all = keys(catalog);
    expect(new Set(all).size).toBe(all.length);
    const tiles = widgets(catalog).map((widget) => widget.key);
    expect(new Set(tiles).size).toBe(tiles.length);
    const widgetKeys = new Set(items(catalog).map(catalogWidgetKey));
    expect(widgetKeys).toContain('metric-distance');
    expect(widgetKeys).toContain('route');
    expect(widgetKeys).not.toContain('route-dashed');
    expect(widgetKeys).not.toContain('chart-splits-elevation');
  });

  it.each(Object.keys(CANVAS_FORMATS) as CanvasFormat[])(
    'makes valid, centered layers in the %s format',
    (format) => {
      const activity = makeActivity();
      const catalog = activityCatalog(activity, ['elevation', 'pace', 'splits']);
      const added = addEach(defaultActivityTemplate(activity, format), catalog);
      expect(added).toHaveLength(items(catalog).length);
      for (const layer of added) {
        expect(layer.transform).toMatchObject({ x: 0.5, y: 0.5, rotation: 0 });
      }
    },
  );

  it('carries each variant into its layer', () => {
    expect(layerOf({ kind: 'metric', metric: 'movingTime', timeNotation: 'units' })).toMatchObject({
      timeNotation: 'units',
    });
    expect(layerOf({ kind: 'metric', metric: 'pace', paceNotation: 'marks' })).toMatchObject({
      paceNotation: 'marks',
    });
    expect(layerOf({ kind: 'info', field: 'activityDate', dateFormat: 'short' })).toMatchObject({
      dateFormat: 'short',
    });
    const dashed = layerOf({ kind: 'route', line: 'dashed' });
    expect(dashed).toMatchObject({ stroke: { line: 'dashed' } });
    expect(dashed).not.toHaveProperty('line');
    expect(layerOf({ kind: 'route', glow: true })).toMatchObject({ stroke: { glow: true } });
    expect(
      layerOf({ kind: 'activityChart', series: 'splits', splitElevation: true }),
    ).toMatchObject({ splitElevation: true });
    expect(
      layerOf({ kind: 'activityChart', series: 'elevation', averageLine: true }),
    ).toMatchObject({ averageLine: true });
    expect(layerOf({ kind: 'logo', brand: 'allrun', variant: 'mark', tone: 'dark' })).toMatchObject(
      { variant: 'mark', tone: 'dark' },
    );
  });

  it('leaves the optional fields out of the default variants, as layers were before', () => {
    const newDistance = layerOf({ kind: 'metric', metric: 'distance' });
    expect(newDistance).not.toHaveProperty('timeNotation');
    const route = layerOf({ kind: 'route' });
    expect(route).toMatchObject({ stroke: { color: '#FFFFFF', width: 8 } });
    expect(route).not.toHaveProperty('stroke.line');
    expect(route).not.toHaveProperty('stroke.glow');
    expect(layerOf({ kind: 'logo', brand: 'allrun', variant: 'wordmark' })).toMatchObject({
      tone: 'light',
    });
  });
});

describe('summaryCatalog', () => {
  const activities = [makeActivity({ localDate: '2026-10-13' })];

  it('offers every total as written each way, the texts, the routes, the charts and the logo', () => {
    const catalog = summaryCatalog(summarize(activities, week), 'day');
    expect(catalog.map((section) => section.id)).toEqual(['basic', 'charts', 'brand']);
    expect(tileKeys(catalog, 'basic')).toEqual([
      'data',
      'summaryRoutes',
      'text',
      'info-periodName',
    ]);
    expect(variantKeys(catalog, 'data')).toEqual([
      'summaryMetric-totalDistance',
      'summaryMetric-totalMovingTime',
      'summaryMetric-totalMovingTime-units',
      'summaryMetric-activityCount',
      'summaryMetric-totalElevationGain',
      'summaryMetric-averagePace',
      'summaryMetric-averagePace-marks',
      'summaryMetric-longestDistance',
    ]);
    expect(variantKeys(catalog, 'info-periodName')).toEqual([
      'info-periodName',
      ...PERIOD_FORMATS.slice(1).map((format) => `info-periodName-${format}`),
    ]);
  });

  it("offers each chart plain, with each bar's value or with the average, and alone", () => {
    // A week only has days.
    const catalog = summaryCatalog(summarize(activities, week), 'day');
    expect(tileKeys(catalog, 'charts')).toEqual([
      'summaryChart-distance',
      'summaryChart-movingTime',
    ]);
    expect(variantKeys(catalog, 'summaryChart-distance')).toEqual([
      'summaryChart-distance',
      'summaryChart-distance-values',
      'summaryChart-distance-average',
      'summaryChart-distance-noheader',
    ]);
    expect(variantKeys(catalog, 'summaryChart-movingTime')).toEqual([
      'summaryChart-movingTime',
      'summaryChart-movingTime-values',
      'summaryChart-movingTime-average',
      'summaryChart-movingTime-noheader',
    ]);
  });

  it('offers every bar size of the period, its own first, following the period', () => {
    const month = monthRange('2026-10-14');
    const catalog = summaryCatalog(summarize(activities, month), 'day');
    expect(variantKeys(catalog, 'summaryChart-movingTime')).toEqual([
      'summaryChart-movingTime',
      'summaryChart-movingTime-values',
      'summaryChart-movingTime-average',
      'summaryChart-movingTime-week',
      'summaryChart-movingTime-week-values',
      'summaryChart-movingTime-week-average',
      'summaryChart-movingTime-noheader',
    ]);
    // The period's own size stays on `auto`, so a saved design suits any period.
    const buckets = items(catalog).flatMap((item) =>
      item.kind === 'summaryChart' && item.value === 'movingTime' ? [layerOf(item)] : [],
    );
    expect(buckets[0]).toMatchObject({ bucket: 'auto' });
    expect(buckets[3]).toMatchObject({ bucket: 'week' });
  });

  it('leaves out the routes when no activity has GPS, but keeps the charts', () => {
    const catalog = summaryCatalog(summarize([], week), 'day');
    expect(catalog.map((section) => section.id)).not.toContain('route');
    expect(items(catalog).some((item) => item.kind === 'summaryChart')).toBe(true);
  });

  it('offers only time totals and time charts for a period without distance', () => {
    const gym = makeActivity({
      sportType: 'WeightTraining',
      distanceMeters: 0,
      elevationGainMeters: 0,
      routePolyline: null,
      localDate: '2026-10-13',
    });
    const catalog = summaryCatalog(summarize([gym], week), 'day');
    expect(keys(catalog).filter((key) => key.startsWith('summaryMetric'))).toEqual([
      'summaryMetric-totalMovingTime',
      'summaryMetric-totalMovingTime-units',
      'summaryMetric-activityCount',
    ]);
    expect(tileKeys(catalog, 'charts')).toEqual(['summaryChart-movingTime']);
    expect(items(catalog)).toContainEqual({ kind: 'summaryChart', value: 'movingTime' });
  });

  it('makes valid layers', () => {
    const catalog = summaryCatalog(summarize(activities, week), 'day');
    const added = addEach(defaultSummaryTemplate(makeSummary(), 'square'), catalog);
    expect(added).toHaveLength(items(catalog).length);
  });
});
