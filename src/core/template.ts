import { z } from 'zod';

import type { MetricId } from './metrics';
import { PLACE_FORMATS } from './place';

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
 * font). Adding a font is compatible; removing one needs its designs to read with another (see
 * `RETIRED_FONTS`).
 */
export const FONT_IDS = [
  // Plain ones first, then the heavy ones, those with a character of their own, the hand-drawn
  // ones and the techy ones: the order of the style panel.
  'inter',
  'barlowCondensed',
  'bigShoulders',
  'anton',
  'unbounded',
  'bowlbyOneSC',
  'graduate',
  'playfairDisplay',
  'spaceMono',
  'permanentMarker',
  'sacramento',
  'bangers',
  'orbitron',
  'doto',
  'rubikGlitch',
] as const;

export type FontId = (typeof FONT_IDS)[number];

/**
 * Fonts the app no longer bundles (too close to another one, or unfit for sport images), and the
 * closest one left, which designs saved with them read with.
 */
const RETIRED_FONTS: Readonly<Record<string, FontId>> = {
  archivoBlack: 'unbounded',
  delaGothicOne: 'unbounded',
  fredoka: 'inter',
  dancingScript: 'playfairDisplay',
};

/** A font of a design, a retired one read as its replacement. */
const fontSchema = z.preprocess(
  (font) => (typeof font === 'string' ? (RETIRED_FONTS[font] ?? font) : font),
  z.enum(FONT_IDS),
);

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
 * How a time reads: `clock` "1:40:30" (a period's total "280:40 h") or `units` "1h 40min 30s"
 * ("280h 40min"). Never rounded: an activity keeps its seconds (ADR 009).
 */
export const TIME_NOTATIONS = ['clock', 'units'] as const;

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

/**
 * What goes behind a text, as in story editors: nothing, or a box of the color opposite to the
 * text's (black behind light text, white behind dark text), translucent or solid. The text keeps
 * its color.
 */
export const BACKDROPS = ['none', 'soft', 'solid'] as const;

/** Room between letters: none, open, or wide open (as a fraction of the font size). */
export const LETTER_SPACINGS = ['normal', 'wide', 'wider'] as const;

/**
 * How a heart rate chart shows the athlete's zones: its line colored by zone, the line and a
 * table of the time spent in each zone, or the table alone.
 */
export const HEART_RATE_ZONE_VIEWS = ['line', 'lineAndTable', 'table'] as const;

export type HeartRateZoneView = (typeof HEART_RATE_ZONE_VIEWS)[number];

/** How a route's line is drawn. */
export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;

/**
 * Mixed widgets of one activity: several of its data in one designed block (ADR 009), which the
 * editor fills with the data that suit its sport (see `blockMetrics`). They come in two families
 * (see `isAppReplica`): typographic ones, each with a font of its own that the user can change,
 * and replicas of other apps, whose look (colors, font, icons) is fixed because recognizing the
 * app is the point. Each design comes in a few versions, the pages of its tile in the gallery:
 * - `headline`: one big datum with two more under it (`stacked`), beside it (`inline`), or the
 *   three in one line (`condensed`);
 * - `columns`: 2, 3, 4 or 6 data, each with its name over it, in columns (one datum alone is a
 *   data widget);
 * - `route`: the route with data under it (`stacked`), beside it (`inline`), or between two data
 *   (`between`); only for activities with a route;
 * - `day`: the weekday written big, its date and three data under it (`stacked`) or beside it
 *   (`inline`);
 * - `sport`: the sport's icon and name over its data, one under another (`centered`) or as a list
 *   of names and values (`list`);
 * - `poster`: the main datum huge and turned upright, the sport and two more data beside it;
 * - `tall`: the main datum tall, unit and all, two more data under it without names, in a thin
 *   (`thin`) or a heavy (`heavy`) letter;
 * - `wide`: the main datum wide and heavy, unit and all, with two data under it at its ends
 *   (`pair`), three spread under it (`trio`), or under the weekday, as wide (`weekday`);
 * - `weekday`: the weekday's short name, heavy and stretched, over four data without names in
 *   two columns (`grid`), or between them, two on each side (`inline`);
 * - `serif`: the activity's name and date over three data with their names, in a serif italic;
 * - `notes` (replica): the splits as a note of the iPhone's Notes, the fastest in its yellow, in
 *   dark or light mode; only for activities with splits;
 * - `message` (replica): two data as a sent chat message, the sport and start time where the
 *   time and the read ticks go, in dark or light mode;
 * - `music` (replica): the activity as the song playing on a phone's lock screen: the route as its
 *   cover, its name and date as the song's, two data at the ends of the progress bar, in dark or
 *   light mode;
 * - `camera` (replica): the phone's camera framing the whole canvas, three data where its settings
 *   go, the sport's icon on its f button and the route as the last photo's thumbnail;
 * - `verse`: a Bible verse from a public-domain translation, with its reference, chosen from a list;
 * - `quote`: a famous athlete's or writer's motivating quote, with its author, chosen from a list;
 * - `laps` (replica): the laps as a timing board (`board`) or as a karting's timing sheet
 *   (`sheet`), the fastest marked in a brand color (`cover`); only for activities with laps;
 * - `grandPrix` (replica): the splits as a race's timing tower on TV, in lap order, each with its
 *   pace and its gap to the fastest, which carries the fastest lap's mark, under the distance;
 * - `alarm` (replica): the start time as an alarm of the iPhone, the sport and distance as its
 *   label, in dark or light mode;
 * - `location` (replica): the place and the distance as a location sticker, in light or dark
 *   mode; only when the place is known.
 */
export const ACTIVITY_BLOCK_DESIGNS = [
  'headline',
  'columns',
  'route',
  'day',
  'sport',
  'poster',
  'tall',
  'wide',
  'weekday',
  'serif',
  'notes',
  'message',
  'music',
  'camera',
  'verse',
  'quote',
  'laps',
  'grandPrix',
  'alarm',
  'location',
] as const;

export type ActivityBlockDesign = (typeof ACTIVITY_BLOCK_DESIGNS)[number];

export const HEADLINE_LAYOUTS = ['stacked', 'inline', 'condensed'] as const;
export const BLOCK_COLUMN_COUNTS = [2, 3, 4, 6] as const;
export const ROUTE_LAYOUTS = ['stacked', 'inline', 'between'] as const;
export const DAY_LAYOUTS = ['stacked', 'inline'] as const;
export const SPORT_LAYOUTS = ['centered', 'list'] as const;
export const TALL_LAYOUTS = ['thin', 'heavy'] as const;
export const WIDE_LAYOUTS = ['pair', 'trio', 'weekday'] as const;
export const WEEKDAY_LAYOUTS = ['grid', 'inline'] as const;
/** The two looks of an app replica, as the app shows them in dark and light mode. */
export const APP_MODES = ['dark', 'light'] as const;
/**
 * What a replica draws the route on (the song's cover, the camera's last photo): AllRun's red or
 * its night ink. A version in one brand color always comes with one in the other.
 */
export const BRAND_COVERS = ['red', 'ink'] as const;
export const LAPS_LAYOUTS = ['board', 'sheet'] as const;
/**
 * Bible verses of the verse widget, from translations in the public domain: the World English
 * Bible in English, the Reina-Valera 1909 in Spanish. Their texts are in the locales. The first
 * is the one the gallery shows, under its "Tap to choose" hint: a short one, so the hint covers
 * little of it (the same goes for the quotes).
 */
export const VERSES = [
  'philippians4v13',
  'romans8v18',
  'isaiah40v31',
  'timothy4v7',
  'hebrews12v1',
  'corinthians9v24',
] as const;
/** Quotes of the quote widget, by their author; their texts are in the locales. */
export const QUOTES = [
  'kipchoge',
  'prefontaine',
  'murakami',
  'zatopek',
  'karnazes',
  'bingham',
  'jordan',
  'notke',
  'billieJeanKing',
  'ali',
] as const;

export type Verse = (typeof VERSES)[number];
export type Quote = (typeof QUOTES)[number];

const activityBlockSchema = z.discriminatedUnion('design', [
  z.object({ design: z.literal('headline'), layout: z.enum(HEADLINE_LAYOUTS) }),
  z.object({ design: z.literal('columns'), count: z.literal(BLOCK_COLUMN_COUNTS) }),
  z.object({ design: z.literal('route'), layout: z.enum(ROUTE_LAYOUTS) }),
  z.object({ design: z.literal('day'), layout: z.enum(DAY_LAYOUTS) }),
  z.object({ design: z.literal('sport'), layout: z.enum(SPORT_LAYOUTS) }),
  z.object({ design: z.literal('poster') }),
  z.object({ design: z.literal('tall'), layout: z.enum(TALL_LAYOUTS) }),
  z.object({ design: z.literal('wide'), layout: z.enum(WIDE_LAYOUTS) }),
  z.object({ design: z.literal('weekday'), layout: z.enum(WEEKDAY_LAYOUTS) }),
  z.object({ design: z.literal('serif') }),
  z.object({ design: z.literal('notes'), layout: z.enum(APP_MODES) }),
  z.object({ design: z.literal('message'), layout: z.enum(APP_MODES) }),
  z.object({
    design: z.literal('music'),
    layout: z.enum(APP_MODES),
    cover: z.enum(BRAND_COVERS),
  }),
  z.object({ design: z.literal('camera'), cover: z.enum(BRAND_COVERS) }),
  z.object({ design: z.literal('verse'), verse: z.enum(VERSES) }),
  z.object({ design: z.literal('quote'), quote: z.enum(QUOTES) }),
  z.object({
    design: z.literal('laps'),
    layout: z.enum(LAPS_LAYOUTS),
    cover: z.enum(BRAND_COVERS),
  }),
  z.object({ design: z.literal('grandPrix') }),
  z.object({ design: z.literal('alarm'), layout: z.enum(APP_MODES) }),
  z.object({ design: z.literal('location'), layout: z.enum(APP_MODES) }),
]);

export type ActivityBlock = z.infer<typeof activityBlockSchema>;

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
  font: fontSchema,
  color: colorSchema,
  bold: z.boolean(),
  /** Slanted: the font's own italic, or its letters leaned when it has none; upright when absent. */
  italic: z.boolean().optional(),
  uppercase: z.boolean(),
  align: z.enum(['left', 'center', 'right']),
  shadow: z.boolean(),
  /** What goes behind the text (see `BACKDROPS`); `none` when absent. */
  backdrop: z.enum(BACKDROPS).optional(),
  /** Room between letters (see `LETTER_SPACINGS`); `normal` when absent. */
  letterSpacing: z.enum(LETTER_SPACINGS).optional(),
});

/**
 * How a mixed widget's texts look: one font and color for the whole block, which sets its names
 * and secondary data apart by size and weight. Its shadow follows its color (see `castsShadow`).
 */
const blockStyleSchema = textStyleSchema.pick({
  font: true,
  color: true,
  bold: true,
  italic: true,
  uppercase: true,
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
   * Templates saved while times could be rounded (`rounded`) read in units, with their seconds;
   * those saved while distances could drop decimals (`decimals`) read with both: the field is
   * dropped.
   */
  timeNotation: z
    .enum([...TIME_NOTATIONS, 'rounded'])
    .transform((notation) => (notation === 'rounded' ? 'units' : notation))
    .optional(),
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
    /** Activity name, date or place ("Sevilla"), or the period name ("October 2026"). */
    field: z.enum(['activityName', 'activityDate', 'activityPlace', 'periodName']),
    /** How the activity's date reads; `full` when absent. Other fields ignore it. */
    dateFormat: z.enum(DATE_FORMATS).optional(),
    /** How the period's name reads; `full` when absent. Other fields ignore it. */
    periodFormat: z.enum(PERIOD_FORMATS).optional(),
    /** How the activity's place reads; `city` when absent. Other fields ignore it. */
    placeFormat: z.enum(PLACE_FORMATS).optional(),
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
  // Templates saved while routes could mark their start and end (`endpoints`) still read: the
  // field is dropped.
  z.object({ ...layerBase, kind: z.literal('route'), stroke: strokeStyleSchema }),
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
    // Templates saved while charts had a title under them (`title`) still read: the field is
    // dropped, and the header over the chart takes its place.
    /**
     * Two data over the chart, the period's total and its average per bar (shown when absent);
     * without them, the chart's name ("KM PER WEEK"), so it still says what it shows.
     */
    header: z.boolean().optional(),
    /** Font of the header and the axis labels. */
    font: fontSchema.default('inter'),
    bold: z.boolean().default(true),
    /** Texts slanted (see the text style's `italic`); upright when absent. */
    italic: z.boolean().optional(),
    /** Whether the header is in capitals (axis labels are initials and numbers already). */
    uppercase: z.boolean().default(true),
    /** Where the header sits over the bars. */
    align: z.enum(['left', 'center', 'right']).default('center'),
    /** A dashed line across the bars at their average (written in the header). */
    averageLine: z.boolean().optional(),
    /**
     * Each bar's value, in a row over the chart. Templates saved when the highest bar could be
     * marked alone (`maxLabel`) still read: the field is dropped.
     */
    barValues: z.boolean().optional(),
  }),
  z.object({
    ...layerBase,
    kind: z.literal('activityChart'),
    series: z.enum(ACTIVITY_CHART_SERIES),
    color: colorSchema,
    // Templates saved while charts had a title under them (`title`), labels at the ends of a
    // line (`axisLabels`) or its highest point marked (`maxLabel`) still read: the fields are
    // dropped, and the header over the chart writes what they said.
    /**
     * Two data over the chart ("AVG PACE 5:44 /KM · FASTEST PACE 4:01 /KM"; see
     * `activityChartHeader`), shown when absent; without them, the chart's name ("ELEVATION"),
     * so it still says what it shows. Splits that write each pace have neither: the paces and the
     * names of their columns say it all.
     */
    header: z.boolean().optional(),
    /** Font of the header and the texts of the splits. */
    font: fontSchema,
    bold: z.boolean(),
    /** Texts slanted (see the text style's `italic`); upright when absent. */
    italic: z.boolean().optional(),
    uppercase: z.boolean(),
    /** Where the header sits over the chart. */
    align: z.enum(['left', 'center', 'right']),
    /** A dashed line across the chart at the average (written in the header). Splits ignore it. */
    averageLine: z.boolean().optional(),
    /**
     * The heart rate zones (see `HEART_RATE_ZONE_VIEWS`): the line colored by zone, the line and
     * a table of the time in each, or the table alone. Other series ignore it.
     */
    zones: z.enum(HEART_RATE_ZONE_VIEWS).optional(),
    // Splits are a table, as on Strava: the number and pace of each split, its bar, then its
    // change in altitude and heart rate. Templates saved while they could also be columns
    // (`orientation`) still read: the field is dropped, and they draw as rows.
    /** Each split's pace ("5:12"), after its number; shown when absent. */
    splitPace: z.boolean().optional(),
    /** Each split's change in altitude ("12", "−3"), after its bar; hidden when absent. */
    splitElevation: z.boolean().optional(),
    /** Each split's average heart rate ("152"), at the end of its row; hidden when absent. */
    splitHeartRate: z.boolean().optional(),
  }),
  z.object({
    ...layerBase,
    kind: z.literal('activityBlock'),
    block: activityBlockSchema,
    /** The AllRun name at the foot of the block, in its color, as Strava signs its own. */
    logo: z.boolean(),
    style: blockStyleSchema,
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
const ACTIVITY_ONLY: ReadonlySet<LayerKind> = new Set([
  'metric',
  'route',
  'activityChart',
  'activityBlock',
]);
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
