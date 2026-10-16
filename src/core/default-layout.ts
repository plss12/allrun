import type { Activity } from './activity';
import { availableMetrics } from './metrics';
import type { BucketSize } from './summary';
import type { CanvasFormat, Layer, SummaryMetricId, Template } from './template';

/**
 * Starting compositions for the editor: something good-looking on screen the moment a photo is
 * picked, which the user then rearranges. Starter templates (milestone 3d) will replace these as
 * the default choice.
 *
 * Every canvas is 1080 px wide but only the story format is 1920 px tall, so each format gets its
 * own vertical rhythm and a scale that shrinks the widgets to fit the shorter canvases.
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

const at = (x: number, y: number, scale = 1) => ({ x, y, scale, rotation: 0 });

/** Horizontal centers of a row of `count` widgets: the canvas split into equal columns. */
const rowPositions = (count: number): number[] =>
  Array.from({ length: count }, (_, i) => (i + 0.5) / count);

/** Widest each widget of a row of `count` may be: its column minus a gap to its neighbours. */
const rowMaxWidth = (count: number) => 0.9 / count;

/** Widest a full-width title may be. */
const TITLE_MAX_WIDTH = 0.86;

/** Vertical position (0..1) of each band of the composition, and the widget scale. */
interface FormatLayout {
  readonly scale: number;
  readonly title: number;
  readonly subtitle: number;
  readonly graphic: number;
  readonly chart: number;
  readonly metrics: number;
  readonly logo: number;
}

const LAYOUTS: Readonly<Record<CanvasFormat, FormatLayout>> = {
  story: {
    scale: 1,
    title: 0.1,
    subtitle: 0.15,
    graphic: 0.39,
    chart: 0.64,
    metrics: 0.81,
    logo: 0.94,
  },
  portrait: {
    scale: 0.75,
    title: 0.08,
    subtitle: 0.135,
    graphic: 0.37,
    chart: 0.63,
    metrics: 0.8,
    logo: 0.935,
  },
  square: {
    scale: 0.6,
    title: 0.08,
    subtitle: 0.14,
    graphic: 0.36,
    chart: 0.61,
    metrics: 0.79,
    logo: 0.93,
  },
};

/**
 * The watermark is the free publicity of the app: it shrinks less than the other widgets on
 * shorter canvases so the name stays readable.
 */
const MIN_LOGO_SCALE = 0.85;

const logo = (layout: FormatLayout): Layer => ({
  id: 'logo',
  kind: 'logo',
  brand: 'allrun',
  tone: 'light',
  variant: 'wordmark',
  transform: at(0.5, layout.logo, Math.max(layout.scale, MIN_LOGO_SCALE)),
  opacity: 0.95,
});

/**
 * Default composition for one activity: name and date on top, the route in the middle, the three
 * most relevant metrics of its sport below and the AllRun logo at the bottom.
 */
export function defaultActivityTemplate(
  activity: Activity,
  format: CanvasFormat = 'story',
): Template {
  const layout = LAYOUTS[format];
  const metrics = availableMetrics(activity).slice(0, 3);
  const layers: Layer[] = [];
  if (activity.routePolyline !== null) {
    layers.push({
      id: 'route',
      kind: 'route',
      stroke: { color: WHITE, width: 8 },
      // Without a chart band the route can take more room.
      transform: at(0.5, (layout.graphic + layout.chart) / 2, layout.scale * 1.15),
      opacity: 0.95,
    });
  }
  layers.push(
    {
      id: 'name',
      kind: 'info',
      field: 'activityName',
      maxWidth: TITLE_MAX_WIDTH,
      style: textStyle({ bold: true }),
      transform: at(0.5, layout.title, layout.scale),
      opacity: 1,
    },
    {
      id: 'date',
      kind: 'info',
      field: 'activityDate',
      maxWidth: TITLE_MAX_WIDTH,
      style: textStyle(),
      transform: at(0.5, layout.subtitle, layout.scale * 0.7),
      opacity: 0.9,
    },
    ...metrics.map((metric, i): Layer => ({
      id: `metric-${metric}`,
      kind: 'metric',
      metric,
      showLabel: true,
      showUnit: true,
      maxWidth: rowMaxWidth(metrics.length),
      style: textStyle({ font: 'bebasNeue' }),
      transform: at(rowPositions(metrics.length)[i], layout.metrics, layout.scale),
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
 * Default composition for a period summary: the period name on top, every route of the period
 * overlaid, a bar chart of the distance per `bucket`, the main totals and the logo.
 */
export function defaultSummaryTemplate(
  bucket: BucketSize,
  format: CanvasFormat = 'story',
): Template {
  const layout = LAYOUTS[format];
  const layers: Layer[] = [
    {
      id: 'period',
      kind: 'info',
      field: 'periodName',
      maxWidth: TITLE_MAX_WIDTH,
      style: textStyle({ bold: true, uppercase: true }),
      transform: at(0.5, layout.title, layout.scale),
      opacity: 1,
    },
    {
      id: 'routes',
      kind: 'summaryRoutes',
      stroke: { color: WHITE, width: 4 },
      transform: at(0.5, layout.graphic, layout.scale),
      opacity: 0.85,
    },
    {
      id: 'chart',
      kind: 'summaryChart',
      bucket,
      value: 'distance',
      color: WHITE,
      axisLabels: true,
      transform: at(0.5, layout.chart, layout.scale),
      opacity: 0.9,
    },
    ...SUMMARY_METRICS.map((metric, i): Layer => ({
      id: `total-${metric}`,
      kind: 'summaryMetric',
      metric,
      showLabel: true,
      showUnit: true,
      maxWidth: rowMaxWidth(SUMMARY_METRICS.length),
      style: textStyle({ font: 'bebasNeue' }),
      transform: at(rowPositions(SUMMARY_METRICS.length)[i], layout.metrics, layout.scale),
      opacity: 1,
    })),
    logo(layout),
  ];
  return { version: 1, id: 'default-summary', name: 'AllRun', mode: 'summary', format, layers };
}
