import type { Activity } from './activity';
import { availableMetrics, type MetricId } from './metrics';
import { chartBucketOptions } from './periods';
import { PLACE_FORMATS } from './place';
import type { BucketSize, PeriodSummary } from './summary';
import { availableSummaryMetrics, summaryHasDistance } from './summary-metrics';
import {
  type ActivityChartSeries,
  DATE_FORMATS,
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
 * look (color, font, opacity…). Close data share a tile: the moving and elapsed times, the
 * average and highest heart rates (ADR 009). To change a variant, the user replaces the widget.
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
      Pick<LayerOf<'summaryChart'>, 'kind' | 'value' | 'barValues' | 'averageLine'> &
        Partial<Pick<LayerOf<'summaryChart'>, 'bucket'>>
    >
  | Readonly<
      Pick<
        LayerOf<'activityChart'>,
        'kind' | 'series' | 'splitPace' | 'splitElevation' | 'maxLabel' | 'averageLine'
      >
    >
  | Readonly<
      Pick<LayerOf<'logo'>, 'kind' | 'brand' | 'variant'> & Partial<Pick<LayerOf<'logo'>, 'tone'>>
    >;

/** What a new layer is made from: a catalog item, with the typed content for free text. */
export type NewLayer =
  Exclude<CatalogItem, { kind: 'text' }> | { readonly kind: 'text'; readonly content: string };

export type CatalogSectionId = 'data' | 'text' | 'route' | 'charts' | 'brand';

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
      return `logo-${item.brand}`;
    case 'activityChart':
      return `chart-${item.series}`;
    case 'summaryChart':
      return `summaryChart-${item.value}`;
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
        return [
          item.variant === 'wordmark' ? undefined : item.variant,
          item.tone === 'light' ? undefined : item.tone,
        ];
      case 'activityChart':
        return [
          item.splitPace === false ? 'nopace' : undefined,
          flag(item.splitElevation, 'elevation'),
          flag(item.maxLabel, 'max'),
          flag(item.averageLine, 'average'),
        ];
      case 'summaryChart':
        return [
          item.bucket === 'auto' ? undefined : item.bucket,
          flag(item.barValues, 'values'),
          flag(item.averageLine, 'average'),
        ];
      case 'route':
      case 'summaryRoutes':
        return [item.line, flag(item.glow, 'glow')];
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

/** Metrics that share a tile with a close one: two times, two heart rates, two altitudes. */
const SHARED_TILES: Partial<Record<MetricId | SummaryMetricId, string>> = {
  movingTime: 'time',
  elapsedTime: 'time',
  averageHeartRate: 'heartRate',
  maxHeartRate: 'heartRate',
  elevationGain: 'elevation',
  maxElevation: 'elevation',
  averagePower: 'power',
  weightedAveragePower: 'power',
};

/**
 * A data widget in each way its value can be written (its time or pace notation), in its tile.
 * The first is the default, which the layer leaves out. Nothing is rounded: distances keep their
 * two decimals and times their seconds (ADR 009).
 */
function dataEntries(plain: DataItem): Entry[] {
  const writing = WRITINGS[plain.metric];
  const tile = `data-${SHARED_TILES[plain.metric] ?? plain.metric}`;
  const variants: DataItem[] =
    writing === 'time'
      ? [plain, ...TIME_NOTATIONS.slice(1).map((timeNotation) => ({ ...plain, timeNotation }))]
      : writing === 'pace'
        ? [plain, { ...plain, paceNotation: 'marks' }]
        : [plain];
  return variants.map((item) => ['data', tile, item]);
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
  return tileEntries('route', [
    { kind },
    { kind, glow: true },
    { kind, line: 'dashed' },
    { kind, line: 'dotted' },
  ]);
}

/**
 * An activity chart's variants. A line: plain, with its highest point marked, or with its average.
 * Splits: without values, with each split's pace (their default), with its pace and change in
 * altitude, or with the average.
 */
function chartEntries(series: ActivityChartSeries): Entry[] {
  const items: CatalogItem[] =
    series === 'splits'
      ? [
          { kind: 'activityChart', series, splitPace: false },
          { kind: 'activityChart', series },
          { kind: 'activityChart', series, splitElevation: true },
          { kind: 'activityChart', series, averageLine: true },
        ]
      : [
          { kind: 'activityChart', series },
          { kind: 'activityChart', series, maxLabel: true },
          { kind: 'activityChart', series, averageLine: true },
        ];
  return tileEntries('charts', items);
}

/**
 * A period's bar charts: of distance (only when it has some) and of time, each with its bars of
 * every size the period offers (its own size first, on `auto`, so the design suits any period),
 * plain, with each bar's value, or with the average.
 */
function periodChartEntries(summary: PeriodSummary, autoBucket: BucketSize): Entry[] {
  const values = summaryHasDistance(summary)
    ? (['distance', 'movingTime'] as const)
    : (['movingTime'] as const);
  const buckets = [
    undefined,
    ...chartBucketOptions(summary.range).filter((size) => size !== autoBucket),
  ];
  return values.flatMap((value) =>
    tileEntries(
      'charts',
      buckets.flatMap((bucket): CatalogItem[] => {
        const chart = {
          kind: 'summaryChart',
          value,
          ...(bucket === undefined ? {} : { bucket }),
        } as const;
        return [chart, { ...chart, barValues: true }, { ...chart, averageLine: true }];
      }),
    ),
  );
}

/**
 * The AllRun name, monogram and both, light: its tone (light, dark or the brand's colors) is
 * part of its look, chosen in the style panel.
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

const SECTION_ORDER: readonly CatalogSectionId[] = ['data', 'text', 'route', 'charts', 'brand'];

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
 * Widgets for one activity: the metrics of its sport it has values for (in the sport's order
 * within each section), free text and its name, its date, its place when it can be named
 * (`withPlace`), the route when it has GPS, the `charts` it recorded data for (see
 * `availableActivityCharts`), and the logo. Time O(m + c) for the m metrics of the sport and c
 * charts.
 */
export function activityCatalog(
  activity: Activity,
  charts: readonly ActivityChartSeries[] = [],
  withPlace = false,
): CatalogSection[] {
  return sections([
    ...availableMetrics(activity).flatMap((metric) => dataEntries({ kind: 'metric', metric })),
    ...tileEntries('text', [{ kind: 'text' }, { kind: 'info', field: 'activityName' }]),
    // The first format is the default, which the layer leaves out.
    ...tileEntries(
      'text',
      OFFERED_DATE_FORMATS.map((dateFormat, i) => ({
        kind: 'info',
        field: 'activityDate',
        ...(i === 0 ? {} : { dateFormat }),
      })),
    ),
    ...(withPlace
      ? tileEntries(
          'text',
          PLACE_FORMATS.map((placeFormat, i) => ({
            kind: 'info',
            field: 'activityPlace',
            ...(i === 0 ? {} : { placeFormat }),
          })),
        )
      : []),
    ...(activity.routePolyline === null ? [] : lineEntries('route')),
    ...charts.flatMap(chartEntries),
    ...BRAND,
  ]);
}

/**
 * Widgets for a period summary: every total, free text, the period name in each format, the
 * overlaid routes when any activity has GPS, the bar charts (`autoBucket` is the period's own bar
 * size, see `bucketForPeriod`), and the logo. Formats of the name that write a period the same
 * (all of them, for a year) are one widget for the user: the gallery drops the repeats. Time O(1).
 */
export function summaryCatalog(summary: PeriodSummary, autoBucket: BucketSize): CatalogSection[] {
  return sections([
    ...availableSummaryMetrics(summary).flatMap((metric) =>
      dataEntries({ kind: 'summaryMetric', metric }),
    ),
    ...tileEntries('text', [{ kind: 'text' }]),
    ...tileEntries(
      'text',
      PERIOD_FORMATS.map((periodFormat, i) => ({
        kind: 'info',
        field: 'periodName',
        ...(i === 0 ? {} : { periodFormat }),
      })),
    ),
    ...(summary.routes.length === 0 ? [] : lineEntries('summaryRoutes')),
    ...periodChartEntries(summary, autoBucket),
    ...BRAND,
  ]);
}
