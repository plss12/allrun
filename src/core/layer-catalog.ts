import type { Activity } from './activity';
import { availableMetrics, type MetricId } from './metrics';
import type { PeriodSummary } from './summary';
import { type Layer, SUMMARY_METRIC_IDS, type SummaryMetricId } from './template';

/**
 * The widgets the user can add to the canvas, grouped for the editor's picker. Only what the
 * current activity or period can show is offered: metrics the activity has a value for, the route
 * when there is one. `default-layout.ts` turns a pick into a layer with the default look.
 */

type InfoField = Extract<Layer, { kind: 'info' }>['field'];
type Brand = Extract<Layer, { kind: 'logo' }>['brand'];

/** One widget to add. Free text gets its content once the user has typed it. */
export type CatalogItem =
  | { readonly kind: 'metric'; readonly metric: MetricId }
  | { readonly kind: 'summaryMetric'; readonly metric: SummaryMetricId }
  | { readonly kind: 'info'; readonly field: InfoField }
  | { readonly kind: 'text' }
  | { readonly kind: 'route' }
  | { readonly kind: 'summaryRoutes' }
  | { readonly kind: 'summaryChart' }
  | { readonly kind: 'logo'; readonly brand: Brand };

/** What a new layer is made from: a catalog item, with the typed content for free text. */
export type NewLayer =
  Exclude<CatalogItem, { kind: 'text' }> | { readonly kind: 'text'; readonly content: string };

export type CatalogSectionId = 'data' | 'text' | 'graphics' | 'brand';

export interface CatalogSection {
  readonly id: CatalogSectionId;
  readonly items: readonly CatalogItem[];
}

/** A key unique within a catalog, for lists; also the base of a new layer's id. */
export function catalogItemKey(item: CatalogItem | NewLayer): string {
  switch (item.kind) {
    case 'metric':
    case 'summaryMetric':
      return `${item.kind}-${item.metric}`;
    case 'info':
      return `info-${item.field}`;
    case 'logo':
      return `logo-${item.brand}`;
    case 'text':
    case 'route':
    case 'summaryRoutes':
    case 'summaryChart':
      return item.kind;
  }
}

const BRANDS: readonly CatalogItem[] = [{ kind: 'logo', brand: 'allrun' }];

/** Leaves out sections with nothing to offer. */
const sections = (all: readonly CatalogSection[]): CatalogSection[] =>
  all.filter((section) => section.items.length > 0);

/**
 * Widgets for one activity: the metrics of its sport it has values for (in the sport's order),
 * its name and date, free text, the route when it has GPS, and the logo. Time O(m) for the m
 * metrics of the sport.
 */
export function activityCatalog(activity: Activity): CatalogSection[] {
  return sections([
    {
      id: 'data',
      items: availableMetrics(activity).map((metric) => ({ kind: 'metric', metric })),
    },
    {
      id: 'text',
      items: [
        { kind: 'info', field: 'activityName' },
        { kind: 'info', field: 'activityDate' },
        { kind: 'text' },
      ],
    },
    { id: 'graphics', items: activity.routePolyline === null ? [] : [{ kind: 'route' }] },
    { id: 'brand', items: BRANDS },
  ]);
}

/**
 * Widgets for a period summary: every total, the period name, free text, the overlaid routes
 * when any activity has GPS, the bar chart, and the logo. Time O(1).
 */
export function summaryCatalog(summary: PeriodSummary): CatalogSection[] {
  return sections([
    {
      id: 'data',
      items: SUMMARY_METRIC_IDS.map((metric) => ({ kind: 'summaryMetric', metric })),
    },
    { id: 'text', items: [{ kind: 'info', field: 'periodName' }, { kind: 'text' }] },
    {
      id: 'graphics',
      items: [
        ...(summary.routes.length === 0 ? [] : [{ kind: 'summaryRoutes' } as const]),
        { kind: 'summaryChart' },
      ],
    },
    { id: 'brand', items: BRANDS },
  ]);
}
