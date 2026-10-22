import type { Activity } from '@/core/activity';
import type { LineSeries, SplitRow } from '@/core/activity-charts';
import type { ActivityDetail } from '@/core/activity-detail';
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
import type { SportFamily } from '@/core/sports';
import { type BucketSize, bucketize, type PeriodSummary, type SummaryBucket } from '@/core/summary';
import { summaryMetricValue, toDisplaySummaryMetric } from '@/core/summary-metrics';
import type { ActivityChartSeries, Layer, SummaryMetricId } from '@/core/template';
import { type DistanceUnit, durationParts, type DurationUnit, formatDuration } from '@/core/units';
import {
  formatActivityDate,
  type FormattedMetric,
  formatMetric,
  formatPeriodName,
} from '@/ui/format';

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

/** One activity to fill a template with. */
export interface ActivityData {
  readonly mode: 'activity';
  readonly activity: Activity;
  /** What it recorded along the way, for its charts; `null` if it couldn't be fetched. */
  readonly detail: ActivityDetail | null;
}

/** What the editor fills the template with: one activity, or a period summary. */
export type EditorData = ActivityData | SummaryData;

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

/** Key of the title of an activity chart; the splits' takes the distance unit as `{{unit}}`. */
export type ActivityChartTitleKey = `activityChartTitles.${ActivityChartSeries}`;

/** Translation key of a label the canvas draws. */
export type LabelKey =
  | `metrics.${MetricId}`
  | `summaryMetrics.${SummaryMetricId}`
  | ChartTitleKey
  | ActivityChartTitleKey;

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
  /** How a metric's unit is written in the app language: "bpm" in English, "ppm" in Spanish. */
  readonly unitLabel: (unit: MetricUnit) => string;
}

/** A formatted value followed by its unit in the app language, when it has one. */
function withUnit({ value, unit }: FormattedMetric, context: TextContext): string {
  return unit === null ? value : `${value} ${context.unitLabel(unit)}`;
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
    case 'activityChart':
    case 'logo':
      return null;
  }
  return null;
}

/** A data widget's value in the notation it asks for: paces with marks (`5'28"`) or not. */
function inNotation(layer: DataLayer, display: DisplayMetric): DisplayMetric {
  return layer.paceNotation === 'marks' ? withPaceMarks(display) : display;
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
 * A time written in words, when the widget asks for it: "1h 40min 30s" for an activity, and to
 * the minute for a period's total, whose seconds say nothing ("280h 40min"). `null` for the clock
 * notation and for widgets that don't show a time. The words carry the units, so the widget's own
 * unit is left out.
 */
function timeInWords(layer: DataLayer, seconds: number, context: TextContext): string | null {
  if ((layer.timeNotation ?? 'clock') === 'clock' || !isTimeLayer(layer)) {
    return null;
  }
  const smallest: DurationUnit = layer.kind === 'metric' ? 'seconds' : 'minutes';
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

/** Key of the title of an activity chart ("ELEVATION", "SPLITS PER KM"). */
export function activityChartTitleKey(series: ActivityChartSeries): ActivityChartTitleKey {
  return `activityChartTitles.${series}`;
}

/**
 * Labels at both ends of a line chart: where it starts and how far it runs, in distance
 * ("0", "16,08 km") or, without one, in time ("0:00", "45:00").
 */
export function lineAxisLabels(
  series: Pick<LineSeries, 'axis' | 'axisEnd'>,
  context: TextContext,
): readonly [string, string] {
  if (series.axis === 'time') {
    return ['0:00', formatDuration(series.axisEnd)];
  }
  const display = toDisplayMetric('distance', series.axisEnd, {
    unit: context.unit,
    sportFamily: 'run',
  });
  return ['0', withUnit(formatMetric(display, context.locale), context)];
}

/** How a sport writes how fast it went: a pace, a swimming pace or a speed. */
export type SpeedMeasure = 'pace' | 'swimPace' | 'speed';

/** Runners and walkers think in pace, swimmers in pace per 100, cyclists and the rest in speed. */
export function speedMeasure(family: SportFamily): SpeedMeasure {
  switch (family) {
    case 'run':
    case 'walk':
      return 'pace';
    case 'swim':
      return 'swimPace';
    case 'ride':
    case 'training':
    case 'other':
      return 'speed';
  }
}

/** What a chart's highlighted value measures, to write it with its unit. */
export type ChartMeasure =
  SpeedMeasure | 'elevation' | 'heartRate' | 'power' | 'periodDistance' | 'periodTime';

/**
 * A chart's highlighted value with its unit, written as the widget of that measure writes it:
 * "52 m", "4:58 min/km", "34,2 km/h", "172 bpm", "420 W", "52,30 km", "5:20 h". Values are in SI
 * units (meters, m/s, bpm, watts, seconds).
 */
export function chartValueText(measure: ChartMeasure, value: number, context: TextContext): string {
  const display =
    measure === 'periodDistance'
      ? toDisplaySummaryMetric('totalDistance', value, context.unit)
      : measure === 'periodTime'
        ? toDisplaySummaryMetric('totalMovingTime', value, context.unit)
        : toDisplayMetric(CHART_METRICS[measure], value, {
            unit: context.unit,
            sportFamily: 'run',
          });
  return withUnit(formatMetric(display, context.locale), context);
}

const CHART_METRICS = {
  pace: 'pace',
  swimPace: 'swimPace',
  speed: 'speed',
  elevation: 'maxElevation',
  heartRate: 'averageHeartRate',
  power: 'averagePower',
} as const satisfies Record<Exclude<ChartMeasure, 'periodDistance' | 'periodTime'>, MetricId>;

/** The texts of a row of splits: its number, how fast it went and its change in altitude. */
export interface SplitRowTexts {
  /** "3", or "1–3" for a row of several splits. */
  readonly number: string;
  /** The pace or speed alone, without its unit: "5:12", "34,2". */
  readonly value: string;
  /** "+12 m", "−3 m". */
  readonly elevation: string;
}

/** Writes a row of splits in the user's units and locale. */
export function splitRowTexts(
  row: SplitRow,
  measure: SpeedMeasure,
  context: TextContext,
): SplitRowTexts {
  const speed = formatMetric(
    toDisplayMetric(measure, row.speed, { unit: context.unit, sportFamily: 'run' }),
    context.locale,
  );
  const climb = formatMetric(
    toDisplayMetric('elevationGain', Math.abs(row.elevationDifference), {
      unit: context.unit,
      sportFamily: 'run',
    }),
    context.locale,
  );
  const sign = climb.value === '0' ? '' : row.elevationDifference < 0 ? '−' : '+';
  return {
    number: row.first === row.last ? String(row.first) : `${row.first}–${row.last}`,
    value: speed.value,
    elevation: `${sign}${withUnit(climb, context)}`,
  };
}
