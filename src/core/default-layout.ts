import type { Activity } from './activity';
import { availableMetrics } from './metrics';
import type { BucketSize } from './summary';
import type { CanvasFormat, Layer, SummaryMetricId, Template } from './template';

/**
 * Starting compositions for the editor: something good-looking on screen the moment a photo is
 * picked, which the user then rearranges. Starter templates (milestone 3d) will replace these as
 * the default choice.
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

/** Horizontal centers for a row of `count` evenly spaced widgets. */
const rowPositions = (count: number): number[] =>
  Array.from({ length: count }, (_, i) => (i + 1) / (count + 1));

const logo = (): Layer => ({
  id: 'logo',
  kind: 'logo',
  brand: 'allrun',
  tone: 'light',
  transform: at(0.5, 0.94),
  opacity: 0.9,
});

/**
 * Default composition for one activity: name and date on top, the route in the middle, the three
 * most relevant metrics of its sport below and the AllRun logo at the bottom.
 */
export function defaultActivityTemplate(
  activity: Activity,
  format: CanvasFormat = 'story',
): Template {
  const metrics = availableMetrics(activity).slice(0, 3);
  const layers: Layer[] = [];
  if (activity.routePolyline !== null) {
    layers.push({
      id: 'route',
      kind: 'route',
      stroke: { color: WHITE, width: 8 },
      transform: at(0.5, 0.42),
      opacity: 0.95,
    });
  }
  layers.push(
    {
      id: 'name',
      kind: 'info',
      field: 'activityName',
      style: textStyle({ bold: true }),
      transform: at(0.5, 0.1),
      opacity: 1,
    },
    {
      id: 'date',
      kind: 'info',
      field: 'activityDate',
      style: textStyle(),
      transform: at(0.5, 0.15, 0.7),
      opacity: 0.9,
    },
    ...metrics.map((metric, i): Layer => ({
      id: `metric-${metric}`,
      kind: 'metric',
      metric,
      showLabel: true,
      showUnit: true,
      style: textStyle({ font: 'bebasNeue' }),
      transform: at(rowPositions(metrics.length)[i], 0.8),
      opacity: 1,
    })),
    logo(),
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
  const layers: Layer[] = [
    {
      id: 'period',
      kind: 'info',
      field: 'periodName',
      style: textStyle({ bold: true, uppercase: true }),
      transform: at(0.5, 0.1),
      opacity: 1,
    },
    {
      id: 'routes',
      kind: 'summaryRoutes',
      stroke: { color: WHITE, width: 4 },
      transform: at(0.5, 0.38),
      opacity: 0.85,
    },
    {
      id: 'chart',
      kind: 'summaryChart',
      bucket,
      value: 'distance',
      color: WHITE,
      transform: at(0.5, 0.64),
      opacity: 0.9,
    },
    ...SUMMARY_METRICS.map((metric, i): Layer => ({
      id: `total-${metric}`,
      kind: 'summaryMetric',
      metric,
      showLabel: true,
      showUnit: true,
      style: textStyle({ font: 'bebasNeue' }),
      transform: at(rowPositions(SUMMARY_METRICS.length)[i], 0.82),
      opacity: 1,
    })),
    logo(),
  ];
  return { version: 1, id: 'default-summary', name: 'AllRun', mode: 'summary', format, layers };
}
