import { z } from 'zod';

import type { MetricId } from './metrics';

/**
 * A template is a design: a canvas format plus an ordered list of layers (bottom to top). It holds
 * no photo and no data; layers are *bound* to data (a metric, the route, a summary total) and the
 * editor fills them in from the chosen activity or period. That keeps templates reusable and
 * small enough to store as JSON and, later, to sync across devices.
 *
 * Positions are relative to the canvas (0..1), so a design exports at any resolution and survives
 * a format change.
 */

/** Export size of each canvas format, in pixels. */
export const CANVAS_FORMATS = {
  story: { width: 1080, height: 1920 },
  // Instagram profile grid and tall feed posts: 3:4.
  tall: { width: 1080, height: 1440 },
  portrait: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  // Instagram landscape posts: 1.91:1.
  landscape: { width: 1080, height: 566 },
} as const;

export type CanvasFormat = keyof typeof CANVAS_FORMATS;

/**
 * Fonts bundled with the app, one of each style (the interface names them by style, not by
 * font). Adding a font is compatible; removing one breaks the templates that use it.
 */
export const FONT_IDS = [
  'inter',
  'barlowCondensed',
  'archivoBlack',
  'playfairDisplay',
  'spaceMono',
  'orbitron',
  'bangers',
  'fredoka',
  'dancingScript',
  'permanentMarker',
] as const;

export type FontId = (typeof FONT_IDS)[number];

/** Whether a template is filled from one activity or from a period summary. */
export type TemplateMode = 'activity' | 'summary';

const METRIC_IDS = [
  'distance',
  'movingTime',
  'elapsedTime',
  'pace',
  'swimPace',
  'speed',
  'elevationGain',
  'maxElevation',
  'averageHeartRate',
  'maxHeartRate',
  'averagePower',
  'weightedAveragePower',
  'averageCadence',
  'calories',
] as const satisfies readonly MetricId[];

/** Totals a summary widget can show; see `PeriodSummary`. */
export const SUMMARY_METRIC_IDS = [
  'totalDistance',
  'totalMovingTime',
  'activityCount',
  'totalElevationGain',
  'averagePace',
  'longestDistance',
] as const;

export type SummaryMetricId = (typeof SUMMARY_METRIC_IDS)[number];

/**
 * How an activity's date reads (Spanish examples): `full` "Miércoles, 14 de octubre de 2026",
 * `weekday` "Miércoles", `long` "14 de octubre de 2026", `short` "14 oct", `numeric`
 * "14/10/2026", `weekdayTime` "Miércoles, 10:00" and `time` "10:00" (the start time).
 */
export const DATE_FORMATS = [
  'full',
  'weekday',
  'long',
  'short',
  'numeric',
  'weekdayTime',
  'time',
] as const;

export type DateFormat = (typeof DATE_FORMATS)[number];

/**
 * How a time reads: `clock` "1:40:30" (a period's total "280:40 h"), `units` "1h 40min 30s"
 * ("280h 40min") and `rounded`, one unit less precise: "1h 41min" ("281h").
 */
export const TIME_NOTATIONS = ['clock', 'units', 'rounded'] as const;

export type TimeNotation = (typeof TIME_NOTATIONS)[number];

/**
 * What an activity chart draws: its elevation profile, pace, heart rate or power along the way
 * (an area under a line), or its splits (a bar per kilometer or mile).
 */
export const ACTIVITY_CHART_SERIES = ['elevation', 'pace', 'heartRate', 'power', 'splits'] as const;

export type ActivityChartSeries = (typeof ACTIVITY_CHART_SERIES)[number];

/**
 * How a period's name reads (Spanish examples, a week and a month): `full` "12 oct – 18 oct
 * 2026", "Octubre de 2026"; `noYear` "12–18 oct", "Octubre"; `short` "12–18 OCT", "Oct 2026";
 * `numeric` "12/10 – 18/10", "10/2026". A year is always "2026".
 */
export const PERIOD_FORMATS = ['full', 'noYear', 'short', 'numeric'] as const;

export type PeriodFormat = (typeof PERIOD_FORMATS)[number];

/** Decimals a distance can show: `10,02`, `10,0` or `10` km. */
export const DISTANCE_DECIMALS = [2, 1, 0] as const;

/**
 * What goes behind a text, as in story editors: nothing, or a box of the color opposite to the
 * text's (black behind light text, white behind dark text), translucent or solid. The text keeps
 * its color.
 */
export const BACKDROPS = ['none', 'soft', 'solid'] as const;

/** Room between letters: none, open, or wide open (as a fraction of the font size). */
export const LETTER_SPACINGS = ['normal', 'wide', 'wider'] as const;

/** How a route's line is drawn. */
export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;

/** Most layers a template can hold. */
export const MAX_LAYERS = 50;

/** Longest free text a text layer can hold, in characters. */
export const MAX_TEXT_LENGTH = 200;

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'Expected a #RRGGBB or #RRGGBBAA color');

const transformSchema = z.object({
  /** Center of the layer, as a fraction of the canvas width. */
  x: z.number().min(0).max(1),
  /** Center of the layer, as a fraction of the canvas height. */
  y: z.number().min(0).max(1),
  /** Multiplier over the layer's base size. */
  scale: z.number().min(0.1).max(10),
  /** Clockwise rotation in radians. */
  rotation: z
    .number()
    .min(-2 * Math.PI)
    .max(2 * Math.PI),
});

const textStyleSchema = z.object({
  font: z.enum(FONT_IDS),
  color: colorSchema,
  bold: z.boolean(),
  uppercase: z.boolean(),
  align: z.enum(['left', 'center', 'right']),
  shadow: z.boolean(),
  /** What goes behind the text (see `BACKDROPS`); `none` when absent. */
  backdrop: z.enum(BACKDROPS).optional(),
  /** Room between letters (see `LETTER_SPACINGS`); `normal` when absent. */
  letterSpacing: z.enum(LETTER_SPACINGS).optional(),
});

const strokeStyleSchema = z.object({
  color: colorSchema,
  /** Line width in pixels at a 1080 px wide canvas; scaled with the export size. */
  width: z.number().min(1).max(40),
  /** Solid, dashed or dotted; `solid` when absent. */
  line: z.enum(LINE_STYLES).optional(),
  /** A soft glow of the line's color around it. */
  glow: z.boolean().optional(),
});

const layerBase = {
  id: z.string().min(1),
  transform: transformSchema,
  opacity: z.number().min(0).max(1),
};

/**
 * Widest a text block may be, as a fraction of the canvas width (before the layer's `scale`).
 * Longer text shrinks to fit instead of running into its neighbours. Optional: without it the
 * text keeps its size.
 */
const textFit = {
  maxWidth: z.number().min(0.05).max(1).optional(),
};

const dataLabels = {
  /** Show the metric name above the value ("Distance"). */
  showLabel: z.boolean(),
  /** Show the unit after the value ("km"). */
  showUnit: z.boolean(),
  /**
   * How a pace reads: `5:28` (`colon`, also when absent) or `5'28"` with minute and second
   * marks (`marks`), as on sports watches. Other metrics ignore it.
   */
  paceNotation: z.enum(['colon', 'marks']).optional(),
  /**
   * How a time reads (see `TIME_NOTATIONS`); `clock` when absent. Other metrics ignore it.
   */
  timeNotation: z.enum(TIME_NOTATIONS).optional(),
  /** Decimals of a distance (see `DISTANCE_DECIMALS`); 2 when absent. Others ignore it. */
  decimals: z.union([z.literal(2), z.literal(1), z.literal(0)]).optional(),
};

export const layerSchema = z.discriminatedUnion('kind', [
  z.object({
    ...layerBase,
    kind: z.literal('metric'),
    metric: z.enum(METRIC_IDS),
    ...dataLabels,
    ...textFit,
    style: textStyleSchema,
  }),
  z.object({
    ...layerBase,
    kind: z.literal('summaryMetric'),
    metric: z.enum(SUMMARY_METRIC_IDS),
    ...dataLabels,
    ...textFit,
    style: textStyleSchema,
  }),
  z.object({
    ...layerBase,
    kind: z.literal('info'),
    /** Activity name or date, or the period name ("October 2026"). */
    field: z.enum(['activityName', 'activityDate', 'periodName']),
    /** How the activity's date reads; `full` when absent. Other fields ignore it. */
    dateFormat: z.enum(DATE_FORMATS).optional(),
    /** How the period's name reads; `full` when absent. Other fields ignore it. */
    periodFormat: z.enum(PERIOD_FORMATS).optional(),
    ...textFit,
    style: textStyleSchema,
  }),
  z.object({
    ...layerBase,
    kind: z.literal('text'),
    content: z.string().min(1).max(MAX_TEXT_LENGTH),
    ...textFit,
    style: textStyleSchema,
  }),
  z.object({
    ...layerBase,
    kind: z.literal('route'),
    stroke: strokeStyleSchema,
    /** A dot where the route starts and a ring where it ends, in the line's color. */
    endpoints: z.boolean().optional(),
  }),
  z.object({ ...layerBase, kind: z.literal('summaryRoutes'), stroke: strokeStyleSchema }),
  z.object({
    ...layerBase,
    kind: z.literal('summaryChart'),
    /**
     * Size of each bar: `auto` follows the period (days for a week or month, months for a
     * year, see `bucketForPeriod`), so one template suits any period; the others force it.
     */
    bucket: z.enum(['auto', 'day', 'week', 'month']).default('auto'),
    value: z.enum(['distance', 'movingTime']),
    color: colorSchema,
    /** Day, date or month initial under each bar. */
    axisLabels: z.boolean().default(false),
    /** A line under the chart saying what the bars measure and over what ("KM PER WEEK"). */
    title: z.boolean().default(true),
    /** Font of the axis labels and the title. */
    font: z.enum(FONT_IDS).default('inter'),
    bold: z.boolean().default(true),
    /** Whether the title is in capitals (axis labels are initials and numbers already). */
    uppercase: z.boolean().default(true),
    /** Where the title sits under the bars. */
    align: z.enum(['left', 'center', 'right']).default('center'),
    /** A dashed line across the bars at their average. */
    averageLine: z.boolean().optional(),
    /** The value of the highest bar, over it. */
    maxLabel: z.boolean().optional(),
  }),
  z.object({
    ...layerBase,
    kind: z.literal('activityChart'),
    series: z.enum(ACTIVITY_CHART_SERIES),
    color: colorSchema,
    /** Distance (or time) at both ends of a line; the split numbers under the bars. */
    axisLabels: z.boolean(),
    /** A line under the chart saying what it shows ("ELEVATION", "SPLITS PER KM"). */
    title: z.boolean(),
    /** Font of the axis labels and the title. */
    font: z.enum(FONT_IDS),
    bold: z.boolean(),
    uppercase: z.boolean(),
    /** Where the title sits under the chart. */
    align: z.enum(['left', 'center', 'right']),
    /** A dashed line across the chart at the average. */
    averageLine: z.boolean().optional(),
    /** The highest point (the fastest split) marked, with its value. */
    maxLabel: z.boolean().optional(),
    /**
     * Splits as columns side by side (absent), or as rows one under another, each with its number
     * before the bar and its texts in a column on the right. Other series ignore it.
     */
    orientation: z.enum(['columns', 'rows']).optional(),
    /** In rows, each split's pace ("5:12"); shown when absent. */
    splitPace: z.boolean().optional(),
    /** In rows, each split's change in altitude ("+12 m"); hidden when absent. */
    splitElevation: z.boolean().optional(),
  }),
  z.object({
    ...layerBase,
    kind: z.literal('logo'),
    /**
     * Only AllRun for now. Strava's guidelines allow just its official "Powered by" / "Compatible
     * with" marks, unmodified; the product left them out (see ADR 002).
     */
    brand: z.enum(['allrun']),
    /** `light` (white) for dark photos, `dark` (black) for light ones, `color` on plain light. */
    tone: z.enum(['light', 'dark', 'color']),
    /**
     * AllRun artwork: the name alone (default, it is what people can search for), the monogram
     * alone, or both side by side.
     */
    variant: z.enum(['wordmark', 'mark', 'lockup']).default('wordmark'),
  }),
]);

export type Layer = z.infer<typeof layerSchema>;
export type LayerKind = Layer['kind'];

/** Layer kinds that only make sense with one activity or with a period summary. */
const ACTIVITY_ONLY: ReadonlySet<LayerKind> = new Set(['metric', 'route', 'activityChart']);
const SUMMARY_ONLY: ReadonlySet<LayerKind> = new Set([
  'summaryMetric',
  'summaryRoutes',
  'summaryChart',
]);

/** Whether a layer can be used in a template of the given mode. */
export function isLayerAllowed(mode: TemplateMode, layer: Layer): boolean {
  if (layer.kind === 'info') {
    return (layer.field === 'periodName') === (mode === 'summary');
  }
  return mode === 'activity' ? !SUMMARY_ONLY.has(layer.kind) : !ACTIVITY_ONLY.has(layer.kind);
}

export const templateSchema = z
  .object({
    /** Bumped on breaking changes, with a migration for stored templates. */
    version: z.literal(1),
    id: z.string().min(1),
    /** Optional: templates are recognised by their thumbnail (see ADR 007). */
    name: z.string().trim().min(1).max(60).optional(),
    mode: z.enum(['activity', 'summary']),
    format: z.enum(['story', 'tall', 'portrait', 'square', 'landscape']),
    layers: z.array(layerSchema).max(MAX_LAYERS),
  })
  .superRefine((template, context) => {
    const seen = new Set<string>();
    template.layers.forEach((layer, index) => {
      if (seen.has(layer.id)) {
        context.addIssue({
          code: 'custom',
          path: ['layers', index, 'id'],
          message: `Duplicate layer id "${layer.id}"`,
        });
      }
      seen.add(layer.id);
      if (!isLayerAllowed(template.mode, layer)) {
        context.addIssue({
          code: 'custom',
          path: ['layers', index],
          message: `Layer "${layer.kind}" is not allowed in ${template.mode} templates`,
        });
      }
    });
  });

export type Template = z.infer<typeof templateSchema>;

/**
 * Validates a stored or shared template (raw JSON).
 *
 * @throws Error naming each invalid field when the template doesn't match the schema.
 */
export function parseTemplate(json: unknown): Template {
  const result = templateSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid template:\n${z.prettifyError(result.error)}`, {
      cause: result.error,
    });
  }
  return result.data;
}
