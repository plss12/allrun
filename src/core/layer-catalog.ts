import type { Activity } from './activity';
import { availableMetrics, type MetricId } from './metrics';
import { chartBucketOptions } from './periods';
import type { BucketSize, PeriodSummary } from './summary';
import { availableSummaryMetrics, summaryHasDistance } from './summary-metrics';
import {
  type ActivityChartSeries,
  DATE_FORMATS,
  DISTANCE_DECIMALS,
  type Layer,
  type LayerKind,
  PERIOD_FORMATS,
  type SummaryMetricId,
  TIME_NOTATIONS,
} from './template';

/**
 * The widgets the user can add to the canvas, grouped in sections for the editor's gallery. Only
 * what the current activity or period can show is offered: metrics the activity has a value for,
 * the route when there is one, the charts it recorded data for. Each way of writing or drawing a
 * widget is a widget of its own (a distance with 2, 1 or no decimals; a dashed route; splits as
 * rows; a chart with its average line), so the gallery shows every variant ready-made and the
 * style panel keeps only the look (color, font, opacity…). To change a variant, the user replaces
 * the widget. `default-layout.ts` turns a pick into a layer with the default look.
 */

type LayerOf<K extends LayerKind> = Extract<Layer, { kind: K }>;
type LineStyle = NonNullable<LayerOf<'route'>['stroke']['line']>;
type DataFormat = 'decimals' | 'timeNotation' | 'paceNotation';
type LineLook = { readonly line?: LineStyle; readonly glow?: boolean };

/**
 * One widget to add, with the fields of its variant; a field left out takes the layer's default.
 * Free text gets its content once the user has typed it.
 */
export type CatalogItem =
  | Readonly<Pick<LayerOf<'metric'>, 'kind' | 'metric' | DataFormat>>
  | Readonly<Pick<LayerOf<'summaryMetric'>, 'kind' | 'metric' | DataFormat>>
  | Readonly<Pick<LayerOf<'info'>, 'kind' | 'field' | 'dateFormat' | 'periodFormat'>>
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

export type CatalogSectionId =
  | 'distance'
  | 'time'
  | 'pace'
  | 'elevation'
  | 'more'
  | 'text'
  | 'date'
  | 'period'
  | 'route'
  | 'elevationChart'
  | 'paceChart'
  | 'heartRateChart'
  | 'powerChart'
  | 'splits'
  | 'distanceChart'
  | 'timeChart'
  | 'brand';

export interface CatalogSection {
  readonly id: CatalogSectionId;
  readonly items: readonly CatalogItem[];
}

/**
 * The widget an item is a variant of: the same for a distance with 2, 1 or no decimals, or for
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
        return [item.decimals, item.timeNotation, item.paceNotation];
      case 'info':
        return [item.dateFormat, item.periodFormat];
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
type Writing = 'distance' | 'time' | 'pace' | 'plain';

/** A catalog item and the section it goes in. */
type Entry = readonly [CatalogSectionId, CatalogItem];

/** Which section each metric goes in and how its value can be written. */
const METRIC_GROUPS: Readonly<
  Record<MetricId | SummaryMetricId, readonly [CatalogSectionId, Writing]>
> = {
  distance: ['distance', 'distance'],
  totalDistance: ['distance', 'distance'],
  longestDistance: ['distance', 'distance'],
  movingTime: ['time', 'time'],
  elapsedTime: ['time', 'time'],
  totalMovingTime: ['time', 'time'],
  pace: ['pace', 'pace'],
  swimPace: ['pace', 'pace'],
  averagePace: ['pace', 'pace'],
  speed: ['pace', 'plain'],
  elevationGain: ['elevation', 'plain'],
  maxElevation: ['elevation', 'plain'],
  totalElevationGain: ['elevation', 'plain'],
  averageHeartRate: ['more', 'plain'],
  maxHeartRate: ['more', 'plain'],
  averagePower: ['more', 'plain'],
  weightedAveragePower: ['more', 'plain'],
  averageCadence: ['more', 'plain'],
  calories: ['more', 'plain'],
  activityCount: ['more', 'plain'],
};

/**
 * A data widget in each way its value can be written (its decimals, its time or pace notation),
 * in its section. The first is the default, which the layer leaves out.
 */
function dataEntries(plain: DataItem): Entry[] {
  const [section, writing] = METRIC_GROUPS[plain.metric];
  const variants: DataItem[] =
    writing === 'distance'
      ? [plain, ...DISTANCE_DECIMALS.slice(1).map((decimals) => ({ ...plain, decimals }))]
      : writing === 'time'
        ? [plain, ...TIME_NOTATIONS.slice(1).map((timeNotation) => ({ ...plain, timeNotation }))]
        : writing === 'pace'
          ? [plain, { ...plain, paceNotation: 'marks' }]
          : [plain];
  return variants.map((item) => [section, item]);
}

/**
 * Formats offered for an activity's date. The weekday with the start time is left out (the user
 * found it redundant); templates that use it still read.
 */
const OFFERED_DATE_FORMATS = DATE_FORMATS.filter((format) => format !== 'weekdayTime');

/** Route lines, solid, solid with a glow, dashed and dotted, in their section. */
function lineEntries(kind: 'route' | 'summaryRoutes'): Entry[] {
  const lines: CatalogItem[] = [
    { kind },
    { kind, glow: true },
    { kind, line: 'dashed' },
    { kind, line: 'dotted' },
  ];
  return lines.map((item) => ['route', item]);
}

/** The section of each activity chart. */
const CHART_SECTIONS: Readonly<Record<ActivityChartSeries, CatalogSectionId>> = {
  elevation: 'elevationChart',
  pace: 'paceChart',
  heartRate: 'heartRateChart',
  power: 'powerChart',
  splits: 'splits',
};

/**
 * An activity chart's variants. A line: plain, with its highest point marked, or with its average.
 * Splits: without values, with each split's pace (their default), with its pace and change in
 * altitude, or with the average.
 */
function chartEntries(series: ActivityChartSeries): Entry[] {
  const section = CHART_SECTIONS[series];
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
  return items.map((item) => [section, item]);
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
  return values.flatMap((value) => {
    const section = value === 'distance' ? 'distanceChart' : 'timeChart';
    return buckets.flatMap((bucket): Entry[] => {
      const chart = {
        kind: 'summaryChart',
        value,
        ...(bucket === undefined ? {} : { bucket }),
      } as const;
      return [
        [section, chart],
        [section, { ...chart, barValues: true }],
        [section, { ...chart, averageLine: true }],
      ];
    });
  });
}

/** The AllRun name, monogram and both, in each tone: light, dark and in the brand's colors. */
const BRAND: readonly Entry[] = (['light', 'dark', 'color'] as const).flatMap((tone) =>
  (['wordmark', 'mark', 'lockup'] as const).map((variant): Entry => [
    'brand',
    { kind: 'logo', brand: 'allrun', variant, tone },
  ]),
);

const SECTION_ORDER: readonly CatalogSectionId[] = [
  'distance',
  'time',
  'pace',
  'elevation',
  'more',
  'text',
  'date',
  'period',
  'route',
  'elevationChart',
  'paceChart',
  'heartRateChart',
  'powerChart',
  'splits',
  'distanceChart',
  'timeChart',
  'brand',
];

/**
 * Puts the items in their sections, in the gallery's order, leaving out sections with nothing
 * to offer. Items keep their order within a section.
 */
function sections(entries: readonly Entry[]): CatalogSection[] {
  return SECTION_ORDER.flatMap((id) => {
    const items = entries.filter(([section]) => section === id).map(([, item]) => item);
    return items.length === 0 ? [] : [{ id, items }];
  });
}

/**
 * Widgets for one activity: the metrics of its sport it has values for (in the sport's order
 * within each section), free text and its name, its date, the route when it has GPS, the
 * `charts` it recorded data for (see `availableActivityCharts`), and the logo. Time O(m + c) for
 * the m metrics of the sport and c charts.
 */
export function activityCatalog(
  activity: Activity,
  charts: readonly ActivityChartSeries[] = [],
): CatalogSection[] {
  return sections([
    ...availableMetrics(activity).flatMap((metric) => dataEntries({ kind: 'metric', metric })),
    ['text', { kind: 'text' }],
    ['text', { kind: 'info', field: 'activityName' }],
    // The first format is the default, which the layer leaves out.
    ...OFFERED_DATE_FORMATS.map((dateFormat, i): Entry => [
      'date',
      { kind: 'info', field: 'activityDate', ...(i === 0 ? {} : { dateFormat }) },
    ]),
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
    ['text', { kind: 'text' }],
    ...PERIOD_FORMATS.map((periodFormat, i): Entry => [
      'period',
      { kind: 'info', field: 'periodName', ...(i === 0 ? {} : { periodFormat }) },
    ]),
    ...(summary.routes.length === 0 ? [] : lineEntries('summaryRoutes')),
    ...periodChartEntries(summary, autoBucket),
    ...BRAND,
  ]);
}
