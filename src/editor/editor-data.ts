import type { Activity } from '@/core/activity';
import {
  type DisplayMetric,
  isPace,
  type MetricId,
  type MetricUnit,
  metricValue,
  toDisplayMetric,
  withPaceMarks,
} from '@/core/metrics';
import type { PeriodKind } from '@/core/periods';
import { type BucketSize, bucketize, type PeriodSummary, type SummaryBucket } from '@/core/summary';
import { summaryMetricValue, toDisplaySummaryMetric } from '@/core/summary-metrics';
import type { Layer, SummaryMetricId } from '@/core/template';
import { durationParts, type DistanceUnit, type DurationUnit } from '@/core/units';
import { formatActivityDate, formatMetric, formatPeriodName } from '@/ui/format';

/** A period summary to fill a template with. */
export interface SummaryData {
  readonly mode: 'summary';
  readonly kind: PeriodKind;
  readonly summary: PeriodSummary;
  /** The activities summed up (sport filter already applied), for charts of any bar size. */
  readonly activities: readonly Activity[];
  /** Bar size that suits the period, used by charts set to `auto`. */
  readonly bucketSize: BucketSize;
}

/** What the editor fills the template with: one activity, or a period summary. */
export type EditorData = { readonly mode: 'activity'; readonly activity: Activity } | SummaryData;

/**
 * Bars of a summary chart and their size: the chart's own size, or the period's for `auto`.
 * Time O(b + n) for b bars and n activities, space O(b).
 */
/** Key of the title of a chart measuring `value` in bars of `size` ("km per week"). */
export function chartTitleKey(
  value: Extract<Layer, { kind: 'summaryChart' }>['value'],
  size: BucketSize,
): ChartTitleKey {
  return `chartTitles.${value}.${size}`;
}

export function chartBuckets(
  layer: Extract<Layer, { kind: 'summaryChart' }>,
  data: SummaryData,
): { readonly size: BucketSize; readonly buckets: SummaryBucket[] } {
  const size = layer.bucket === 'auto' ? data.bucketSize : layer.bucket;
  return { size, buckets: bucketize(data.activities, data.summary.range, size) };
}

/** Translation key of a data widget's label. */
/** Translation key of a chart's title, which takes the distance unit as `{{unit}}`. */
export type ChartTitleKey =
  `chartTitles.${Extract<Layer, { kind: 'summaryChart' }>['value']}.${BucketSize}`;

/** Translation key of a label the canvas draws. */
export type LabelKey = `metrics.${MetricId}` | `summaryMetrics.${SummaryMetricId}` | ChartTitleKey;

/** Text content of a text-like layer, before translation and styling. */
export interface LayerText {
  readonly label: LabelKey | null;
  readonly value: string;
  readonly unit: MetricUnit | null;
}

export interface TextContext {
  readonly unit: DistanceUnit;
  readonly locale: string;
  /** How each unit of a time written in words is abbreviated in the app language ("min"). */
  readonly durationUnits: Readonly<Record<DurationUnit, string>>;
}

/** Shown in place of a value the activity or period doesn't have. */
export const MISSING_VALUE = '—';

/**
 * Text a layer displays for the given data, or `null` for layers that aren't text (route,
 * chart, logo) or that don't fit the data mode.
 */
export function layerText(layer: Layer, data: EditorData, context: TextContext): LayerText | null {
  switch (layer.kind) {
    case 'text':
      return { label: null, value: layer.content, unit: null };
    case 'metric': {
      if (data.mode !== 'activity') {
        return null;
      }
      const value = metricValue(data.activity, layer.metric);
      const label = layer.showLabel ? (`metrics.${layer.metric}` as const) : null;
      if (value === null || value <= 0) {
        return { label, value: MISSING_VALUE, unit: null };
      }
      const words = timeInWords(layer, value, context);
      if (words !== null) {
        return { label, value: words, unit: null };
      }
      const display = toDisplayMetric(layer.metric, value, {
        unit: context.unit,
        sportFamily: data.activity.sportFamily,
      });
      const formatted = formatMetric(inNotation(layer, display), context.locale);
      return { label, value: formatted.value, unit: layer.showUnit ? formatted.unit : null };
    }
    case 'summaryMetric': {
      if (data.mode !== 'summary') {
        return null;
      }
      const value = summaryMetricValue(data.summary, layer.metric);
      const label = layer.showLabel ? (`summaryMetrics.${layer.metric}` as const) : null;
      if (value === null) {
        return { label, value: MISSING_VALUE, unit: null };
      }
      const words = timeInWords(layer, value, context);
      if (words !== null) {
        return { label, value: words, unit: null };
      }
      const formatted = formatMetric(
        inNotation(layer, toDisplaySummaryMetric(layer.metric, value, context.unit)),
        context.locale,
      );
      return { label, value: formatted.value, unit: layer.showUnit ? formatted.unit : null };
    }
    case 'info':
      switch (layer.field) {
        case 'activityName':
          return data.mode === 'activity'
            ? { label: null, value: data.activity.name, unit: null }
            : null;
        case 'activityDate':
          return data.mode === 'activity'
            ? {
                label: null,
                value: formatActivityDate(
                  data.activity.startLocal,
                  context.locale,
                  layer.dateFormat,
                ),
                unit: null,
              }
            : null;
        case 'periodName':
          return data.mode === 'summary'
            ? {
                label: null,
                value: formatPeriodName(
                  data.kind,
                  data.summary.range,
                  context.locale,
                  layer.periodFormat,
                ),
                unit: null,
              }
            : null;
      }
      break;
    case 'route':
    case 'summaryRoutes':
    case 'summaryChart':
    case 'logo':
      return null;
  }
  return null;
}

/**
 * A data widget's value in the notation it asks for: paces with marks (`5'28"`) or not, and
 * distances with the decimals it wants.
 */
function inNotation(layer: DataLayer, display: DisplayMetric): DisplayMetric {
  // Each option only touches its own kind of value, so all of them apply.
  const marked = layer.paceNotation === 'marks' ? withPaceMarks(display) : display;
  return marked.kind === 'number' && isDistanceLayer(layer)
    ? { ...marked, fractionDigits: layer.decimals ?? 2 }
    : marked;
}

const DISTANCES: ReadonlySet<string> = new Set(['distance', 'totalDistance', 'longestDistance']);

/** Whether a data widget shows a distance, which can be written with 2, 1 or no decimals. */
export function isDistanceLayer(layer: DataLayer): boolean {
  return DISTANCES.has(layer.metric);
}

type DataLayer = Extract<Layer, { kind: 'metric' | 'summaryMetric' }>;

/** Times of an activity, and the total time of a period. */
const ACTIVITY_TIMES: ReadonlySet<MetricId> = new Set(['movingTime', 'elapsedTime']);

/** Whether a data widget shows a time, which can be written in words (`1h 40min 30s`). */
export function isTimeLayer(layer: DataLayer): boolean {
  return layer.kind === 'metric'
    ? ACTIVITY_TIMES.has(layer.metric)
    : layer.metric === 'totalMovingTime';
}

/**
 * A time written in words, when the widget asks for it: "1h 40min 30s" for an activity, or
 * rounded to the minute ("1h 41min"); a period's total, which drops the seconds anyway, to the
 * minute ("280h 40min") or rounded to the hour ("281h"). `null` for the clock notation and for
 * widgets that don't show a time. The words carry the units, so the widget's own unit is left out.
 */
function timeInWords(layer: DataLayer, seconds: number, context: TextContext): string | null {
  const notation = layer.timeNotation ?? 'clock';
  if (notation === 'clock' || !isTimeLayer(layer)) {
    return null;
  }
  const smallest: DurationUnit =
    layer.kind === 'metric'
      ? notation === 'units'
        ? 'seconds'
        : 'minutes'
      : notation === 'units'
        ? 'minutes'
        : 'hours';
  return durationParts(seconds, smallest)
    .map(({ amount, unit }) => `${amount}${context.durationUnits[unit]}`)
    .join(' ');
}

/** What a text widget's paragraph says, before fonts and colors. */
export interface ParagraphContent {
  readonly label: string | null;
  readonly value: string;
  readonly unit: string | null;
  /** Font size of the value; the label and unit are smaller. */
  readonly valueSize: number;
}

/** One stretch of a paragraph with its own size. */
export interface TextRun {
  readonly text: string;
  readonly fontSize: number;
  readonly bold: boolean;
}

/** Sizes of the label (above the value) and the unit (after it), relative to the value. */
const LABEL_SCALE = 0.34;
const UNIT_SCALE = 0.45;

/**
 * Splits a text widget into its label line, value and unit. Bold and uppercase apply to all of
 * them, so the widget reads as one block. Time and space O(length of the text).
 */
export function textRuns(
  style: { readonly bold: boolean; readonly uppercase: boolean },
  content: ParagraphContent,
): TextRun[] {
  const caseOf = (text: string) => (style.uppercase ? text.toLocaleUpperCase() : text);
  const run = (text: string, fontSize: number): TextRun => ({
    text: caseOf(text),
    fontSize,
    bold: style.bold,
  });
  return [
    ...(content.label === null ? [] : [run(`${content.label}\n`, content.valueSize * LABEL_SCALE)]),
    run(content.value, content.valueSize),
    ...(content.unit === null ? [] : [run(` ${content.unit}`, content.valueSize * UNIT_SCALE)]),
  ];
}

/**
 * Whether a data widget can show a unit: times read "1:23:45" and counts are plain numbers, so
 * hiding their unit would do nothing. Asks the same conversion the widget displays with.
 */
export function hasUnit(layer: Extract<Layer, { kind: 'metric' | 'summaryMetric' }>): boolean {
  if (isTimeLayer(layer) && (layer.timeNotation ?? 'clock') !== 'clock') {
    // Written in words, the time carries its units.
    return false;
  }
  return layer.kind === 'metric'
    ? toDisplayMetric(layer.metric, 1, { unit: 'km', sportFamily: 'run' }).unit !== null
    : toDisplaySummaryMetric(layer.metric, 1, 'km').unit !== null;
}

/** Whether a data widget shows a pace, which can be written with marks (`5'28"`). */
export function isPaceLayer(layer: Extract<Layer, { kind: 'metric' | 'summaryMetric' }>): boolean {
  return isPace(
    layer.kind === 'metric'
      ? toDisplayMetric(layer.metric, 1, { unit: 'km', sportFamily: 'run' })
      : toDisplaySummaryMetric(layer.metric, 1, 'km'),
  );
}
