import { type DateRange, rangeLength } from './dates';
import type { BucketSize, PeriodSummary } from './summary';
import { summaryHasDistance } from './summary-metrics';
import {
  type DateFormat,
  type Layer,
  type LayerKind,
  type PeriodFormat,
  type Template,
} from './template';

/**
 * The look of each layer, as the style panel edits it: color, opacity, text style, data labels,
 * line width, chart and logo options. Edits are pure and return `template` itself when nothing
 * changes, so committing the result records no empty undo step (like `template-edit.ts`).
 *
 * Options a layer doesn't have (a font on a route, a color on the logo) throw: the panel only
 * offers what applies to the selected layer.
 */

/**
 * Colors offered for widgets, in pages of seven that the panel swipes through: the basics with the
 * brand's (white, black, Night Ink, Track Red), vivid ones, soft ones, and a white-to-black scale.
 * Within a page no two colors look alike (Chalk was dropped: next to white it looked the same).
 */
export const STYLE_COLOR_PAGES = [
  {
    id: 'basic',
    colors: [
      { id: 'white', hex: '#FFFFFF' },
      { id: 'black', hex: '#000000' },
      { id: 'nightInk', hex: '#141B2D' },
      { id: 'trackRed', hex: '#C94A2E' },
      { id: 'yellow', hex: '#FFD60A' },
      { id: 'green', hex: '#30D158' },
      { id: 'blue', hex: '#0A84FF' },
    ],
  },
  {
    id: 'vivid',
    colors: [
      { id: 'electricBlue', hex: '#1F4BFF' },
      { id: 'bubblegum', hex: '#FF6FB5' },
      { id: 'neonGreen', hex: '#39FF14' },
      { id: 'cyan', hex: '#00D9FF' },
      { id: 'purple', hex: '#9B5CFF' },
      { id: 'orange', hex: '#FF8A00' },
      { id: 'red', hex: '#FF3B30' },
    ],
  },
  {
    id: 'soft',
    colors: [
      { id: 'lilac', hex: '#C9B3FF' },
      { id: 'mint', hex: '#9DF2C9' },
      { id: 'peach', hex: '#FFC2A1' },
      { id: 'sky', hex: '#9AD8FF' },
      { id: 'rose', hex: '#FFB8D9' },
      { id: 'coral', hex: '#FF7A6B' },
      { id: 'olive', hex: '#8C9A5B' },
    ],
  },
  {
    id: 'grays',
    colors: [
      { id: 'white', hex: '#FFFFFF' },
      { id: 'gray1', hex: '#D6D6D6' },
      { id: 'gray2', hex: '#ADADAD' },
      { id: 'gray3', hex: '#858585' },
      { id: 'gray4', hex: '#5C5C5C' },
      { id: 'gray5', hex: '#333333' },
      { id: 'black', hex: '#000000' },
    ],
  },
] as const;

export type StyleColorId = (typeof STYLE_COLOR_PAGES)[number]['colors'][number]['id'];

/** Index of the first color page holding `color`, or 0 when no page has it. Time O(1). */
export function colorPageOf(color: string | null): number {
  const hex = color?.toUpperCase();
  const index = STYLE_COLOR_PAGES.findIndex((page) =>
    page.colors.some((candidate) => candidate.hex === hex),
  );
  return Math.max(index, 0);
}

/** Opacities offered for widgets, from opaque to faint; a widget never fades out entirely. */
export const STYLE_OPACITIES = [1, 0.8, 0.6, 0.4, 0.2] as const;

const HEX_COLOR = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?$/;

/**
 * Relative luminance of a `#RRGGBB` or `#RRGGBBAA` color (alpha ignored), from 0 for black to 1
 * for white, as defined by WCAG 2.x (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance): each
 * sRGB channel is linearized, then weighted by how bright the eye sees it. Time and space O(1).
 *
 * @throws Error for anything that is not a hex color.
 */
export function relativeLuminance(color: string): number {
  const match = HEX_COLOR.exec(color);
  if (match === null) {
    throw new Error(`Expected a #RRGGBB or #RRGGBBAA color, got "${color}"`);
  }
  const [r, g, b] = [match[1], match[2], match[3]].map((hex) => {
    const channel = parseInt(hex, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Luminance above which a widget casts the dark drop shadow. Light and bright colors (Track Red
 * is 0.175) need it to read over photos and to stand out from the layers below; under black or
 * Night Ink a dark shadow only blurs the edges, so they go without.
 */
export const SHADOW_LUMINANCE = 0.1;

/** Luminance above which a color reads as light: what goes with it is dark, and the reverse. */
const LIGHT_LUMINANCE = 0.4;

/**
 * Black or white, whichever is opposite to `color`: the backdrop behind a text of that color,
 * solid or translucent (black behind light text, white behind dark text).
 *
 * @throws Error for a color that is not `#RRGGBB(AA)`.
 */
export function contrastingInk(color: string): '#000000' | '#FFFFFF' {
  return relativeLuminance(color) > LIGHT_LUMINANCE ? '#000000' : '#FFFFFF';
}

/** Whether a widget of this color gets the drop shadow; there is no setting for it. */
export function castsShadow(color: string): boolean {
  return relativeLuminance(color) > SHADOW_LUMINANCE;
}

type LayerOf<K extends LayerKind> = Extract<Layer, { kind: K }>;
type TextLayer = LayerOf<'metric' | 'summaryMetric' | 'info' | 'text'>;
export type TextStyle = TextLayer['style'];
type ChartLayer = LayerOf<'summaryChart'>;
type LineStyle = NonNullable<LayerOf<'route'>['stroke']['line']>;
type LogoLayer = LayerOf<'logo'>;

const TEXT_KINDS = ['metric', 'summaryMetric', 'info', 'text'] as const;
const DATA_KINDS = ['metric', 'summaryMetric'] as const;
const LINE_KINDS = ['route', 'summaryRoutes'] as const;
const ALL_KINDS = [...TEXT_KINDS, ...LINE_KINDS, 'summaryChart', 'logo'] as const;

function isKind<K extends LayerKind>(layer: Layer, kinds: readonly K[]): layer is LayerOf<K> {
  return (kinds as readonly LayerKind[]).includes(layer.kind);
}

/** Whether every field of `patch` already has that value in `current`. */
function unchanged<T extends object>(current: T, patch: Partial<T>): boolean {
  return (Object.keys(patch) as (keyof T)[]).every((key) => Object.is(current[key], patch[key]));
}

/**
 * Replaces one layer of one of `kinds` with `change(layer)`. `template` itself when the layer is
 * missing or `change` returns it unchanged. Time and space O(n) for n layers.
 *
 * @throws Error when the layer is of another kind (`option` names what was being set).
 */
function editLayer<K extends LayerKind>(
  template: Template,
  id: string,
  kinds: readonly K[],
  option: string,
  change: (layer: LayerOf<K>) => LayerOf<K>,
): Template {
  const index = template.layers.findIndex((layer) => layer.id === id);
  if (index === -1) {
    return template;
  }
  const layer = template.layers[index];
  if (!isKind(layer, kinds)) {
    throw new Error(`Layer "${id}" (${layer.kind}) has no ${option}`);
  }
  const next = change(layer);
  if (next === layer) {
    return template;
  }
  const layers = [...template.layers];
  layers[index] = next;
  return { ...template, layers };
}

/** The color a layer is drawn with, or `null` for the logo, which has tones instead. */
export function layerColor(layer: Layer): string | null {
  switch (layer.kind) {
    case 'metric':
    case 'summaryMetric':
    case 'info':
    case 'text':
      return layer.style.color;
    case 'route':
    case 'summaryRoutes':
      return layer.stroke.color;
    case 'summaryChart':
      return layer.color;
    case 'logo':
      return null;
  }
}

/**
 * Sets the color of a text, line or chart layer.
 *
 * @throws Error for the logo, which has tones instead, or a color that is not `#RRGGBB(AA)`.
 */
export function setLayerColor(template: Template, id: string, color: string): Template {
  relativeLuminance(color);
  return editLayer(
    template,
    id,
    [...TEXT_KINDS, ...LINE_KINDS, 'summaryChart'],
    'color',
    (layer) => {
      if (layerColor(layer) === color) {
        return layer;
      }
      switch (layer.kind) {
        case 'metric':
        case 'summaryMetric':
        case 'info':
        case 'text':
          return { ...layer, style: { ...layer.style, color } };
        case 'route':
        case 'summaryRoutes':
          return { ...layer, stroke: { ...layer.stroke, color } };
        case 'summaryChart':
          return { ...layer, color };
      }
    },
  );
}

/**
 * Sets how opaque any layer is.
 *
 * @throws RangeError when `opacity` is outside 0..1.
 */
export function setLayerOpacity(template: Template, id: string, opacity: number): Template {
  if (!(opacity >= 0 && opacity <= 1)) {
    throw new RangeError(`Opacity must be within 0..1, got ${opacity}`);
  }
  return editLayer(template, id, ALL_KINDS, 'opacity', (layer) =>
    layer.opacity === opacity ? layer : { ...layer, opacity },
  );
}

/**
 * How an activity's date reads.
 *
 * @throws Error for any layer but the activity's date.
 */
export function setDateFormat(template: Template, id: string, dateFormat: DateFormat): Template {
  return editLayer(template, id, ['info'], 'date format', (layer) => {
    if (layer.field !== 'activityDate') {
      throw new Error(`Layer "${id}" (${layer.field}) has no date format`);
    }
    return (layer.dateFormat ?? 'full') === dateFormat ? layer : { ...layer, dateFormat };
  });
}

/**
 * How a period's name reads.
 *
 * @throws Error for any layer but the period's name.
 */
export function setPeriodFormat(
  template: Template,
  id: string,
  periodFormat: PeriodFormat,
): Template {
  return editLayer(template, id, ['info'], 'period format', (layer) => {
    if (layer.field !== 'periodName') {
      throw new Error(`Layer "${id}" (${layer.field}) has no period format`);
    }
    return (layer.periodFormat ?? 'full') === periodFormat ? layer : { ...layer, periodFormat };
  });
}

/**
 * Font, weight, case, alignment, backdrop or letter spacing of a text layer; the color goes
 * through `setLayerColor`.
 */
export function setTextStyle(
  template: Template,
  id: string,
  patch: Partial<Omit<TextStyle, 'color' | 'shadow'>>,
): Template {
  return editLayer(template, id, TEXT_KINDS, 'text style', (layer) => {
    // Without them a text has no backdrop and normal spacing: choosing that changes nothing.
    const current = {
      ...layer.style,
      backdrop: layer.style.backdrop ?? 'none',
      letterSpacing: layer.style.letterSpacing ?? 'normal',
    };
    return unchanged(current, patch) ? layer : { ...layer, style: { ...layer.style, ...patch } };
  });
}

/**
 * Whether a metric shows its name above the value and its unit after it, and how its value
 * reads: a pace (`5:28` or `5'28"`), a time (`1:40:30`, `1h 40min 30s`…) or the decimals of a
 * distance.
 */
export function setDataLabels(
  template: Template,
  id: string,
  patch: Partial<
    Pick<LayerOf<'metric'>, 'showLabel' | 'showUnit' | 'paceNotation' | 'timeNotation' | 'decimals'>
  >,
): Template {
  return editLayer(template, id, DATA_KINDS, 'data labels', (layer) =>
    // Without a notation a pace reads with a colon, a time as a clock and a distance with two
    // decimals: choosing that changes nothing.
    unchanged(
      {
        ...layer,
        paceNotation: layer.paceNotation ?? 'colon',
        timeNotation: layer.timeNotation ?? 'clock',
        decimals: layer.decimals ?? 2,
      },
      patch,
    )
      ? layer
      : { ...layer, ...patch },
  );
}

/**
 * Line widths offered for routes, in pixels at a 1080 px wide canvas. A summary overlays many
 * routes, so its lines are thinner than a single activity's.
 */
export const STROKE_WIDTHS: Readonly<
  Record<
    (typeof LINE_KINDS)[number],
    { readonly thin: number; readonly medium: number; readonly thick: number }
  >
> = {
  route: { thin: 5, medium: 8, thick: 14 },
  summaryRoutes: { thin: 2, medium: 4, thick: 7 },
};

/**
 * Sets the line width of a route layer.
 *
 * @throws RangeError when `width` is outside the template's 1..40.
 */
export function setStrokeWidth(template: Template, id: string, width: number): Template {
  if (!(width >= 1 && width <= 40)) {
    throw new RangeError(`Line width must be within 1..40, got ${width}`);
  }
  return editLayer(template, id, LINE_KINDS, 'line width', (layer) =>
    layer.stroke.width === width ? layer : { ...layer, stroke: { ...layer.stroke, width } },
  );
}

/**
 * How a route's line is drawn (solid, dashed or dotted), whether it glows and, for one
 * activity's route, whether its start and end are marked.
 *
 * @throws Error when marking the ends of a period's routes, which would be a cloud of dots.
 */
export function setLineOptions(
  template: Template,
  id: string,
  patch: {
    readonly line?: LineStyle;
    readonly glow?: boolean;
    readonly endpoints?: boolean;
  },
): Template {
  return editLayer(template, id, LINE_KINDS, 'line options', (layer) => {
    if (patch.endpoints !== undefined && layer.kind !== 'route') {
      throw new Error(`Layer "${id}" (${layer.kind}) has no start and end marks`);
    }
    const current = {
      line: layer.stroke.line ?? 'solid',
      glow: layer.stroke.glow ?? false,
      endpoints: layer.kind === 'route' ? (layer.endpoints ?? false) : false,
    };
    if (unchanged(current, patch)) {
      return layer;
    }
    const { endpoints, ...stroke } = patch;
    const next = { ...layer, stroke: { ...layer.stroke, ...stroke } };
    return endpoints === undefined ? next : { ...next, endpoints };
  });
}

/**
 * What a chart shows (distance or time), its bar size, whether it has labels, a title and an
 * average line, and how its texts are written (font, bold, capitals, alignment of the title).
 */
export function setChartOptions(
  template: Template,
  id: string,
  patch: Partial<
    Pick<
      ChartLayer,
      | 'value'
      | 'bucket'
      | 'axisLabels'
      | 'title'
      | 'font'
      | 'bold'
      | 'uppercase'
      | 'align'
      | 'averageLine'
    >
  >,
): Template {
  return editLayer(template, id, ['summaryChart'], 'chart options', (layer) => {
    const current = {
      ...layer,
      averageLine: layer.averageLine ?? false,
    };
    return unchanged(current, patch) ? layer : { ...layer, ...patch };
  });
}

/** Tone (light, dark or brand colors) and artwork (name, monogram or both) of the logo. */
export function setLogoOptions(
  template: Template,
  id: string,
  patch: Partial<Pick<LogoLayer, 'tone' | 'variant'>>,
): Template {
  return editLayer(template, id, ['logo'], 'logo options', (layer) =>
    unchanged(layer, patch) ? layer : { ...layer, ...patch },
  );
}

/**
 * What a chart of the period can measure: distance only when some activity has any (a month of
 * gym sessions would draw empty bars), time always. Time and space O(1).
 */
export function chartValueOptions(summary: PeriodSummary): ChartLayer['value'][] {
  return summaryHasDistance(summary) ? ['distance', 'movingTime'] : ['movingTime'];
}

/** Fewest and most bars a chart may have for a bar size to be offered. */
const MIN_BARS = 3;
const MAX_BARS = 62;

/**
 * Bar sizes worth offering for a chart of `range`: every size that gives between 3 and 62 bars,
 * so a week offers only days, a month days or weeks, and a year weeks or months. A chart starts
 * on `auto` (the period's own size, which is always one of these when there is a choice) until
 * the user picks one. Time and space O(1).
 */
export function chartBucketOptions(range: DateRange): BucketSize[] {
  const days = rangeLength(range);
  const [startYear, startMonth] = range.start.split('-').map(Number);
  const [endYear, endMonth] = range.end.split('-').map(Number);
  const counts = {
    day: days,
    week: Math.ceil(days / 7),
    month: (endYear - startYear) * 12 + endMonth - startMonth + 1,
  } as const;
  const sizes = (['day', 'week', 'month'] as const).filter(
    (size) => counts[size] >= MIN_BARS && counts[size] <= MAX_BARS,
  );
  return sizes;
}
