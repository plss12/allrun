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

/** Fonts bundled with the app. */
export const FONT_IDS = [
  'inter',
  'bebasNeue',
  'oswald',
  'barlowCondensed',
  'spaceMono',
  'playfairDisplay',
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
});

const strokeStyleSchema = z.object({
  color: colorSchema,
  /** Line width in pixels at a 1080 px wide canvas; scaled with the export size. */
  width: z.number().min(1).max(40),
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
    ...textFit,
    style: textStyleSchema,
  }),
  z.object({
    ...layerBase,
    kind: z.literal('text'),
    content: z.string().min(1).max(200),
    ...textFit,
    style: textStyleSchema,
  }),
  z.object({ ...layerBase, kind: z.literal('route'), stroke: strokeStyleSchema }),
  z.object({ ...layerBase, kind: z.literal('summaryRoutes'), stroke: strokeStyleSchema }),
  z.object({
    ...layerBase,
    kind: z.literal('summaryChart'),
    bucket: z.enum(['day', 'week', 'month']),
    value: z.enum(['distance', 'movingTime']),
    color: colorSchema,
    /** Day, date or month initial under each bar. */
    axisLabels: z.boolean().default(false),
  }),
  z.object({
    ...layerBase,
    kind: z.literal('logo'),
    brand: z.enum(['allrun', 'poweredByStrava']),
    /** `light` (white) for dark photos, `dark` (black) for light ones, `color` on plain light. */
    tone: z.enum(['light', 'dark', 'color']),
    /**
     * AllRun artwork: the name alone (default, it is what people can search for), the monogram
     * alone, or both side by side. Ignored for other brands.
     */
    variant: z.enum(['wordmark', 'mark', 'lockup']).default('wordmark'),
  }),
]);

export type Layer = z.infer<typeof layerSchema>;
export type LayerKind = Layer['kind'];

/** Layer kinds that only make sense with one activity or with a period summary. */
const ACTIVITY_ONLY: ReadonlySet<LayerKind> = new Set(['metric', 'route']);
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
    name: z.string().trim().min(1).max(60),
    mode: z.enum(['activity', 'summary']),
    format: z.enum(['story', 'tall', 'portrait', 'square', 'landscape']),
    layers: z.array(layerSchema).max(50),
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
