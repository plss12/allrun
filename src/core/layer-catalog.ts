import type { Activity } from './activity';
import { activityBlocks, blockTile, isDataWidget } from './activity-block';
import { availableMetrics, type MetricId } from './metrics';
import { bucketCount, chartBucketOptions } from './periods';
import { PLACE_FORMATS } from './place';
import type { BucketSize, PeriodSummary } from './summary';
import { isSummaryDataWidget, summaryBlocks } from './summary-block';
import { availableSummaryMetrics, periodTotals, summaryHasDistance } from './summary-metrics';
import {
  type ActivityChartSeries,
  DATE_FORMATS,
  HEART_RATE_ZONE_VIEWS,
  type Layer,
  type LayerKind,
  PERIOD_FORMATS,
  type SummaryMetricId,
  TIME_NOTATIONS,
} from './template';

/**
 * The widgets the user can add to the canvas, grouped in sections for the editor's gallery. Only
 * what the current activity or period can show is offered: metrics the activity has a value for,
 * the route when there is one, the charts it recorded data for. A widget is one tile of the
 * gallery, and every way of writing or drawing it is a variant that scrolls inside the tile (a
 * time as a clock or in units; a dashed route; a chart with its average line), so the
 * gallery stays short and shows every variant ready-made, while the style panel keeps only the
 * look (color, font, opacity…). The mixed widgets lead the gallery; the single data all share
 * one tile, each followed by its other ways of writing it, so the basics fit in a few tiles
 * (ADR 009). To change a variant, the user replaces the widget.
 * `default-layout.ts` turns a pick into a layer with the default look.
 */

type LayerOf<K extends LayerKind> = Extract<Layer, { kind: K }>;
type LineStyle = NonNullable<LayerOf<'route'>['stroke']['line']>;
type DataFormat = 'timeNotation' | 'paceNotation';
type LineLook = { readonly line?: LineStyle; readonly glow?: boolean };

/**
 * One widget to add, with the fields of its variant; a field left out takes the layer's default.
 * Free text gets its content once the user has typed it.
 */
export type CatalogItem =
  | Readonly<Pick<LayerOf<'metric'>, 'kind' | 'metric' | DataFormat>>
  | Readonly<Pick<LayerOf<'summaryMetric'>, 'kind' | 'metric' | DataFormat>>
  | Readonly<
      Pick<LayerOf<'info'>, 'kind' | 'field' | 'dateFormat' | 'periodFormat' | 'placeFormat'>
    >
  | { readonly kind: 'text' }
  | ({ readonly kind: 'route' } & LineLook)
  | ({ readonly kind: 'summaryRoutes' } & LineLook)
  | Readonly<
      Pick<
        LayerOf<'summaryChart'>,
        'kind' | 'value' | 'look' | 'totals' | 'barValues' | 'averageLine' | 'header'
      > &
        Partial<Pick<LayerOf<'summaryChart'>, 'bucket'>>
    >
  | Readonly<
      Pick<
        LayerOf<'activityChart'>,
        | 'kind'
        | 'series'
        | 'splitPace'
        | 'splitElevation'
        | 'splitHeartRate'
        | 'header'
        | 'zones'
        | 'averageLine'
      >
    >
  | Readonly<
      Pick<LayerOf<'logo'>, 'kind' | 'brand' | 'variant'> & Partial<Pick<LayerOf<'logo'>, 'tone'>>
    >
  | Readonly<Pick<LayerOf<'activityBlock'>, 'kind' | 'block'>>
  | Readonly<Pick<LayerOf<'summaryBlock'>, 'kind' | 'block'>>;

/** What a new layer is made from: a catalog item, with the typed content for free text. */
export type NewLayer =
  Exclude<CatalogItem, { kind: 'text' }> | { readonly kind: 'text'; readonly content: string };

export type CatalogSectionId = 'data' | 'creative' | 'charts' | 'basic' | 'brand';

/** A tile of the gallery: one widget, whose variants scroll inside it, the default first. */
export interface CatalogWidget {
  readonly key: string;
  readonly variants: readonly CatalogItem[];
}

export interface CatalogSection {
  readonly id: CatalogSectionId;
  readonly widgets: readonly CatalogWidget[];
}

/**
 * The widget an item is a variant of: the same for a time as a clock or in units, or for
 * every line of a route. The gallery draws the variants of a widget at one size, so they compare.
 */
export function catalogWidgetKey(item: CatalogItem | NewLayer): string {
  switch (item.kind) {
    case 'metric':
    case 'summaryMetric':
      return `${item.kind}-${item.metric}`;
    case 'info':
      return `info-${item.field}`;
    case 'logo':
      // The name, the monogram and both are a tile each; the tone is a look of the same one.
      return item.variant === 'wordmark'
        ? `logo-${item.brand}`
        : `logo-${item.brand}-${item.variant}`;
    case 'activityChart':
      return `chart-${item.series}`;
    case 'summaryChart':
      // A tile per look and bar size, with both values in it.
      return item.bucket === undefined || item.bucket === 'auto'
        ? `summaryChart-${item.look}`
        : `summaryChart-${item.look}-${item.bucket}`;
    case 'activityBlock':
      // Designs alike share a tile (see `blockTile`).
      return `block-${blockTile(item.block)}`;
    case 'summaryBlock':
      return `summaryBlock-${item.block.design}`;
    case 'text':
    case 'route':
    case 'summaryRoutes':
      return item.kind;
  }
}

/**
 * A key unique within a catalog, for lists; also the base of a new layer's id. The default
 * variant keeps its widget's key ("metric-distance"); the others add what sets them apart
 * ("metric-distance-0", "route-dashed", "chart-splits-rows-elevation").
 */
export function catalogItemKey(item: CatalogItem | NewLayer): string {
  const flag = (on: boolean | undefined, name: string) => (on === true ? name : undefined);
  const variant = ((): readonly (string | number | undefined)[] => {
    switch (item.kind) {
      case 'metric':
      case 'summaryMetric':
        return [item.timeNotation, item.paceNotation];
      case 'info':
        return [item.dateFormat, item.periodFormat, item.placeFormat];
      case 'logo':
        // The artwork is in the widget's key already.
        return [item.tone === 'light' ? undefined : item.tone];
      case 'activityChart':
        return [
          item.splitPace === false ? 'nopace' : undefined,
          flag(item.splitElevation, 'elevation'),
          flag(item.splitHeartRate, 'heartRate'),
          item.zones === undefined ? undefined : `zones-${item.zones}`,
          flag(item.averageLine, 'average'),
          item.header === false ? 'noheader' : undefined,
        ];
      case 'summaryChart':
        // The look and the bar size are in the widget's key already.
        return [
          item.value,
          item.totals === 2 ? 'two' : undefined,
          flag(item.barValues, 'values'),
          flag(item.averageLine, 'average'),
          item.header === false ? 'noheader' : undefined,
        ];
      case 'route':
      case 'summaryRoutes':
        return [item.line, flag(item.glow, 'glow')];
      case 'activityBlock':
        // Every version is named, the first too: they are designs, not options of one. A
        // design of a single version has nothing to add; a cover adds its color, and a verse, a
        // quote or a chat message's phrase its name (a phrase of the user's, nothing).
        return [
          'label' in item.block ? item.block.label : undefined,
          'layout' in item.block ? item.block.layout : undefined,
          // In a tile of several designs, each version names its own; a big datum says how many
          // data it has under it.
          item.block.design === 'bigPair'
            ? 'pair'
            : item.block.design === 'bigTrio'
              ? 'trio'
              : item.block.design !== blockTile(item.block)
                ? item.block.design
                : undefined,
          'top' in item.block && item.block.top !== 'main' ? item.block.top : undefined,
          'cover' in item.block ? item.block.cover : undefined,
          'verse' in item.block ? item.block.verse : undefined,
          'quote' in item.block ? item.block.quote : undefined,
          'phrase' in item.block && typeof item.block.phrase === 'string'
            ? item.block.phrase
            : undefined,
        ];
      case 'summaryBlock':
        // Every version is named: how many data, or which.
        return [
          'count' in item.block ? item.block.count : undefined,
          'value' in item.block ? item.block.value : undefined,
          'label' in item.block ? item.block.label : undefined,
          'layout' in item.block ? item.block.layout : undefined,
          'rows' in item.block ? item.block.rows : undefined,
          'cover' in item.block ? item.block.cover : undefined,
          'verse' in item.block ? item.block.verse : undefined,
          'quote' in item.block ? item.block.quote : undefined,
        ];
      case 'text':
        return [];
    }
  })();
  return [catalogWidgetKey(item), ...variant.filter((part) => part !== undefined)].join('-');
}

type DataItem = Extract<CatalogItem, { kind: 'metric' | 'summaryMetric' }>;
type Writing = 'time' | 'pace' | 'plain';

/** A catalog item, the section it goes in and the tile it scrolls in. */
type Entry = readonly [CatalogSectionId, string, CatalogItem];

/** How each metric's value can be written. */
const WRITINGS: Readonly<Record<MetricId | SummaryMetricId, Writing>> = {
  distance: 'plain',
  totalDistance: 'plain',
  longestDistance: 'plain',
  movingTime: 'time',
  elapsedTime: 'time',
  totalMovingTime: 'time',
  pace: 'pace',
  swimPace: 'pace',
  averagePace: 'pace',
  speed: 'plain',
  elevationGain: 'plain',
  maxElevation: 'plain',
  totalElevationGain: 'plain',
  averageHeartRate: 'plain',
  maxHeartRate: 'plain',
  averagePower: 'plain',
  weightedAveragePower: 'plain',
  averageCadence: 'plain',
  calories: 'plain',
  activityCount: 'plain',
};

/** The one tile every single datum scrolls in. */
const DATA_TILE = 'data';

/**
 * A data widget in each way its value can be written (its time or pace notation), one after
 * another in the data tile. The first is the default, which the layer leaves out. Nothing is
 * rounded: distances keep their two decimals and times their seconds (ADR 009).
 */
function dataEntries(plain: DataItem): Entry[] {
  const writing = WRITINGS[plain.metric];
  const variants: DataItem[] =
    writing === 'time'
      ? [plain, ...TIME_NOTATIONS.slice(1).map((timeNotation) => ({ ...plain, timeNotation }))]
      : writing === 'pace'
        ? [plain, { ...plain, paceNotation: 'marks' }]
        : [plain];
  return variants.map((item) => ['basic', DATA_TILE, item]);
}

/** Entries of one widget's variants, in their section. */
const tileEntries = (section: CatalogSectionId, items: readonly CatalogItem[]): Entry[] =>
  items.map((item) => [section, catalogWidgetKey(item), item]);

/**
 * Formats offered for an activity's date. The weekday with the start time is left out (the user
 * found it redundant); templates that use it still read.
 */
const OFFERED_DATE_FORMATS = DATE_FORMATS.filter((format) => format !== 'weekdayTime');

/** Route lines, solid, solid with a glow, dashed and dotted. */
function lineEntries(kind: 'route' | 'summaryRoutes'): Entry[] {
  return tileEntries('basic', [
    { kind },
    { kind, glow: true },
    { kind, line: 'dashed' },
    { kind, line: 'dotted' },
  ]);
}

/**
 * An activity chart's variants. A line, under its header: plain or with its average; a heart
 * rate, when the athlete's zones are known (`withZones`), also colored by zone, with a table of
 * the time in each, or the table alone; and last the line under its name only. Splits: with each
 * split's pace (their default), with its change in altitude, and, for an activity with a heart
 * rate, with it too; and last without values, under the header that the paces would repeat
 * otherwise. Each row already reads against the others, so splits have no average.
 */
function chartEntries(
  series: ActivityChartSeries,
  withHeartRate: boolean,
  withZones: boolean,
): Entry[] {
  const items: CatalogItem[] =
    series === 'splits'
      ? [
          { kind: 'activityChart', series },
          { kind: 'activityChart', series, splitElevation: true },
          ...(withHeartRate
            ? ([
                { kind: 'activityChart', series, splitHeartRate: true },
                { kind: 'activityChart', series, splitElevation: true, splitHeartRate: true },
              ] as const)
            : []),
          { kind: 'activityChart', series, splitPace: false },
        ]
      : [
          { kind: 'activityChart', series },
          { kind: 'activityChart', series, averageLine: true },
          ...(series === 'heartRate' && withZones
            ? HEART_RATE_ZONE_VIEWS.map(
                (zones) => ({ kind: 'activityChart', series, zones }) as const,
              )
            : []),
          { kind: 'activityChart', series, header: false },
        ];
  return tileEntries('charts', items);
}

/** Most bars whose values fit over them upright; a month of days goes without them. */
const MAX_VALUED_BARS = 16;

/**
 * A period's charts, a tile per look and bar size, so none scrolls too long: for each size the
 * period offers (its own first, on `auto`, so the design suits any period), highlighted bars
 * (with their values when they fit) and then a line. A tile holds the chart of distance (only
 * when the period has some) and of time under the period's name and three of its main totals,
 * then both under two (when it has three).
 */
function periodChartEntries(summary: PeriodSummary, autoBucket: BucketSize): Entry[] {
  const values = summaryHasDistance(summary)
    ? (['distance', 'movingTime'] as const)
    : (['movingTime'] as const);
  const sizes = [
    autoBucket,
    ...chartBucketOptions(summary.range).filter((size) => size !== autoBucket),
  ];
  const counts = periodTotals(summary).length === 3 ? ([3, 2] as const) : ([2] as const);
  return sizes.flatMap((size) =>
    (['highlight', 'line'] as const).flatMap((look) =>
      tileEntries(
        'charts',
        counts.flatMap((totals) =>
          values.map((value): CatalogItem => ({
            kind: 'summaryChart',
            value,
            look,
            totals,
            // The period's own size stays on `auto`.
            ...(size === autoBucket ? {} : { bucket: size }),
            ...(look === 'highlight' && bucketCount(summary.range, size) <= MAX_VALUED_BARS
              ? { barValues: true }
              : {}),
          })),
        ),
      ),
    ),
  );
}

/**
 * The AllRun name, monogram and both, a tile each, light: its tone (light, dark or the brand's
 * colors) is part of its look, chosen in the style panel.
 */
const BRAND: readonly Entry[] = tileEntries(
  'brand',
  (['wordmark', 'mark', 'lockup'] as const).map((variant) => ({
    kind: 'logo',
    brand: 'allrun',
    variant,
    tone: 'light',
  })),
);

/**
 * The gallery's sections: the data widgets and the creative ones (the mixed widgets, see
 * `isDataWidget`: replicas of apps and things, and phrases), the charts, the basics and the logo.
 */
const SECTION_ORDER: readonly CatalogSectionId[] = ['data', 'creative', 'charts', 'basic', 'brand'];

/**
 * Puts the items in their tiles and the tiles in their sections, in the gallery's order, leaving
 * out sections with nothing to offer. Tiles keep the order of their first item, and items their
 * order within a tile. Time O(n) for n items.
 */
function sections(entries: readonly Entry[]): CatalogSection[] {
  return SECTION_ORDER.flatMap((id) => {
    const tiles = new Map<string, CatalogItem[]>();
    for (const [section, tile, item] of entries) {
      if (section === id) {
        tiles.set(tile, [...(tiles.get(tile) ?? []), item]);
      }
    }
    const widgets = [...tiles].map(([key, variants]) => ({ key, variants }));
    return widgets.length === 0 ? [] : [{ id, widgets }];
  });
}

/**
 * Widgets for one activity: its mixed widgets, data or creative ones (see `activityBlocks`; the
 * location's only `withPlace`, the laps' only `withLaps`); the `charts` it recorded data for (see
 * `availableActivityCharts`); its basics: the metrics of its sport it has values for (in the
 * sport's order, all in one tile), the route when it has GPS, free text, its name, its date and
 * its place when it can be named (`withPlace`); and the logo. Time O(m + c) for
 * the m metrics of the sport and c charts.
 */
export function activityCatalog(
  activity: Activity,
  charts: readonly ActivityChartSeries[] = [],
  withPlace = false,
  withZones = false,
  withLaps = false,
): CatalogSection[] {
  return sections([
    ...activityBlocks(activity, charts.includes('splits'), withPlace, withLaps).flatMap((block) =>
      tileEntries(isDataWidget(block.design) ? 'data' : 'creative', [
        { kind: 'activityBlock', block },
      ]),
    ),
    ...availableMetrics(activity).flatMap((metric) => dataEntries({ kind: 'metric', metric })),
    ...(activity.routePolyline === null ? [] : lineEntries('route')),
    ...tileEntries('basic', [{ kind: 'text' }, { kind: 'info', field: 'activityName' }]),
    // The first format is the default, which the layer leaves out.
    ...tileEntries(
      'basic',
      OFFERED_DATE_FORMATS.map((dateFormat, i) => ({
        kind: 'info',
        field: 'activityDate',
        ...(i === 0 ? {} : { dateFormat }),
      })),
    ),
    ...(withPlace
      ? tileEntries(
          'basic',
          PLACE_FORMATS.map((placeFormat, i) => ({
            kind: 'info',
            field: 'activityPlace',
            ...(i === 0 ? {} : { placeFormat }),
          })),
        )
      : []),
    ...charts.flatMap((series) =>
      chartEntries(series, activity.averageHeartRate !== null, withZones),
    ),
    ...BRAND,
  ]);
}

/**
 * Widgets for a period summary: its data and creative widgets (see `summaryBlocks` and
 * `isSummaryDataWidget`), the charts (`autoBucket`
 * is the period's own bar size, see `bucketForPeriod`), its basics (every total in one tile, the
 * overlaid routes when any activity has GPS, free text, the period name in each format), and the
 * logo. Formats of the name that write a period the same (all of them, for a year) are one widget
 * for the user: the gallery drops the repeats. Time O(1).
 */
export function summaryCatalog(summary: PeriodSummary, autoBucket: BucketSize): CatalogSection[] {
  return sections([
    ...summaryBlocks(summary).map((block): Entry => [
      isSummaryDataWidget(block.design) ? 'data' : 'creative',
      `summaryBlock-${block.design}`,
      { kind: 'summaryBlock', block },
    ]),
    ...availableSummaryMetrics(summary).flatMap((metric) =>
      dataEntries({ kind: 'summaryMetric', metric }),
    ),
    ...(summary.routes.length === 0 ? [] : lineEntries('summaryRoutes')),
    ...tileEntries('basic', [{ kind: 'text' }]),
    ...tileEntries(
      'basic',
      PERIOD_FORMATS.map((periodFormat, i) => ({
        kind: 'info',
        field: 'periodName',
        ...(i === 0 ? {} : { periodFormat }),
      })),
    ),
    ...periodChartEntries(summary, autoBucket),
    ...BRAND,
  ]);
}
