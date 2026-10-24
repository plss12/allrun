import {
  fitWidth,
  logoLayer,
  slot,
  type Slot,
  type TemplateData,
  textStyle,
  WHITE,
} from './layout-kit';
import { availableMetrics } from './metrics';
import { defaultSummaryMetrics, summaryHasDistance } from './summary-metrics';
import {
  CANVAS_FORMATS,
  type CanvasFormat,
  type FontId,
  type Layer,
  type Template,
} from './template';

/**
 * Minimal: the photo leads. Everything small, in Inter, grouped in the bottom left corner: a tiny
 * route or bar chart, the name, the date and the values one per line, without labels.
 *
 * The block is laid out in canvas pixels from the bottom edge, so it has the same size in every
 * format (they are all 1080 px wide); only the landscape format, too short for it, shrinks it
 * and leaves the graphic out.
 */

const FONT: FontId = 'inter';

/** Center of the block's column, as a fraction of the canvas width. */
const COLUMN_X = 0.25;
/** Widest any line of the block may be, as a fraction of the canvas width. */
const COLUMN_WIDTH = 0.4;
/** Room under the block, in canvas pixels. */
const MARGIN = 64;

// Scale of each line and the room it takes, in canvas pixels; then the spacing between groups.
const LOGO = { scale: 0.5, height: 36 };
const VALUE = { scale: 0.55, height: 66 };
const DATE = { scale: 0.45, height: 32 };
const NAME = { scale: 0.66, height: 46 };
const ROUTE = { scale: 0.26, height: 166 };
const CHART = { scale: 0.4, height: 96 };
const GAP_ABOVE_LOGO = 30;
const GAP_ABOVE_VALUES = 16;
const GAP_ABOVE_TITLE = 26;

/** Lines placed from the bottom of the canvas up, at `shrink` of their size. */
function stackUp(format: CanvasFormat, shrink: number) {
  const height = CANVAS_FORMATS[format].height;
  let bottom = MARGIN * shrink;
  return {
    /** The slot of the next line up, `room` pixels tall at a `scale` before shrinking. */
    place({ scale, height: room }: { scale: number; height: number }): Slot {
      const center = bottom + (room * shrink) / 2;
      bottom += room * shrink;
      return slot(COLUMN_X, 1 - center / height, scale * shrink);
    },
    gap(pixels: number) {
      bottom += pixels * shrink;
    },
  };
}

const at = (where: Slot) => ({ transform: { ...where, rotation: 0 } });

/** A line of text in `where`, kept within the column. */
const line = (where: Slot) => ({ maxWidth: fitWidth(COLUMN_WIDTH, where.scale), ...at(where) });

/**
 * The values of the block, without labels: those that read on their own. A number of
 * activities would be a bare "12", so summaries leave it out.
 */
function valueLayers(data: TemplateData, slotOf: (index: number) => Slot): Layer[] {
  const style = textStyle(FONT, { bold: true });
  const common = { showLabel: false, showUnit: true, style, opacity: 1 };
  if (data.mode === 'activity') {
    return availableMetrics(data.activity)
      .slice(0, 3)
      .map((metric, i) => ({
        id: `metric-${metric}`,
        kind: 'metric',
        metric,
        ...common,
        ...line(slotOf(i)),
      }));
  }
  return defaultSummaryMetrics(data.summary)
    .filter((metric) => metric !== 'activityCount')
    .map((metric, i) => ({
      id: `total-${metric}`,
      kind: 'summaryMetric',
      metric,
      ...common,
      ...line(slotOf(i)),
    }));
}

export function minimalTemplate(data: TemplateData, format: CanvasFormat): Template {
  const landscape = format === 'landscape';
  const stack = stackUp(format, landscape ? 0.8 : 1);

  const logo = logoLayer(stack.place(LOGO), 0.9);
  stack.gap(GAP_ABOVE_LOGO);
  // The first value goes on top: count them, then place them from the last one up.
  const count = valueLayers(data, () => slot(0, 0, 1)).length;
  const valueSlots = Array.from({ length: count }, () => stack.place(VALUE)).reverse();
  const values = valueLayers(data, (i) => valueSlots[i]);
  stack.gap(GAP_ABOVE_VALUES);

  const titles: Layer[] = [];
  if (data.mode === 'activity') {
    const date = line(stack.place(DATE));
    const name = line(stack.place(NAME));
    titles.push(
      {
        id: 'name',
        kind: 'info',
        field: 'activityName',
        style: textStyle(FONT, { bold: true }),
        ...name,
        opacity: 1,
      },
      {
        id: 'date',
        kind: 'info',
        field: 'activityDate',
        style: textStyle(FONT),
        ...date,
        opacity: 0.85,
      },
    );
  } else {
    titles.push({
      id: 'period',
      kind: 'info',
      field: 'periodName',
      style: textStyle(FONT, { bold: true }),
      ...line(stack.place(NAME)),
      opacity: 1,
    });
  }
  stack.gap(GAP_ABOVE_TITLE);

  const graphics: Layer[] = [];
  if (!landscape && data.mode === 'activity' && data.activity.routePolyline !== null) {
    graphics.push({
      id: 'route',
      kind: 'route',
      // Thick for its size, so the small route still reads.
      stroke: { color: WHITE, width: 16 },
      ...at(stack.place(ROUTE)),
      opacity: 1,
    });
  } else if (!landscape && data.mode === 'summary') {
    graphics.push({
      id: 'chart',
      kind: 'summaryChart',
      bucket: 'auto',
      look: 'highlight',
      value: summaryHasDistance(data.summary) ? 'distance' : 'movingTime',
      color: WHITE,
      axisLabels: false,
      header: false,
      font: FONT,
      bold: true,
      uppercase: true,
      align: 'center',
      ...at(stack.place(CHART)),
      opacity: 1,
    });
  }

  return {
    version: 1,
    id: `minimal-${data.mode}`,
    mode: data.mode,
    format,
    layers: [...graphics, ...titles, ...values, logo],
  };
}
