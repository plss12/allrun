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
    expect(trail.map((section) => section.id)).toEqual(['data', 'creative', 'basic', 'brand']);
    const withCharts = activityCatalog(makeActivity({ sportType: 'TrailRun' }), ['pace']);
    expect(withCharts.map((section) => section.id)).toEqual([
      'data',
      'creative',
      'charts',
      'basic',
      'brand',
    ]);
  });

  it('opens with the data widgets, alike designs in one tile', () => {
    expect(tileKeys(trail, 'data')).toEqual([
      'block-big',
      'block-bigDay',
      'block-bigSolo',
      'block-tower',
      'block-dataStack',
      'block-dataLine',
      'block-card',
      'block-dayBetween',
      'block-dayOver',
      'block-dayColumns',
      'block-bigRoute',
      'block-dayRoute',
    ]);
    // A big datum over two and three data, wide and stretched; never the time on top.
    expect(variantKeys(trail, 'block-big')).toEqual([
      'block-big-wide-pair',
      'block-big-wide-trio',
      'block-big-stretched-pair',
      'block-big-stretched-trio',
    ]);
    // Under the weekday; and the big datum alone under it, the weekday small first.
    expect(variantKeys(trail, 'block-bigDay')).toEqual([
      'block-bigDay-day-pair',
      'block-bigDay-day-trio',
      'block-bigDay-stretchedDay-pair',
      'block-bigDay-stretchedDay-trio',
    ]);
    expect(variantKeys(trail, 'block-bigSolo')).toEqual([
      'block-bigSolo-smallDay',
      'block-bigSolo-day',
      'block-bigSolo-stretchedDay',
    ]);
    expect(variantKeys(trail, 'block-tower')).toEqual(['block-tower']);
    expect(variantKeys(trail, 'block-dataStack')).toEqual([
      'block-dataStack-three',
      'block-dataStack-two',
    ]);
    expect(variantKeys(trail, 'block-bigRoute')).toEqual([
      'block-bigRoute-route-pair',
      'block-bigRoute-route-trio',
    ]);
    expect(variantKeys(trail, 'block-dayRoute')).toEqual(['block-dayRoute']);
    expect(tileKeys(trail, 'creative')).not.toContain('block-big');
  });

  it('follows with the creative widgets by theme, alike designs in one tile', () => {
    // Words, the phone's apps and things of paper.
    expect(tileKeys(trail, 'creative')).toEqual([
      'block-quote',
      'block-verse',
      'block-message',
      'block-chat',
      'block-sentence',
      'block-verified',
      'block-music',
      'block-camera',
      'block-alarm',
      'block-receipt',
      'block-boardingPass',
    ]);
    // The quote and the verse with their first phrase: the others are chosen from a list.
    expect(variantKeys(trail, 'block-quote')).toEqual(['block-quote-kipchoge']);
    expect(variantKeys(trail, 'block-verse')).toEqual(['block-verse-philippians4v13']);
    // The chat message with its first phrase, apart from the message with data: only it is
    // chosen from a list.
    expect(variantKeys(trail, 'block-chat')).toEqual([
      'block-chat-dark-zombieMode',
      'block-chat-light-zombieMode',
    ]);
    // A design of a single version is its tile's only page.
    expect(variantKeys(trail, 'block-receipt')).toEqual(['block-receipt']);
    // The splits' tables come with the activity's splits: the note with the phone's apps, then
    // the bars and the ladder together and the race on TV apart; the laps' two, with its laps.
    const withSplits = activityCatalog(makeActivity(), ['splits']);
    expect(tileKeys(withSplits, 'creative').slice(-6)).toEqual([
      'block-alarm',
      'block-notes',
      'block-splits',
      'block-grandPrix',
      'block-receipt',
      'block-boardingPass',
    ]);
    expect(variantKeys(withSplits, 'block-splits')).toEqual([
      'block-splits-splitBars',
      'block-splits-splitLadder-red',
      'block-splits-splitLadder-ink',
    ]);
    expect(tileKeys(withSplits, 'creative')).not.toContain('block-laps');
    const withLaps = activityCatalog(makeActivity(), [], false, false, true);
    expect(variantKeys(withLaps, 'block-laps')).toEqual([
      'block-laps-board-red',
      'block-laps-board-ink',
      'block-laps-sheet-red',
      'block-laps-sheet-ink',
    ]);
    expect(variantKeys(trail, 'block-alarm')).toEqual(['block-alarm-dark', 'block-alarm-light']);
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
      'metric-pace',
      'metric-pace-marks',
      'metric-movingTime',
      'metric-movingTime-units',
      'metric-elevationGain',
      'metric-averageHeartRate',
      'metric-calories',
      'metric-averageCadence',
      'metric-maxElevation',
      'metric-maxHeartRate',
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

  it('offers the logo as the name, the monogram and both, a tile each; its tone is styled', () => {
    expect(tileKeys(trail, 'brand')).toEqual([
      'logo-allrun',
      'logo-allrun-mark',
      'logo-allrun-lockup',
    ]);
    expect(variantKeys(trail, 'logo-allrun-mark')).toEqual(['logo-allrun-mark']);
    // A tone is a look of the same tile, not a tile of its own.
    expect(catalogWidgetKey({ kind: 'logo', brand: 'allrun', variant: 'mark', tone: 'dark' })).toBe(
      'logo-allrun-mark',
    );
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
    // And the location sticker, after the alarm.
    const creative = tileKeys(named, 'creative');
    expect(creative[creative.indexOf('block-alarm') + 1]).toBe('block-location');
    expect(tileKeys(activityCatalog(makeActivity()), 'creative')).not.toContain('block-location');
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

  it('offers its data and creative widgets, every total as written each way, the texts, the routes, the charts and the logo', () => {
    const catalog = summaryCatalog(summarize(activities, week), 'day');
    expect(catalog.map((section) => section.id)).toEqual([
      'data',
      'creative',
      'charts',
      'basic',
      'brand',
    ]);
    expect(tileKeys(catalog, 'creative')).toEqual([
      'summaryBlock-quote',
      'summaryBlock-verse',
      'summaryBlock-periodSentence',
      'summaryBlock-periodPlaylist',
      'summaryBlock-periodWrapped',
      'summaryBlock-periodNotes',
      'summaryBlock-periodLaps',
    ]);
    expect(variantKeys(catalog, 'summaryBlock-periodNotes')).toEqual([
      'summaryBlock-periodNotes-dark-activities',
      'summaryBlock-periodNotes-light-activities',
      'summaryBlock-periodNotes-dark-buckets',
      'summaryBlock-periodNotes-light-buckets',
    ]);
    expect(tileKeys(catalog, 'data')).toEqual([
      'summaryBlock-periodData',
      'summaryBlock-periodTable',
      'summaryBlock-periodIcons',
      'summaryBlock-periodCards',
      'summaryBlock-periodRoutes',
    ]);
    expect(variantKeys(catalog, 'summaryBlock-periodData')).toEqual([
      'summaryBlock-periodData-1',
      'summaryBlock-periodData-2',
      'summaryBlock-periodData-3',
    ]);
    expect(variantKeys(catalog, 'summaryBlock-periodTable')).toEqual([
      'summaryBlock-periodTable-distance',
      'summaryBlock-periodTable-movingTime',
    ]);
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
      'summaryMetric-longestDistance',
    ]);
    expect(variantKeys(catalog, 'info-periodName')).toEqual([
      'info-periodName',
      ...PERIOD_FORMATS.slice(1).map((format) => `info-periodName-${format}`),
    ]);
  });

  it('offers highlighted bars and a line, each of distance and time, under three totals or two', () => {
    // A week only has days.
    const catalog = summaryCatalog(summarize(activities, week), 'day');
    expect(tileKeys(catalog, 'charts')).toEqual(['summaryChart-highlight', 'summaryChart-line']);
    expect(variantKeys(catalog, 'summaryChart-highlight')).toEqual([
      'summaryChart-highlight-distance-values',
      'summaryChart-highlight-movingTime-values',
      'summaryChart-highlight-distance-two-values',
      'summaryChart-highlight-movingTime-two-values',
    ]);
    expect(variantKeys(catalog, 'summaryChart-line')).toEqual([
      'summaryChart-line-distance',
      'summaryChart-line-movingTime',
      'summaryChart-line-distance-two',
      'summaryChart-line-movingTime-two',
    ]);
    // Their header reads as written, from the left.
    expect(
      layerOf({ kind: 'summaryChart', value: 'distance', look: 'line', totals: 3 }),
    ).toMatchObject({ uppercase: false, align: 'left' });
  });

  it('offers a tile per bar size, its own first, with values only when they fit', () => {
    const month = monthRange('2026-10-14');
    const catalog = summaryCatalog(summarize(activities, month), 'day');
    // Bars and line by days, then by weeks: no tile scrolls too long.
    expect(tileKeys(catalog, 'charts')).toEqual([
      'summaryChart-highlight',
      'summaryChart-line',
      'summaryChart-highlight-week',
      'summaryChart-line-week',
    ]);
    // A month's 31 days are too many bars to write their values over them; its 5 weeks aren't.
    expect(variantKeys(catalog, 'summaryChart-highlight')).toEqual([
      'summaryChart-highlight-distance',
      'summaryChart-highlight-movingTime',
      'summaryChart-highlight-distance-two',
      'summaryChart-highlight-movingTime-two',
    ]);
    expect(variantKeys(catalog, 'summaryChart-highlight-week')).toEqual([
      'summaryChart-highlight-week-distance-values',
      'summaryChart-highlight-week-movingTime-values',
      'summaryChart-highlight-week-distance-two-values',
      'summaryChart-highlight-week-movingTime-two-values',
    ]);
    // The period's own size stays on `auto`, so a saved design suits any period.
    const buckets = items(catalog).flatMap((item) =>
      item.kind === 'summaryChart' && item.look === 'line' ? [layerOf(item)] : [],
    );
    expect(buckets[0]).toMatchObject({ bucket: 'auto' });
    expect(buckets[4]).toMatchObject({ bucket: 'week' });
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
    expect(tileKeys(catalog, 'charts')).toEqual(['summaryChart-highlight', 'summaryChart-line']);
    // With only two totals, no version under three: it would repeat them.
    expect(variantKeys(catalog, 'summaryChart-highlight')).toEqual([
      'summaryChart-highlight-movingTime-two-values',
    ]);
  });

  it('makes valid layers', () => {
    const catalog = summaryCatalog(summarize(activities, week), 'day');
    const added = addEach(defaultSummaryTemplate(makeSummary(), 'square'), catalog);
    expect(added).toHaveLength(items(catalog).length);
  });
});
