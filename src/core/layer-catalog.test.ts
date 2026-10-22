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
const items = (catalog: readonly CatalogSection[]) => catalog.flatMap((section) => section.items);
const keys = (catalog: readonly CatalogSection[]) => items(catalog).map(catalogItemKey);

/** Keys of the items of one section. */
const sectionKeys = (catalog: readonly CatalogSection[], id: CatalogSectionId) =>
  (catalog.find((section) => section.id === id)?.items ?? []).map(catalogItemKey);

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
    expect(trail.map((section) => section.id)).toEqual([
      'distance',
      'time',
      'pace',
      'elevation',
      'more',
      'text',
      'date',
      'route',
      'brand',
    ]);
  });

  it('offers each way of writing a value as a widget, the default first', () => {
    // Never rounded: distances keep their two decimals, and times their seconds.
    expect(sectionKeys(trail, 'distance')).toEqual(['metric-distance']);
    // In the sport's order: a trail run's moving time before its elapsed time.
    expect(sectionKeys(trail, 'time')).toEqual([
      'metric-movingTime',
      'metric-movingTime-units',
      'metric-elapsedTime',
      'metric-elapsedTime-units',
    ]);
    expect(sectionKeys(trail, 'pace')).toEqual(['metric-pace', 'metric-pace-marks']);
    expect(sectionKeys(trail, 'elevation')).toEqual([
      'metric-elevationGain',
      'metric-maxElevation',
    ]);
    expect(sectionKeys(trail, 'more')).toEqual([
      'metric-averageHeartRate',
      'metric-maxHeartRate',
      'metric-averageCadence',
      'metric-calories',
    ]);
  });

  it('offers free text and the name, and the date in a section of its own', () => {
    expect(sectionKeys(trail, 'text')).toEqual(['text', 'info-activityName']);
    // Every format but the weekday with the start time; the start time alone stays.
    expect(sectionKeys(trail, 'date')).toEqual([
      'info-activityDate',
      'info-activityDate-weekday',
      'info-activityDate-long',
      'info-activityDate-short',
      'info-activityDate-numeric',
      'info-activityDate-time',
    ]);
  });

  it('offers the route solid, glowing, dashed and dotted', () => {
    expect(sectionKeys(trail, 'route')).toEqual([
      'route',
      'route-glow',
      'route-dashed',
      'route-dotted',
    ]);
  });

  it('offers each logo in each tone', () => {
    expect(sectionKeys(trail, 'brand')).toEqual([
      'logo-allrun',
      'logo-allrun-mark',
      'logo-allrun-lockup',
      'logo-allrun-dark',
      'logo-allrun-mark-dark',
      'logo-allrun-lockup-dark',
      'logo-allrun-color',
      'logo-allrun-mark-color',
      'logo-allrun-lockup-color',
    ]);
  });

  it('offers each line chart plain, with its peak or with its average, in its own section', () => {
    const catalog = activityCatalog(makeActivity(), ['elevation', 'heartRate']);
    expect(sectionKeys(catalog, 'elevationChart')).toEqual([
      'chart-elevation',
      'chart-elevation-max',
      'chart-elevation-average',
    ]);
    expect(sectionKeys(catalog, 'heartRateChart')).toEqual([
      'chart-heartRate',
      'chart-heartRate-max',
      'chart-heartRate-average',
    ]);
  });

  it('offers splits without values, with the pace, with the pace and elevation, or with the average', () => {
    const catalog = activityCatalog(makeActivity(), ['splits']);
    expect(sectionKeys(catalog, 'splits')).toEqual([
      'chart-splits-nopace',
      'chart-splits',
      'chart-splits-elevation',
      'chart-splits-average',
    ]);
  });

  it('leaves out the route of an activity without GPS', () => {
    const catalog = activityCatalog(makeActivity({ sportType: 'Yoga', routePolyline: null }));
    expect(catalog.map((section) => section.id)).not.toContain('route');
  });

  it('gives every item its own key, and the variants of a widget one widget key', () => {
    const catalog = activityCatalog(makeActivity(), ['elevation', 'pace', 'splits']);
    const all = keys(catalog);
    expect(new Set(all).size).toBe(all.length);
    const widgets = new Set(items(catalog).map(catalogWidgetKey));
    expect(widgets).toContain('metric-distance');
    expect(widgets).toContain('route');
    expect(widgets).not.toContain('route-dashed');
    expect(widgets).not.toContain('chart-splits-elevation');
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
    expect(catalog.map((section) => section.id)).toEqual([
      'distance',
      'time',
      'pace',
      'elevation',
      'more',
      'text',
      'period',
      'route',
      'distanceChart',
      'timeChart',
      'brand',
    ]);
    expect(keys(catalog).slice(0, 8)).toEqual([
      'summaryMetric-totalDistance',
      'summaryMetric-longestDistance',
      'summaryMetric-totalMovingTime',
      'summaryMetric-totalMovingTime-units',
      'summaryMetric-averagePace',
      'summaryMetric-averagePace-marks',
      'summaryMetric-totalElevationGain',
      'summaryMetric-activityCount',
    ]);
    expect(sectionKeys(catalog, 'text')).toEqual(['text']);
    expect(sectionKeys(catalog, 'period')).toEqual([
      'info-periodName',
      ...PERIOD_FORMATS.slice(1).map((format) => `info-periodName-${format}`),
    ]);
  });

  it("offers each chart plain, with each bar's value or with the average", () => {
    // A week only has days.
    const catalog = summaryCatalog(summarize(activities, week), 'day');
    expect(sectionKeys(catalog, 'distanceChart')).toEqual([
      'summaryChart-distance',
      'summaryChart-distance-values',
      'summaryChart-distance-average',
    ]);
    expect(sectionKeys(catalog, 'timeChart')).toEqual([
      'summaryChart-movingTime',
      'summaryChart-movingTime-values',
      'summaryChart-movingTime-average',
    ]);
  });

  it('offers every bar size of the period, its own first, following the period', () => {
    const month = monthRange('2026-10-14');
    const catalog = summaryCatalog(summarize(activities, month), 'day');
    expect(sectionKeys(catalog, 'timeChart')).toEqual([
      'summaryChart-movingTime',
      'summaryChart-movingTime-values',
      'summaryChart-movingTime-average',
      'summaryChart-movingTime-week',
      'summaryChart-movingTime-week-values',
      'summaryChart-movingTime-week-average',
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
    expect(catalog.map((section) => section.id)).not.toContain('distanceChart');
    expect(items(catalog)).toContainEqual({ kind: 'summaryChart', value: 'movingTime' });
  });

  it('makes valid layers', () => {
    const catalog = summaryCatalog(summarize(activities, week), 'day');
    const added = addEach(defaultSummaryTemplate(makeSummary(), 'square'), catalog);
    expect(added).toHaveLength(items(catalog).length);
  });
});
