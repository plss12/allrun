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
import { defaultSummaryMetrics } from './summary-metrics';
import { type CanvasFormat, type FontId, type Layer, type Template, newTemplate } from './template';

/**
 * Classic: elegant and airy, like a magazine caption. A thin route over the photo and, under it,
 * the name in Playfair Display with its date and just two values.
 */

const FONT: FontId = 'playfairDisplay';

/** How many values it shows: fewer data, more photo. */
const VALUES = 2;

interface ClassicLayout {
  /** The route of an activity or the overlaid routes of a summary. */
  readonly graphic: Slot;
  readonly title: Slot;
  readonly subtitle: Slot;
  /** Widest the title and subtitle may be on the canvas (fraction of its width). */
  readonly titleMaxWidth: number;
  /** Row of values: its vertical center, horizontal span (0..1) and scale. */
  readonly values: {
    readonly y: number;
    readonly from: number;
    readonly to: number;
    readonly scale: number;
  };
  readonly logo: Slot;
}

const LAYOUTS: Readonly<Record<CanvasFormat, ClassicLayout>> = {
  story: {
    graphic: slot(0.5, 0.42, 1),
    title: slot(0.5, 0.71, 1.3),
    subtitle: slot(0.5, 0.757, 0.55),
    titleMaxWidth: 0.86,
    values: { y: 0.845, from: 0.15, to: 0.85, scale: 0.85 },
    logo: slot(0.5, 0.945, 0.7),
  },
  tall: {
    graphic: slot(0.5, 0.33, 0.72),
    title: slot(0.5, 0.66, 1.05),
    subtitle: slot(0.5, 0.715, 0.45),
    titleMaxWidth: 0.86,
    values: { y: 0.81, from: 0.15, to: 0.85, scale: 0.7 },
    logo: slot(0.5, 0.935, 0.6),
  },
  portrait: {
    graphic: slot(0.5, 0.33, 0.66),
    title: slot(0.5, 0.655, 1),
    subtitle: slot(0.5, 0.71, 0.43),
    titleMaxWidth: 0.86,
    values: { y: 0.81, from: 0.15, to: 0.85, scale: 0.66 },
    logo: slot(0.5, 0.935, 0.6),
  },
  square: {
    graphic: slot(0.5, 0.3, 0.5),
    title: slot(0.5, 0.6, 0.85),
    subtitle: slot(0.5, 0.67, 0.38),
    titleMaxWidth: 0.86,
    values: { y: 0.8, from: 0.15, to: 0.85, scale: 0.58 },
    logo: slot(0.5, 0.93, 0.55),
  },
  // Two columns: the route on the left, the caption on the right.
  landscape: {
    graphic: slot(0.27, 0.5, 0.62),
    title: slot(0.69, 0.27, 0.7),
    subtitle: slot(0.69, 0.39, 0.35),
    titleMaxWidth: 0.5,
    values: { y: 0.62, from: 0.44, to: 0.94, scale: 0.52 },
    logo: slot(0.69, 0.88, 0.5),
  },
};

const valueStyle = textStyle(FONT);

export function classicTemplate(data: TemplateData, format: CanvasFormat): Template {
  const layout = LAYOUTS[format];
  const title = {
    maxWidth: fitWidth(layout.titleMaxWidth, layout.title.scale),
    style: textStyle(FONT, { bold: true }),
    transform: at(layout.title),
    opacity: 1,
  };
  const layers: Layer[] = [];
  if (data.mode === 'activity') {
    const { activity } = data;
    const metrics = availableMetrics(activity).slice(0, VALUES);
    const values = row(metrics.length, layout.values);
    if (activity.routePolyline !== null) {
      layers.push({
        id: 'route',
        kind: 'route',
        stroke: { color: WHITE, width: 5 },
        transform: at(layout.graphic),
        opacity: 0.9,
      });
    }
    layers.push(
      { id: 'name', kind: 'info', field: 'activityName', ...title },
      {
        id: 'date',
        kind: 'info',
        field: 'activityDate',
        maxWidth: fitWidth(layout.titleMaxWidth, layout.subtitle.scale),
        style: textStyle(FONT, { uppercase: true }),
        transform: at(layout.subtitle),
        opacity: 0.85,
      },
      ...metrics.map((metric, i): Layer => ({
        id: `metric-${metric}`,
        kind: 'metric',
        metric,
        showLabel: true,
        showUnit: true,
        maxWidth: values.maxWidth,
        style: valueStyle,
        transform: at(values.slots[i]),
        opacity: 1,
      })),
    );
  } else {
    const { summary } = data;
    const metrics = defaultSummaryMetrics(summary).slice(0, VALUES);
    const values = row(metrics.length, layout.values);
    layers.push(
      {
        id: 'routes',
        kind: 'summaryRoutes',
        stroke: { color: WHITE, width: 4 },
        transform: at(layout.graphic),
        opacity: 0.85,
      },
      { id: 'period', kind: 'info', field: 'periodName', ...title },
      ...metrics.map((metric, i): Layer => ({
        id: `total-${metric}`,
        kind: 'summaryMetric',
        metric,
        showLabel: true,
        showUnit: true,
        maxWidth: values.maxWidth,
        style: valueStyle,
        transform: at(values.slots[i]),
        opacity: 1,
      })),
    );
  }
  layers.push(logoLayer(layout.logo, 0.9));
  return newTemplate({ id: `classic-${data.mode}`, mode: data.mode, format, layers });
}
