import type { Activity } from './activity';
import { blockLettering } from './activity-block';
import type { NewLayer } from './layer-catalog';
import { at, fitWidth, logoLayer, row, type Slot, slot, textStyle, WHITE } from './layout-kit';
import { availableMetrics } from './metrics';
import type { PeriodSummary } from './summary';
import { defaultSummaryMetrics, summaryHasDistance } from './summary-metrics';
import type { CanvasFormat, FontId, Layer, Template } from './template';

/**
 * Starting compositions for the editor: something good-looking on screen the moment a photo is
 * picked, which the user then rearranges. They are also the Sport starter template (see
 * `starter-templates.ts`).
 *
 * Every canvas is 1080 px wide but their heights differ (1920 for stories down to 566 for
 * landscape posts), so each format places every element explicitly: tall formats stack them,
 * the landscape format splits the canvas into a graphic column and a text column.
 */

/**
 * The one font of every text in these compositions (a mix of fonts reads as clutter); each
 * starter template brings its own. Condensed, so big numbers fit side by side.
 */
export const DEFAULT_FONT: FontId = 'barlowCondensed';

interface FormatLayout {
  readonly title: Slot;
  readonly subtitle: Slot;
  /** Widest the title and subtitle may be on the canvas (fraction of its width). */
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

const LAYOUTS: Readonly<Record<CanvasFormat, FormatLayout>> = {
  story: {
    title: slot(0.5, 0.1, 1.35),
    subtitle: slot(0.5, 0.15, 0.91),
    titleMaxWidth: 0.86,
    route: slot(0.5, 0.515, 1.15),
    routes: slot(0.5, 0.39, 1),
    chart: slot(0.5, 0.64, 1),
    metrics: { y: 0.81, from: 0.03, to: 0.97 },
    scale: 1.1,
    logo: slot(0.5, 0.94, 1),
  },
  tall: {
    title: slot(0.5, 0.075, 1.08),
    subtitle: slot(0.5, 0.125, 0.728),
    titleMaxWidth: 0.86,
    route: slot(0.5, 0.5, 0.92),
    routes: slot(0.5, 0.37, 0.8),
    chart: slot(0.5, 0.63, 0.8),
    metrics: { y: 0.8, from: 0.03, to: 0.97 },
    scale: 0.88,
    logo: slot(0.5, 0.935, 0.9),
  },
  portrait: {
    title: slot(0.5, 0.08, 1.0125),
    subtitle: slot(0.5, 0.135, 0.6825),
    titleMaxWidth: 0.86,
    route: slot(0.5, 0.5, 0.8625),
    routes: slot(0.5, 0.37, 0.75),
    chart: slot(0.5, 0.63, 0.75),
    metrics: { y: 0.8, from: 0.03, to: 0.97 },
    scale: 0.825,
    logo: slot(0.5, 0.935, 0.85),
  },
  square: {
    title: slot(0.5, 0.08, 0.81),
    subtitle: slot(0.5, 0.14, 0.546),
    titleMaxWidth: 0.86,
    route: slot(0.5, 0.485, 0.69),
    routes: slot(0.5, 0.35, 0.6),
    chart: slot(0.5, 0.625, 0.6),
    metrics: { y: 0.79, from: 0.03, to: 0.97 },
    scale: 0.66,
    logo: slot(0.5, 0.93, 0.85),
  },
  // Two columns: graphics on the left, text on the right.
  landscape: {
    title: slot(0.71, 0.15, 0.81),
    subtitle: slot(0.71, 0.25, 0.546),
    titleMaxWidth: 0.5,
    route: slot(0.25, 0.5, 0.75),
    routes: slot(0.25, 0.38, 0.5),
    chart: slot(0.25, 0.8, 0.42),
    metrics: { y: 0.56, from: 0.44, to: 0.96 },
    scale: 0.605,
    logo: slot(0.71, 0.86, 0.75),
  },
};

/** The row of metrics of a format with `count` widgets (see `row`). */
const metricsRow = (layout: FormatLayout, count: number) =>
  row(count, { ...layout.metrics, scale: layout.scale });

// The watermark is the free publicity of the app: its slot shrinks less than other widgets.
const logo = (layout: FormatLayout): Layer => logoLayer(layout.logo);

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
      maxWidth: fitWidth(layout.titleMaxWidth, layout.title.scale),
      style: textStyle(DEFAULT_FONT, { bold: true }),
      transform: at(layout.title),
      opacity: 1,
    },
    {
      id: 'date',
      kind: 'info',
      field: 'activityDate',
      maxWidth: fitWidth(layout.titleMaxWidth, layout.subtitle.scale),
      style: textStyle(DEFAULT_FONT),
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
      style: textStyle(DEFAULT_FONT, { bold: true, uppercase: true }),
      transform: at(row.slots[i]),
      opacity: 1,
    })),
    logo(layout),
  );
  return { version: 1, id: 'default-activity', name: 'AllRun', mode: 'activity', format, layers };
}

/**
 * Default composition for a period summary: the period name, every route of the period
 * overlaid, a bar chart (bars sized to the period), the headline totals and the logo. A period
 * without distance (gym sessions) charts and totals its time instead of "0.00 km".
 */
export function defaultSummaryTemplate(
  summary: PeriodSummary,
  format: CanvasFormat = 'story',
): Template {
  const layout = LAYOUTS[format];
  const metrics = defaultSummaryMetrics(summary);
  const row = metricsRow(layout, metrics.length);
  const layers: Layer[] = [
    {
      id: 'period',
      kind: 'info',
      field: 'periodName',
      maxWidth: fitWidth(layout.titleMaxWidth, layout.title.scale),
      style: textStyle(DEFAULT_FONT, { bold: true, uppercase: true }),
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
      value: summaryHasDistance(summary) ? 'distance' : 'movingTime',
      color: WHITE,
      axisLabels: true,
      // The totals are right under it: a header would repeat them.
      header: false,
      font: DEFAULT_FONT,
      bold: true,
      uppercase: true,
      align: 'center',
      transform: at(layout.chart),
      opacity: 0.9,
    },
    ...metrics.map((metric, i): Layer => ({
      id: `total-${metric}`,
      kind: 'summaryMetric',
      metric,
      showLabel: true,
      showUnit: true,
      maxWidth: row.maxWidth,
      style: textStyle(DEFAULT_FONT, { bold: true, uppercase: true }),
      transform: at(row.slots[i]),
      opacity: 1,
    })),
    logo(layout),
  ];
  return { version: 1, id: 'default-summary', name: 'AllRun', mode: 'summary', format, layers };
}

/**
 * A widget added from the picker, with the same look and size it has in the default layout of
 * `format`, centered on the canvas (the user then drags it into place). Its texts are in
 * `font`, the one of the design on the canvas (see `designFont`), so it doesn't stand out.
 */
export function newLayer(
  item: NewLayer,
  id: string,
  format: CanvasFormat,
  font: FontId = DEFAULT_FONT,
): Layer {
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
        style: textStyle(font, { bold: true, uppercase: true }),
        transform: centered(layout.scale),
        opacity: 1,
      };
    case 'info': {
      // The date and the place are subtitles under the name.
      const isTitle = item.field !== 'activityDate' && item.field !== 'activityPlace';
      const scale = isTitle ? layout.title.scale : layout.subtitle.scale;
      return {
        ...item,
        id,
        maxWidth: fitWidth(layout.titleMaxWidth, scale),
        style: textStyle(font, { bold: isTitle, uppercase: item.field === 'periodName' }),
        transform: centered(scale),
        opacity: isTitle ? 1 : 0.9,
      };
    }
    case 'text':
      return {
        ...item,
        id,
        maxWidth: fitWidth(layout.titleMaxWidth, layout.title.scale),
        style: textStyle(font, { bold: true }),
        transform: centered(layout.title.scale),
        opacity: 1,
      };
    case 'route':
    case 'summaryRoutes': {
      // The line's look goes in its stroke.
      const { kind, line, glow } = item;
      const one = kind === 'route';
      return {
        kind,
        id,
        stroke: {
          color: WHITE,
          width: one ? 8 : 4,
          ...(line === undefined ? {} : { line }),
          ...(glow === undefined ? {} : { glow }),
        },
        transform: centered(one ? layout.route.scale : layout.routes.scale),
        opacity: one ? 0.95 : 0.85,
      };
    }
    case 'summaryChart':
      return {
        bucket: 'auto',
        ...item,
        id,
        color: WHITE,
        axisLabels: true,
        font,
        bold: true,
        uppercase: true,
        align: 'center',
        transform: centered(layout.chart.scale),
        opacity: 0.9,
      };
    case 'activityChart':
      return {
        ...item,
        id,
        color: WHITE,
        font,
        bold: true,
        uppercase: true,
        align: 'center',
        transform: centered(layout.chart.scale),
        opacity: 0.9,
      };
    case 'logo':
      return {
        tone: 'light',
        ...item,
        id,
        transform: centered(layout.logo.scale),
        opacity: 0.95,
      };
    case 'activityBlock':
      // Blocks are designed for a story, and shrink with the other widgets in smaller formats.
      // Each comes in the font that suits it, not the design's (see `blockLettering`).
      return {
        ...item,
        id,
        logo: false,
        style: { ...blockLettering(item.block), color: WHITE, uppercase: true },
        transform: centered(layout.scale / LAYOUTS.story.scale),
        opacity: 1,
      };
  }
}

/**
 * The font of a design: the one most of its texts are in (the first of them on a tie), or the
 * default font when it has no text. Widgets added to it take this font. Time O(n) for n layers.
 */
export function designFont(layers: readonly Layer[]): FontId {
  const counts = new Map<FontId, number>();
  for (const layer of layers) {
    const font = textFont(layer);
    if (font !== null) {
      counts.set(font, (counts.get(font) ?? 0) + 1);
    }
  }
  let best: FontId = DEFAULT_FONT;
  let most = 0;
  for (const [font, count] of counts) {
    if (count > most) {
      best = font;
      most = count;
    }
  }
  return best;
}

/** Font of a layer's text, or `null` for layers without text. */
function textFont(layer: Layer): FontId | null {
  switch (layer.kind) {
    case 'metric':
    case 'summaryMetric':
    case 'info':
    case 'text':
    case 'activityBlock':
      return layer.style.font;
    case 'summaryChart':
    case 'activityChart':
      return layer.font;
    case 'route':
    case 'summaryRoutes':
    case 'logo':
      return null;
  }
}
