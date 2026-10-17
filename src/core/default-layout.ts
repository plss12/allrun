import type { Activity } from './activity';
import type { NewLayer } from './layer-catalog';
import { availableMetrics } from './metrics';
import type { CanvasFormat, Layer, SummaryMetricId, Template } from './template';

/**
 * Starting compositions for the editor: something good-looking on screen the moment a photo is
 * picked, which the user then rearranges. Starter templates (milestone 3d) will replace these as
 * the default choice.
 *
 * Every canvas is 1080 px wide but their heights differ (1920 for stories down to 566 for
 * landscape posts), so each format places every element explicitly: tall formats stack them,
 * the landscape format splits the canvas into a graphic column and a text column.
 */

const WHITE = '#FFFFFF';

type TextStyle = Extract<Layer, { kind: 'text' }>['style'];

const textStyle = (overrides: Partial<TextStyle> = {}): TextStyle => ({
  font: 'inter',
  color: WHITE,
  bold: false,
  uppercase: false,
  align: 'center',
  shadow: true,
  ...overrides,
});

/** Where an element goes: its center (0..1 of the canvas) and its scale. */
interface Slot {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

interface FormatLayout {
  readonly title: Slot;
  readonly subtitle: Slot;
  /** Widest the title and subtitle may be (fraction of the canvas width). */
  readonly titleMaxWidth: number;
  /** The route of an activity; it has no chart beside it, so it takes more room. */
  readonly route: Slot;
  /** The overlaid routes of a summary. */
  readonly routes: Slot;
  readonly chart: Slot;
  /** Row of metrics: its vertical center, horizontal span (0..1) and scale. */
  readonly metrics: { readonly y: number; readonly from: number; readonly to: number };
  /** Scale of the metrics and other text widgets. */
  readonly scale: number;
  readonly logo: Slot;
}

const slot = (x: number, y: number, scale: number): Slot => ({ x, y, scale });

const LAYOUTS: Readonly<Record<CanvasFormat, FormatLayout>> = {
  story: {
    title: slot(0.5, 0.1, 1),
    subtitle: slot(0.5, 0.15, 0.7),
    titleMaxWidth: 0.86,
    route: slot(0.5, 0.515, 1.15),
    routes: slot(0.5, 0.39, 1),
    chart: slot(0.5, 0.64, 1),
    metrics: { y: 0.81, from: 0, to: 1 },
    scale: 1,
    logo: slot(0.5, 0.94, 1),
  },
  tall: {
    title: slot(0.5, 0.075, 0.8),
    subtitle: slot(0.5, 0.125, 0.56),
    titleMaxWidth: 0.86,
    route: slot(0.5, 0.5, 0.92),
    routes: slot(0.5, 0.37, 0.8),
    chart: slot(0.5, 0.63, 0.8),
    metrics: { y: 0.8, from: 0, to: 1 },
    scale: 0.8,
    logo: slot(0.5, 0.935, 0.9),
  },
  portrait: {
    title: slot(0.5, 0.08, 0.75),
    subtitle: slot(0.5, 0.135, 0.525),
    titleMaxWidth: 0.86,
    route: slot(0.5, 0.5, 0.8625),
    routes: slot(0.5, 0.37, 0.75),
    chart: slot(0.5, 0.63, 0.75),
    metrics: { y: 0.8, from: 0, to: 1 },
    scale: 0.75,
    logo: slot(0.5, 0.935, 0.85),
  },
  square: {
    title: slot(0.5, 0.08, 0.6),
    subtitle: slot(0.5, 0.14, 0.42),
    titleMaxWidth: 0.86,
    route: slot(0.5, 0.485, 0.69),
    routes: slot(0.5, 0.36, 0.6),
    chart: slot(0.5, 0.61, 0.6),
    metrics: { y: 0.79, from: 0, to: 1 },
    scale: 0.6,
    logo: slot(0.5, 0.93, 0.85),
  },
  // Two columns: graphics on the left, text on the right.
  landscape: {
    title: slot(0.71, 0.15, 0.6),
    subtitle: slot(0.71, 0.25, 0.42),
    titleMaxWidth: 0.5,
    route: slot(0.25, 0.5, 0.75),
    routes: slot(0.25, 0.38, 0.5),
    chart: slot(0.25, 0.8, 0.42),
    metrics: { y: 0.56, from: 0.44, to: 0.98 },
    scale: 0.55,
    logo: slot(0.71, 0.86, 0.75),
  },
};

const at = ({ x, y, scale }: Slot) => ({ x, y, scale, rotation: 0 });

/**
 * Centers and maximum width of a row of `count` widgets across `from`..`to`: the span split into
 * equal columns, each widget a little narrower than its column so neighbours never touch.
 */
function metricsRow(layout: FormatLayout, count: number) {
  const { from, to, y } = layout.metrics;
  const column = (to - from) / count;
  return {
    maxWidth: column * 0.9,
    slots: Array.from({ length: count }, (_, i) =>
      slot(from + column * (i + 0.5), y, layout.scale),
    ),
  };
}

const logo = (layout: FormatLayout): Layer => ({
  id: 'logo',
  kind: 'logo',
  brand: 'allrun',
  tone: 'light',
  variant: 'wordmark',
  // The watermark is the free publicity of the app: its slot shrinks less than other widgets.
  transform: at(layout.logo),
  opacity: 0.95,
});

/**
 * Default composition for one activity: name and date, the route, the three most relevant
 * metrics of its sport and the AllRun logo.
 */
export function defaultActivityTemplate(
  activity: Activity,
  format: CanvasFormat = 'story',
): Template {
  const layout = LAYOUTS[format];
  const metrics = availableMetrics(activity).slice(0, 3);
  const row = metricsRow(layout, metrics.length);
  const layers: Layer[] = [];
  if (activity.routePolyline !== null) {
    layers.push({
      id: 'route',
      kind: 'route',
      stroke: { color: WHITE, width: 8 },
      transform: at(layout.route),
      opacity: 0.95,
    });
  }
  layers.push(
    {
      id: 'name',
      kind: 'info',
      field: 'activityName',
      maxWidth: layout.titleMaxWidth,
      style: textStyle({ bold: true }),
      transform: at(layout.title),
      opacity: 1,
    },
    {
      id: 'date',
      kind: 'info',
      field: 'activityDate',
      maxWidth: layout.titleMaxWidth,
      style: textStyle(),
      transform: at(layout.subtitle),
      opacity: 0.9,
    },
    ...metrics.map((metric, i): Layer => ({
      id: `metric-${metric}`,
      kind: 'metric',
      metric,
      showLabel: true,
      showUnit: true,
      maxWidth: row.maxWidth,
      style: textStyle({ font: 'bebasNeue' }),
      transform: at(row.slots[i]),
      opacity: 1,
    })),
    logo(layout),
  );
  return { version: 1, id: 'default-activity', name: 'AllRun', mode: 'activity', format, layers };
}

const SUMMARY_METRICS: readonly SummaryMetricId[] = [
  'totalDistance',
  'totalMovingTime',
  'activityCount',
];

/**
 * Default composition for a period summary: the period name, every route of the period
 * overlaid, a bar chart of the distance (bars sized to the period), the main totals and the logo.
 */
export function defaultSummaryTemplate(format: CanvasFormat = 'story'): Template {
  const layout = LAYOUTS[format];
  const row = metricsRow(layout, SUMMARY_METRICS.length);
  const layers: Layer[] = [
    {
      id: 'period',
      kind: 'info',
      field: 'periodName',
      maxWidth: layout.titleMaxWidth,
      style: textStyle({ bold: true, uppercase: true }),
      transform: at(layout.title),
      opacity: 1,
    },
    {
      id: 'routes',
      kind: 'summaryRoutes',
      stroke: { color: WHITE, width: 4 },
      transform: at(layout.routes),
      opacity: 0.85,
    },
    {
      id: 'chart',
      kind: 'summaryChart',
      bucket: 'auto',
      value: 'distance',
      color: WHITE,
      axisLabels: true,
      transform: at(layout.chart),
      opacity: 0.9,
    },
    ...SUMMARY_METRICS.map((metric, i): Layer => ({
      id: `total-${metric}`,
      kind: 'summaryMetric',
      metric,
      showLabel: true,
      showUnit: true,
      maxWidth: row.maxWidth,
      style: textStyle({ font: 'bebasNeue' }),
      transform: at(row.slots[i]),
      opacity: 1,
    })),
    logo(layout),
  ];
  return { version: 1, id: 'default-summary', name: 'AllRun', mode: 'summary', format, layers };
}

/**
 * A widget added from the picker, with the same look and size it has in the default layout of
 * `format`, centered on the canvas (the user then drags it into place).
 */
export function newLayer(item: NewLayer, id: string, format: CanvasFormat): Layer {
  const layout = LAYOUTS[format];
  const centered = (scale: number) => ({ x: 0.5, y: 0.5, scale, rotation: 0 });
  switch (item.kind) {
    case 'metric':
    case 'summaryMetric':
      return {
        ...item,
        id,
        showLabel: true,
        showUnit: true,
        style: textStyle({ font: 'bebasNeue' }),
        transform: centered(layout.scale),
        opacity: 1,
      };
    case 'info': {
      const isTitle = item.field !== 'activityDate';
      return {
        ...item,
        id,
        maxWidth: layout.titleMaxWidth,
        style: textStyle({ bold: isTitle, uppercase: item.field === 'periodName' }),
        transform: centered(isTitle ? layout.title.scale : layout.subtitle.scale),
        opacity: isTitle ? 1 : 0.9,
      };
    }
    case 'text':
      return {
        ...item,
        id,
        maxWidth: layout.titleMaxWidth,
        style: textStyle({ bold: true }),
        transform: centered(layout.title.scale),
        opacity: 1,
      };
    case 'route':
      return {
        ...item,
        id,
        stroke: { color: WHITE, width: 8 },
        transform: centered(layout.route.scale),
        opacity: 0.95,
      };
    case 'summaryRoutes':
      return {
        ...item,
        id,
        stroke: { color: WHITE, width: 4 },
        transform: centered(layout.routes.scale),
        opacity: 0.85,
      };
    case 'summaryChart':
      return {
        ...item,
        id,
        bucket: 'auto',
        value: 'distance',
        color: WHITE,
        axisLabels: true,
        transform: centered(layout.chart.scale),
        opacity: 0.9,
      };
    case 'logo':
      return {
        ...item,
        id,
        tone: 'light',
        variant: 'wordmark',
        transform: centered(layout.logo.scale),
        opacity: 0.95,
      };
  }
}
