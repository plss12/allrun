import {
  at,
  fitWidth,
  logoLayer,
  row,
  type Slot,
  slot,
  type TemplateData,
  textStyle,
  WHITE,
} from './layout-kit';
import { availableMetrics } from './metrics';
import { defaultSummaryMetrics, summaryHasDistance } from './summary-metrics';
import type { CanvasFormat, FontId, Layer, Template } from './template';

/**
 * Poster: the data as the star. The main value huge in Archivo Black, the next ones under it,
 * the name small on top and, where there is room, the route or the bars as a small graphic.
 */

const FONT: FontId = 'unbounded';

interface PosterLayout {
  readonly title: Slot;
  readonly subtitle: Slot;
  /** Widest the title and subtitle may be on the canvas (fraction of its width). */
  readonly titleMaxWidth: number;
  /** The route or the bar chart; `null` where there is no room for it. */
  readonly graphic: Slot | null;
  /** The main value. */
  readonly hero: Slot;
  readonly heroMaxWidth: number;
  /**
   * The other values: stacked under the main one (`slots`, as many as values at most), or side by
   * side in a row.
   */
  readonly rest:
    | { readonly kind: 'stack'; readonly slots: readonly Slot[]; readonly maxWidth: number }
    | {
        readonly kind: 'row';
        readonly y: number;
        readonly from: number;
        readonly to: number;
        readonly scale: number;
      };
  readonly logo: Slot;
}

const LAYOUTS: Readonly<Record<CanvasFormat, PosterLayout>> = {
  story: {
    title: slot(0.5, 0.07, 1.1),
    subtitle: slot(0.5, 0.108, 0.62),
    titleMaxWidth: 0.86,
    graphic: slot(0.5, 0.245, 0.62),
    hero: slot(0.5, 0.47, 2.6),
    heroMaxWidth: 0.9,
    rest: {
      kind: 'stack',
      slots: [slot(0.5, 0.66, 1.6), slot(0.5, 0.795, 1.6)],
      maxWidth: 0.86,
    },
    logo: slot(0.5, 0.94, 1),
  },
  tall: {
    title: slot(0.5, 0.07, 0.8),
    subtitle: slot(0.5, 0.112, 0.52),
    titleMaxWidth: 0.86,
    graphic: slot(0.5, 0.27, 0.5),
    hero: slot(0.5, 0.5, 2),
    heroMaxWidth: 0.9,
    rest: { kind: 'row', y: 0.76, from: 0.05, to: 0.95, scale: 1.15 },
    logo: slot(0.5, 0.93, 0.9),
  },
  portrait: {
    title: slot(0.5, 0.075, 0.78),
    subtitle: slot(0.5, 0.12, 0.5),
    titleMaxWidth: 0.86,
    graphic: slot(0.5, 0.27, 0.46),
    hero: slot(0.5, 0.5, 1.9),
    heroMaxWidth: 0.9,
    rest: { kind: 'row', y: 0.76, from: 0.05, to: 0.95, scale: 1.05 },
    logo: slot(0.5, 0.935, 0.85),
  },
  square: {
    title: slot(0.5, 0.08, 0.7),
    subtitle: slot(0.5, 0.135, 0.45),
    titleMaxWidth: 0.86,
    graphic: null,
    hero: slot(0.5, 0.42, 1.7),
    heroMaxWidth: 0.9,
    rest: { kind: 'row', y: 0.72, from: 0.05, to: 0.95, scale: 0.95 },
    logo: slot(0.5, 0.92, 0.8),
  },
  // Two columns: the name and the main value on the left, the other values on the right.
  landscape: {
    title: slot(0.33, 0.14, 0.6),
    subtitle: slot(0.33, 0.24, 0.4),
    titleMaxWidth: 0.58,
    graphic: null,
    hero: slot(0.33, 0.56, 1.35),
    heroMaxWidth: 0.6,
    rest: {
      kind: 'stack',
      slots: [slot(0.8, 0.36, 0.8), slot(0.8, 0.66, 0.8)],
      maxWidth: 0.34,
    },
    logo: slot(0.33, 0.89, 0.6),
  },
};

const dataStyle = textStyle(FONT, { uppercase: true });

/** Slots and maximum width of the values after the main one. */
function restSlots(layout: PosterLayout, count: number) {
  const { rest } = layout;
  if (rest.kind === 'row') {
    return row(count, rest);
  }
  const slots = rest.slots.slice(0, count);
  return { maxWidth: fitWidth(rest.maxWidth, Math.max(...slots.map((s) => s.scale))), slots };
}

/**
 * The main value in `hero` and the following ones in the other slots, as layers built by
 * `layer` (a metric or a summary total).
 */
function values<T extends string>(
  layout: PosterLayout,
  metrics: readonly T[],
  layer: (metric: T, where: Slot, maxWidth: number) => Layer,
): Layer[] {
  const [first, ...others] = metrics;
  if (first === undefined) {
    return [];
  }
  const rest = restSlots(layout, others.length);
  return [
    layer(first, layout.hero, fitWidth(layout.heroMaxWidth, layout.hero.scale)),
    ...others.flatMap((metric, i) => {
      const where = rest.slots[i];
      return where === undefined ? [] : [layer(metric, where, rest.maxWidth)];
    }),
  ];
}

export function posterTemplate(data: TemplateData, format: CanvasFormat): Template {
  const layout = LAYOUTS[format];
  const layers: Layer[] = [];
  if (data.mode === 'activity') {
    const { activity } = data;
    if (layout.graphic !== null && activity.routePolyline !== null) {
      layers.push({
        id: 'route',
        kind: 'route',
        stroke: { color: WHITE, width: 10 },
        transform: at(layout.graphic),
        opacity: 1,
      });
    }
    layers.push(
      {
        id: 'name',
        kind: 'info',
        field: 'activityName',
        maxWidth: fitWidth(layout.titleMaxWidth, layout.title.scale),
        style: textStyle(FONT, { uppercase: true }),
        transform: at(layout.title),
        opacity: 1,
      },
      {
        id: 'date',
        kind: 'info',
        field: 'activityDate',
        maxWidth: fitWidth(layout.titleMaxWidth, layout.subtitle.scale),
        style: textStyle(FONT, { uppercase: true }),
        transform: at(layout.subtitle),
        opacity: 0.85,
      },
      ...values(layout, availableMetrics(activity).slice(0, 3), (metric, where, maxWidth) => ({
        id: `metric-${metric}`,
        kind: 'metric',
        metric,
        showLabel: true,
        showUnit: true,
        maxWidth,
        style: dataStyle,
        transform: at(where),
        opacity: 1,
      })),
    );
  } else {
    const { summary } = data;
    if (layout.graphic !== null) {
      layers.push({
        id: 'chart',
        kind: 'summaryChart',
        bucket: 'auto',
        value: summaryHasDistance(summary) ? 'distance' : 'movingTime',
        color: WHITE,
        axisLabels: false,
        // Too small to read at a graphic's size: the bars speak for themselves.
        header: false,
        font: FONT,
        bold: false,
        uppercase: true,
        align: 'center',
        transform: at(layout.graphic),
        opacity: 1,
      });
    }
    layers.push(
      {
        id: 'period',
        kind: 'info',
        field: 'periodName',
        maxWidth: fitWidth(layout.titleMaxWidth, layout.title.scale),
        style: textStyle(FONT, { uppercase: true }),
        transform: at(layout.title),
        opacity: 1,
      },
      ...values(layout, defaultSummaryMetrics(summary), (metric, where, maxWidth) => ({
        id: `total-${metric}`,
        kind: 'summaryMetric',
        metric,
        showLabel: true,
        showUnit: true,
        maxWidth,
        style: dataStyle,
        transform: at(where),
        opacity: 1,
      })),
    );
  }
  layers.push(logoLayer(layout.logo, 1));
  return { version: 1, id: `poster-${data.mode}`, mode: data.mode, format, layers };
}
