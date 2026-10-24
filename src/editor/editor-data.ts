import type { Activity } from '@/core/activity';
import { rangeLength } from '@/core/dates';
import type { SentenceClause, SentenceLead } from '@/core/activity-block';
import type { BarSeries, LineSeries, SplitRow } from '@/core/activity-charts';
import type { ActivityDetail } from '@/core/activity-detail';
import type { HeartRateZones } from '@/core/heart-rate-zones';
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
import { formatPlace, type Place } from '@/core/place';
import type { SportFamily, SportModality } from '@/core/sports';
import {
  type BucketSize,
  bucketize,
  familiesOf,
  type FamilyTotals,
  type PeriodSummary,
  type SummaryBucket,
} from '@/core/summary';
import {
  noteActivities,
  type PeriodSentenceClause,
  type PeriodSentenceLead,
  tableBucket,
} from '@/core/summary-block';
import { periodTotals, summaryMetricValue, toDisplaySummaryMetric } from '@/core/summary-metrics';
import type {
  ActivityChartSeries,
  ChatPhrase,
  Layer,
  Quote,
  SummaryMetricId,
  Verse,
} from '@/core/template';
import { type DistanceUnit, durationParts, type DurationUnit, formatDuration } from '@/core/units';
import {
  formatActivityDate,
  formatBucketName,
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
  /** The sport families summed up; empty for all of them. */
  readonly families: readonly SportFamily[];
  /** Whether it is the week, month or year in progress (see `isCurrentPeriod`). */
  readonly current: boolean;
}

/** One activity to fill a template with. */
export interface ActivityData {
  readonly mode: 'activity';
  readonly activity: Activity;
  /** What it recorded along the way, for its charts; `null` if it couldn't be fetched. */
  readonly detail: ActivityDetail | null;
  /** Where it started, for its place widget; `null` without a route or when it can't be named. */
  readonly place: Place | null;
  /** The athlete's heart rate zones, for the zones of its heart rate chart; `null` without them. */
  readonly zones: HeartRateZones | null;
}

/** What the editor fills the template with: one activity, or a period summary. */
export type EditorData = ActivityData | SummaryData;

/**
 * Bars of a summary chart and their size: the chart's own size, or the period's for `auto`.
 * Time O(b + n) for b bars and n activities, space O(b).
 */
export function chartBuckets(
  layer: Extract<Layer, { kind: 'summaryChart' }>,
  data: SummaryData,
): { readonly size: BucketSize; readonly buckets: SummaryBucket[] } {
  const size = layer.bucket === 'auto' ? data.bucketSize : layer.bucket;
  return { size, buckets: bucketize(data.activities, data.summary.range, size) };
}

/** Names of the data a chart's header writes, besides a metric's own ("Distance"). */
export type ChartHeaderName =
  | 'averagePace'
  | 'fastestPace'
  | 'averageSpeed'
  | 'maxSpeed'
  | 'averageHeartRate'
  | 'maxHeartRate'
  | 'averagePower'
  | 'maxPower'
  | 'fastestSplit'
  | 'total'
  | `averagePer.${BucketSize}`;

/** Translation key of a label the canvas draws. */
export type LabelKey =
  | `metrics.${MetricId}`
  | `summaryMetrics.${SummaryMetricId}`
  | `modalities.${SportModality}`
  | `splitHeaders.${'elevation' | 'heartRate'}`
  | `chartHeaders.${ChartHeaderName}`
  | 'thisWeek'
  | `tableMeasures.${DistanceUnit | 'hours'}`
  | 'tableTotal'
  | 'noteLine'
  | `families.${SportFamily}`
  | `chartCaptions.activity.${ActivityChartSeries}`
  | 'widgets.chatLine'
  | 'widgets.alarmLabel'
  | 'widgets.locationLine'
  | 'widgets.dayAndTime'
  | `widgets.cardLabels.${MetricId}`
  | `widgets.tower.sports.${SportModality}`
  | `compactDurationUnits.${DurationUnit}`
  | 'widgets.quoted'
  | 'widgets.sessionOne'
  | 'widgets.activities'
  | 'widgets.sessions'
  | `widgets.verses.${Verse}.${'text' | 'source'}`
  | `widgets.quotes.${Quote}.${'text' | 'author'}`
  | `widgets.laps.${'title' | 'lap' | 'distance' | 'time' | 'pace' | 'speed'}`
  | 'widgets.grandPrix.leader'
  | `widgets.splitBars.${DistanceUnit}`
  | 'widgets.splitLadder.title'
  | `widgets.verified.${DistanceUnit}`
  | `widgets.phrases.${ChatPhrase}`
  | `widgets.sentence.leads.${SentenceLead}`
  | `widgets.sentence.units.${DistanceUnit}`
  | `widgets.sentence.clauses.${SentenceClause}`
  | 'widgets.sentence.end'
  | 'widgets.periodSentence.opening'
  | `widgets.periodSentence.leads.${PeriodSentenceLead}`
  | `widgets.periodSentence.clauses.${PeriodSentenceClause}`
  | 'widgets.periodSentence.activityOne'
  | 'widgets.periodSentence.activities'
  | `widgets.receipt.${'total' | 'thanks'}`
  | `widgets.boardingPass.${'title' | 'departure' | 'arrival' | 'date'}`
  | `widgets.cameraModes.${'video' | 'photo'}`
  | `widgets.cameraZoom.${'wide' | 'main' | 'tele'}`
  | `chartCaptions.${Extract<Layer, { kind: 'summaryChart' }>['value']}.${BucketSize}`;

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
 * A datum of `activity` as its data widget writes it by default (a time as a clock, a pace with a
 * colon), with its unit apart: "10,52" "km". Without a value, a dash and no unit.
 */
export function metricText(
  activity: Activity,
  metric: MetricId,
  context: TextContext,
): FormattedMetric {
  const value = metricValue(activity, metric);
  if (value === null || value <= 0) {
    return { value: MISSING_VALUE, unit: null };
  }
  const display = toDisplayMetric(metric, value, {
    unit: context.unit,
    sportFamily: activity.sportFamily,
  });
  return formatMetric(display, context.locale);
}

/**
 * A datum of `activity` as a widget of data without names writes it: numbers with a decimal point
 * and no thousands separator in any language ("11.34 km", "1250 kcal"), a pace with its marks and
 * no unit (`5'45"`, the marks say what it is), anything else with its unit after it ("41 m").
 * In `words`, for widgets with more text, a pace keeps its unit ("4:32 min/km") and a time is
 * written in units ("51min 25s"). Down to its minutes, a time leaves its seconds out ("51min"):
 * in `tight`, for a caption with little room, with a pace's unit without its minutes ("4:32/km");
 * in `brief`, for a line of data, with a pace's marks (`4'32"`).
 */
export function plainMetricText(
  activity: Activity,
  metric: MetricId,
  context: TextContext,
  notation: PlainNotation = 'short',
): string {
  const value = metricValue(activity, metric);
  if (value === null || value <= 0) {
    return MISSING_VALUE;
  }
  const display = toDisplayMetric(metric, value, {
    unit: context.unit,
    sportFamily: activity.sportFamily,
  });
  if (notation !== 'short' && ACTIVITY_TIMES.has(metric)) {
    return durationParts(value, notation === 'words' ? 'seconds' : 'minutes')
      .map(({ amount, unit }) => `${amount}${context.durationUnits[unit]}`)
      .join(' ');
  }
  return plainDisplayText(display, notation, context);
}

/** A datum ready to display, written as `plainMetricText` writes it in `notation`. */
function plainDisplayText(
  display: DisplayMetric,
  notation: PlainNotation,
  context: TextContext,
): string {
  const { amount, unit } = plainParts(display, notation);
  if (unit === null) {
    return amount;
  }
  // A unit per something ("/km") goes right after its amount.
  const label = context.unitLabel(unit);
  return label.startsWith('/') ? `${amount}${label}` : `${amount} ${label}`;
}

/** How a widget of data without names writes a datum (see `plainMetricText`). */
export type PlainNotation = 'short' | 'words' | 'tight' | 'brief';

/** A datum's amount and unit as `plainMetricText` writes them, but a time in words. */
function plainParts(
  display: DisplayMetric,
  notation: PlainNotation,
): { readonly amount: string; readonly unit: MetricUnit | null } {
  const marked = withPaceMarks(display);
  if (marked !== display && marked.kind === 'time' && notation !== 'words') {
    return notation !== 'tight'
      ? { amount: marked.text, unit: null }
      : { amount: display.kind === 'time' ? display.text : marked.text, unit: marked.unit };
  }
  return {
    amount: display.kind === 'time' ? display.text : display.amount.toFixed(display.fractionDigits),
    unit: display.unit,
  };
}

/**
 * A datum of `activity` as `plainMetricText` writes it by default, with its unit apart, for a
 * widget that writes them on lines of their own: "11.34" "km"; a number rounded to at most
 * `fractionDigits` decimals ("11.3" with one). Without a value, a dash and no unit.
 */
export function plainMetricParts(
  activity: Activity,
  metric: MetricId,
  context: TextContext,
  fractionDigits?: number,
): { readonly amount: string; readonly unit: MetricUnit | null } {
  const value = metricValue(activity, metric);
  if (value === null || value <= 0) {
    return { amount: MISSING_VALUE, unit: null };
  }
  const display = toDisplayMetric(metric, value, {
    unit: context.unit,
    sportFamily: activity.sportFamily,
  });
  return plainParts(
    fractionDigits !== undefined && display.kind === 'number'
      ? { ...display, fractionDigits: Math.min(display.fractionDigits, fractionDigits) }
      : display,
    'short',
  );
}

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
        case 'activityPlace': {
          // Without a known place (an indoor session) the widget draws nothing.
          const place =
            data.mode === 'activity' && data.place !== null
              ? formatPlace(data.place, layer.placeFormat ?? 'city')
              : null;
          return place === null ? null : { label: null, value: place, unit: null };
        }
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
  return withUnit(chartValue(measure, value, context), context);
}

/** Like {@link chartValueText}, with the unit apart, untranslated: "52,30" and "km". */
function chartValue(measure: ChartMeasure, value: number, context: TextContext): FormattedMetric {
  const display =
    measure === 'periodDistance'
      ? toDisplaySummaryMetric('totalDistance', value, context.unit)
      : measure === 'periodTime'
        ? toDisplaySummaryMetric('totalMovingTime', value, context.unit)
        : toDisplayMetric(CHART_METRICS[measure], value, {
            unit: context.unit,
            sportFamily: 'run',
          });
  return formatMetric(display, context.locale);
}

const CHART_METRICS = {
  pace: 'pace',
  swimPace: 'swimPace',
  speed: 'speed',
  elevation: 'maxElevation',
  heartRate: 'averageHeartRate',
  power: 'averagePower',
} as const satisfies Record<Exclude<ChartMeasure, 'periodDistance' | 'periodTime'>, MetricId>;

/**
 * The texts of a row of splits: its number, distance and time, how fast it went, its change in
 * altitude and its heart rate. Like Strava's table, they go without units: the names of the
 * columns say them.
 */
export interface SplitRowTexts {
  /** "3", or "1–3" for a row of several splits. */
  readonly number: string;
  /** In kilometers or miles: "1,00", "0,34". */
  readonly distance: string;
  /** Moving time: "5:42". */
  readonly time: string;
  /** The pace or speed alone: "5:12", "34,2". */
  readonly value: string;
  /** In meters or feet, a descent with a minus: "12", "−3". */
  readonly elevation: string;
  /** Beats per minute, "152", or a dash for a row without them. */
  readonly heartRate: string;
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
  const sign = climb.value !== '0' && row.elevationDifference < 0 ? '−' : '';
  return {
    number: row.first === row.last ? String(row.first) : `${row.first}–${row.last}`,
    distance: formatMetric(
      toDisplayMetric('distance', row.distanceMeters, { unit: context.unit, sportFamily: 'run' }),
      context.locale,
    ).value,
    time: formatDuration(row.movingTimeSeconds),
    value: speed.value,
    elevation: `${sign}${climb.value}`,
    heartRate:
      row.heartRate === null
        ? MISSING_VALUE
        : formatMetric(
            toDisplayMetric('averageHeartRate', row.heartRate, {
              unit: context.unit,
              sportFamily: 'run',
            }),
            context.locale,
          ).value,
  };
}

/** Meters a pace is over: a kilometer or a mile; for swimmers, 100 meters or 100 yards. */
const PACE_METERS: Readonly<Record<'pace' | 'swimPace', Readonly<Record<DistanceUnit, number>>>> = {
  pace: { km: 1000, mi: 1609.344 },
  swimPace: { km: 100, mi: 91.44 },
};

/**
 * How far behind `fastest` a row of splits went, as a timing tower writes a gap: seconds more per
 * kilometer, "+0:21", or less speed, "−1,8". Computed from the values as written, so it is exactly
 * the difference the eye reads between two rows; a dash for a row that didn't move.
 */
export function splitGapText(
  row: SplitRow,
  fastest: SplitRow,
  measure: SpeedMeasure,
  context: TextContext,
): string {
  if (row.speed <= 0 || fastest.speed <= 0) {
    return MISSING_VALUE;
  }
  if (measure !== 'speed') {
    const meters = PACE_METERS[measure][context.unit];
    const seconds = Math.round(meters / row.speed) - Math.round(meters / fastest.speed);
    return `+${formatDuration(seconds)}`;
  }
  const written = (speed: number) => {
    const metric = toDisplayMetric('speed', speed, { unit: context.unit, sportFamily: 'ride' });
    if (metric.kind !== 'number') {
      throw new Error('A speed is written as a number');
    }
    const factor = 10 ** metric.fractionDigits;
    return { amount: Math.round(metric.amount * factor) / factor, digits: metric.fractionDigits };
  };
  const mine = written(row.speed);
  const gap = written(fastest.speed).amount - mine.amount;
  const text = new Intl.NumberFormat(context.locale, {
    minimumFractionDigits: mine.digits,
    maximumFractionDigits: mine.digits,
  }).format(gap);
  return gap > 0 ? `−${text}` : text;
}

/** One of the two data over a chart: its name, and its value with its unit apart. */
export interface HeaderDatum {
  readonly label: LabelKey;
  readonly value: string;
  /** The unit in the app language ("km", "ppm"), or `null` for a time or a pace (`5'44"`). */
  readonly unit: string | null;
}

/**
 * A value of a chart's `measure` as a datum of its header; a pace with its marks and no unit
 * (`5'44"`), shorter, as data widgets without names write it.
 */
function headerDatum(
  label: LabelKey,
  measure: ChartMeasure,
  value: number,
  context: TextContext,
): HeaderDatum {
  if (measure === 'pace' || measure === 'swimPace') {
    const display = withPaceMarks(
      toDisplayMetric(CHART_METRICS[measure], value, { unit: context.unit, sportFamily: 'run' }),
    );
    return { label, value: formatMetric(display, context.locale).value, unit: null };
  }
  const written = chartValue(measure, value, context);
  return {
    label,
    value: written.value,
    unit: written.unit === null ? null : context.unitLabel(written.unit),
  };
}

/** The activity's own value of a datum when it has one, or else the chart's. */
const own = (value: number | null, ofChart: number): number =>
  value !== null && value > 0 ? value : ofChart;

/**
 * The two data over an activity's chart (AURA's style): its distance and elevation gain over its
 * elevation; its average and fastest pace (or speed, as its sport writes it) over its pace; its
 * average and highest heart rate or power over those; its average pace and fastest split over
 * its splits. Averages are the activity's own, as its data widgets write them; highest values
 * are the activity's when it has them, or else the chart's. Time O(s) for s splits.
 */
export function activityChartHeader(
  series: ActivityChartSeries,
  activity: Activity,
  chart: LineSeries | BarSeries,
  context: TextContext,
): readonly [HeaderDatum, HeaderDatum] {
  const speed = speedMeasure(activity.sportFamily);
  const label = (name: ChartHeaderName): LabelKey => `chartHeaders.${name}`;
  const averageSpeed = headerDatum(
    label(speed === 'speed' ? 'averageSpeed' : 'averagePace'),
    speed,
    own(activity.averageSpeed, chart.average),
    context,
  );
  const fromMetric = (metric: MetricId): HeaderDatum => {
    const written = metricText(activity, metric, context);
    return {
      label: `metrics.${metric}`,
      value: written.value,
      unit: written.unit === null ? null : context.unitLabel(written.unit),
    };
  };
  if (chart.kind === 'bars') {
    const fastest = Math.max(...chart.splits.map((split) => split.averageSpeed));
    return [averageSpeed, headerDatum(label('fastestSplit'), speed, fastest, context)];
  }
  switch (series) {
    case 'elevation':
      return [fromMetric('distance'), fromMetric('elevationGain')];
    case 'pace':
    case 'splits':
      return [
        averageSpeed,
        headerDatum(
          label(speed === 'speed' ? 'maxSpeed' : 'fastestPace'),
          speed,
          chart.max,
          context,
        ),
      ];
    case 'heartRate':
      return [
        headerDatum(
          label('averageHeartRate'),
          'heartRate',
          own(activity.averageHeartRate, chart.average),
          context,
        ),
        headerDatum(
          label('maxHeartRate'),
          'heartRate',
          own(activity.maxHeartRate, chart.max),
          context,
        ),
      ];
    case 'power':
      return [
        headerDatum(
          label('averagePower'),
          'power',
          own(activity.averagePowerWatts, chart.average),
          context,
        ),
        headerDatum(label('maxPower'), 'power', chart.max, context),
      ];
  }
}

/**
 * The two data over a period's bars: their total, and their average per bar of `size` (empty
 * bars count: a week's average is over its seven days). Time O(b) for b bars.
 */
export function periodChartHeader(
  value: Extract<Layer, { kind: 'summaryChart' }>['value'],
  size: BucketSize,
  values: readonly number[],
  context: TextContext,
): readonly [HeaderDatum, HeaderDatum] {
  const measure = value === 'distance' ? 'periodDistance' : 'periodTime';
  const total = values.reduce((sum, bar) => sum + bar, 0);
  return [
    headerDatum('chartHeaders.total', measure, total, context),
    headerDatum(
      `chartHeaders.averagePer.${size}`,
      measure,
      values.length === 0 ? 0 : total / values.length,
      context,
    ),
  ];
}

/** A header that names the period over its data. */
export interface TitledHeader {
  readonly title: string;
  readonly data: readonly HeaderDatum[];
}

/**
 * A period's name alone: "Esta semana" for the week in progress, a month or a year by its name,
 * short and telling ("Octubre de 2026", "2026"), other weeks and ranges by their days. Time and
 * space O(1).
 */
export function periodName(
  data: SummaryData,
  context: TextContext,
  translate: (key: LabelKey) => string,
): string {
  return data.current && data.kind === 'week'
    ? translate('thisWeek')
    : formatPeriodName(data.kind, data.summary.range, context.locale);
}

/**
 * How a period's widgets name it: by its name (see `periodName`), and a summary of one sport
 * names it after the period ("Esta semana · Carreras"). Time and space O(1).
 */
export function periodTitle(
  data: SummaryData,
  context: TextContext,
  translate: (key: LabelKey) => string,
): string {
  const period = periodName(data, context, translate);
  return data.families.length === 1
    ? `${period} · ${translate(`families.${data.families[0]}`)}`
    : period;
}

/**
 * The period's name over the first `count` of its main totals (see `periodTotals`), the total of
 * the chart's `value` first, as the header of a chart: "Octubre de 2026" over "Distancia 94,23 km
 * · Tiempo 7:18 h · Desnivel 630 m". The week in progress reads "Esta semana" (a month or a year
 * keeps its name, short and telling), and a summary of one sport names it after the period ("Esta
 * semana · Carreras"). Time and space O(1).
 */
export function periodTotalsHeader(
  data: SummaryData,
  value: Extract<Layer, { kind: 'summaryChart' }>['value'],
  count: number,
  context: TextContext,
  translate: (key: LabelKey) => string,
): TitledHeader {
  return {
    title: periodTitle(data, context, translate),
    data: periodTotals(data.summary, value === 'distance' ? 'totalDistance' : 'totalMovingTime')
      .slice(0, count)
      .map((metric) => {
        const written = formatMetric(
          toDisplaySummaryMetric(
            metric,
            summaryMetricValue(data.summary, metric) ?? 0,
            context.unit,
          ),
          context.locale,
        );
        return {
          label: `summaryMetrics.${metric}`,
          value: written.value,
          unit: written.unit === null ? null : context.unitLabel(written.unit),
        };
      }),
  };
}

/**
 * A period's total as its data widgets write it: numbers with a decimal point and no thousands
 * separator in any language ("94.23 km", "630 m", with at most `fractionDigits` decimals when
 * given: "94.2 km"), a time in hours and minutes in the context's units ("7h 18min"), a count
 * bare ("6"). Time and space O(1).
 */
export function plainSummaryText(
  metric: SummaryMetricId,
  value: number,
  context: TextContext,
  fractionDigits?: number,
): string {
  if (metric === 'totalMovingTime') {
    return durationParts(value, 'minutes')
      .map(({ amount, unit }) => `${amount}${context.durationUnits[unit]}`)
      .join(' ');
  }
  const display = toDisplaySummaryMetric(metric, value, context.unit);
  if (display.kind === 'time') {
    return display.unit === null
      ? display.text
      : `${display.text} ${context.unitLabel(display.unit)}`;
  }
  const digits = Math.min(display.fractionDigits, fractionDigits ?? display.fractionDigits);
  const amount = display.amount.toFixed(digits);
  return display.unit === null ? amount : `${amount} ${context.unitLabel(display.unit)}`;
}

/**
 * A period's total as its widgets write it beside others, without a name over it: as
 * `plainSummaryText` does, but the number of activities says what it counts, short ("6 act."),
 * since a bare "6" says nothing. Time and space O(1).
 */
export function summaryTotalText(
  metric: SummaryMetricId,
  value: number,
  context: TextContext,
  translate: (key: LabelKey, values?: Readonly<Record<string, string>>) => string,
): string {
  return metric === 'activityCount'
    ? translate('widgets.activities', { number: String(value) })
    : plainSummaryText(metric, value, context);
}

/** A sport's card in a period's widget of cards (see `familyCard`). */
export interface FamilyCard {
  readonly name: string;
  /** Its distance, or its time when it has none ("34.35 km", "1h 50min"). */
  readonly total: string;
  /** Under it, small: its time and its pace or speed, or its sessions and calories. */
  readonly detail: string;
}

/**
 * A sport's card: its name, its total and, under it, its time and its average pace or speed as
 * the sport writes it ("3h 25min · 5:58/km", an average over one sport means something), or,
 * without distance, its sessions and the calories when any ("4 sesiones · 1250 kcal"). Times in
 * the context's units. Time and space O(1).
 */
export function familyCard(
  totals: FamilyTotals,
  context: TextContext,
  translate: (key: LabelKey, values?: Readonly<Record<string, string>>) => string,
): FamilyCard {
  const time = plainSummaryText('totalMovingTime', totals.movingTimeSeconds, context);
  const name = translate(`families.${totals.family}`);
  if (totals.distanceMeters > 0 && totals.movingTimeSeconds > 0) {
    const measure = speedMeasure(totals.family);
    const speed = toDisplayMetric(measure, totals.distanceMeters / totals.movingTimeSeconds, {
      unit: context.unit,
      sportFamily: totals.family,
    });
    return {
      name,
      total: plainSummaryText('totalDistance', totals.distanceMeters, context),
      detail: `${time} · ${plainDisplayText(speed, 'tight', context)}`,
    };
  }
  const sessions =
    totals.activityCount === 1
      ? translate('widgets.sessionOne')
      : translate('widgets.sessions', { number: String(totals.activityCount) });
  const calories =
    totals.calories === null
      ? null
      : plainDisplayText(
          toDisplayMetric('calories', totals.calories, {
            unit: context.unit,
            sportFamily: totals.family,
          }),
          'short',
          context,
        );
  return {
    name,
    total: time,
    detail: calories === null ? sessions : `${sessions} · ${calories}`,
  };
}

/**
 * A line of a period's note: its text, whether it is ticked off and whether in the accent, and the
 * sports whose icons follow it.
 */
export interface NoteLine {
  readonly text: string;
  readonly checked: boolean;
  readonly highlighted: boolean;
  readonly sports: readonly SportFamily[];
}

/** A time in its units ("54min 17s"), down to `smallest`. */
function durationInWords(seconds: number, smallest: DurationUnit, context: TextContext): string {
  return durationParts(seconds, smallest)
    .map(({ amount, unit }) => `${amount}${context.durationUnits[unit]}`)
    .join(' ');
}

/**
 * The lines of a period's note, as a checklist of things done: its `activities`, oldest first,
 * each ticked off with how far it went, or how long without a distance, and its sport ("10,81 km
 * de carrera", "54min de entrenamiento": seconds make a line long and add little), the longest of
 * each sport done twice or more in the
 * accent (see `noteActivities`); or its days, weeks or months (`buckets`, see `tableBucket`), those
 * with activities ticked off with their distance, or time without one ("Lunes · 10,81 km"), the
 * rest left unticked by name, and the longest in the accent when two or more have some. A day
 * names its sports with their icons, since its total doesn't say them, unless the summary is of
 * one sport (the note names it once). Time O(b · n) for b days, weeks or months and n
 * activities.
 */
export function periodNoteLines(
  data: SummaryData,
  rows: 'activities' | 'buckets',
  context: TextContext,
  translate: (key: LabelKey, values?: Readonly<Record<string, string>>) => string,
): NoteLine[] {
  if (rows === 'activities') {
    return noteActivities(data.activities).map(({ activity, highlighted }) => {
      const distance = metricText(activity, 'distance', context);
      return {
        text: translate('noteLine', {
          value:
            activity.distanceMeters > 0
              ? withUnit(distance, context)
              : durationInWords(activity.movingTimeSeconds, 'minutes', context),
          sport: translate(`modalities.${activity.sportModality}`).toLocaleLowerCase(
            context.locale,
          ),
        }),
        checked: true,
        highlighted,
        sports: [],
      };
    });
  }
  const size = tableBucket(data.summary.range);
  const week = rangeLength(data.summary.range) <= 7;
  const buckets = bucketize(data.activities, data.summary.range, size);
  const active = buckets.filter((bucket) => bucket.activityCount > 0);
  const longest = active.reduce<SummaryBucket | null>(
    (best, bucket) =>
      best === null ||
      bucket.distanceMeters > best.distanceMeters ||
      (bucket.distanceMeters === best.distanceMeters &&
        bucket.movingTimeSeconds > best.movingTimeSeconds)
        ? bucket
        : best,
    null,
  );
  return buckets.map((bucket) => {
    const name = formatBucketName(bucket.range, size, week, context.locale);
    if (bucket.activityCount === 0) {
      return { text: name, checked: false, highlighted: false, sports: [] };
    }
    const value =
      bucket.distanceMeters > 0
        ? withUnit(
            formatMetric(
              toDisplaySummaryMetric('totalDistance', bucket.distanceMeters, context.unit),
              context.locale,
            ),
            context,
          )
        : durationInWords(bucket.movingTimeSeconds, 'minutes', context);
    return {
      text: `${name} · ${value}`,
      checked: true,
      highlighted: active.length >= 2 && bucket === longest,
      sports:
        size === 'day' && data.families.length !== 1
          ? familiesOf(
              data.activities.filter(
                (activity) =>
                  activity.localDate >= bucket.range.start &&
                  activity.localDate <= bucket.range.end,
              ),
            )
          : [],
    };
  });
}

/** A period's table as its widget writes it (see `periodTable`). */
export interface PeriodTable {
  /** The period's name, over the rows' names. */
  readonly title: string;
  /** What the values are, over them ("Kilómetros", "Horas"). */
  readonly measure: string;
  readonly rows: readonly { readonly name: string; readonly value: string }[];
  readonly total: string;
}

/**
 * A period's table of distance or time: a row per day, week or month with some (see
 * `tableBucket`), named by it, and the total. Distances with one decimal and without their unit,
 * which the header names ("10.9"); times in hours and minutes ("1:05"). Time O(b + n) for b
 * rows and n activities.
 */
export function periodTable(
  data: SummaryData,
  value: Extract<Layer, { kind: 'summaryChart' }>['value'],
  context: TextContext,
  translate: (key: LabelKey) => string,
): PeriodTable {
  const size = tableBucket(data.summary.range);
  const amount = (bucket: SummaryBucket) =>
    value === 'distance' ? bucket.distanceMeters : bucket.movingTimeSeconds;
  const write = (total: number) => {
    const display =
      value === 'distance'
        ? toDisplaySummaryMetric('totalDistance', total, context.unit)
        : toDisplaySummaryMetric('totalMovingTime', total, context.unit);
    return display.kind === 'number' ? display.amount.toFixed(1) : display.text;
  };
  const week = rangeLength(data.summary.range) <= 7;
  const rows = bucketize(data.activities, data.summary.range, size)
    .filter((bucket) => amount(bucket) > 0)
    .map((bucket) => ({
      name: formatBucketName(bucket.range, size, week, context.locale),
      value: write(amount(bucket)),
    }));
  return {
    title: periodTitle(data, context, translate),
    measure: translate(`tableMeasures.${value === 'distance' ? context.unit : 'hours'}`),
    rows,
    total: write(
      value === 'distance' ? data.summary.totalDistanceMeters : data.summary.totalMovingTimeSeconds,
    ),
  };
}

/**
 * A bar's value as a chart writes it over the bar or on its scale, rounded: whole kilometres or
 * miles ("41"), a time in hours and minutes ("1:18"); with `unit`, followed by it ("41 km",
 * "1:18 h"). Nothing is "0", so empty bars read as such. Time and space O(1).
 */
export function roundedChartValue(
  value: Extract<Layer, { kind: 'summaryChart' }>['value'],
  amount: number,
  context: TextContext,
  unit: boolean,
): string {
  const display =
    value === 'distance'
      ? toDisplaySummaryMetric('totalDistance', amount, context.unit)
      : toDisplaySummaryMetric('totalMovingTime', amount, context.unit);
  const written: FormattedMetric =
    display.kind === 'number'
      ? {
          value: new Intl.NumberFormat(context.locale, { maximumFractionDigits: 0 }).format(
            Math.round(display.amount),
          ),
          unit: display.unit,
        }
      : { value: amount <= 0 ? '0' : display.text, unit: display.unit };
  return unit ? withUnit(written, context) : written.value;
}
