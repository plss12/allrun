import type { ImageFrame, Layer, LayerKind, Template } from './template';

/**
 * The look of each layer, as the style panel edits it: color, opacity, text style, data labels,
 * line width, chart and logo options. Edits are pure and return `template` itself when nothing
 * changes, so committing the result records no empty undo step (like `template-edit.ts`).
 *
 * Options a layer doesn't have (a font on a route, a color on the logo) throw: the panel only
 * offers what applies to the selected layer.
 */

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
type LogoLayer = LayerOf<'logo'>;
type BlockLayer = LayerOf<'activityBlock' | 'summaryBlock'>;

const TEXT_KINDS = ['metric', 'summaryMetric', 'info', 'text'] as const;
const DATA_KINDS = ['metric', 'summaryMetric'] as const;
const LINE_KINDS = ['route', 'summaryRoutes'] as const;
const CHART_KINDS = ['summaryChart', 'activityChart'] as const;
const BLOCK_KINDS = ['activityBlock', 'summaryBlock'] as const;
const ALL_KINDS = [
  ...TEXT_KINDS,
  ...LINE_KINDS,
  ...CHART_KINDS,
  ...BLOCK_KINDS,
  'logo',
  'image',
] as const;

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

/**
 * The color a layer is drawn with, or `null` for the logo, which has tones instead, and a picture,
 * which has frames.
 */
export function layerColor(layer: Layer): string | null {
  switch (layer.kind) {
    case 'metric':
    case 'summaryMetric':
    case 'info':
    case 'text':
    case 'activityBlock':
    case 'summaryBlock':
      return layer.style.color;
    case 'route':
    case 'summaryRoutes':
      return layer.stroke.color;
    case 'summaryChart':
    case 'activityChart':
      return layer.color;
    case 'logo':
    case 'image':
      return null;
  }
}

/**
 * Sets the color of a text, line, chart or mixed layer.
 *
 * @throws Error for the logo, which has tones instead, or a color that is not `#RRGGBB(AA)`.
 */
export function setLayerColor(template: Template, id: string, color: string): Template {
  relativeLuminance(color);
  return editLayer(
    template,
    id,
    [...TEXT_KINDS, ...LINE_KINDS, ...CHART_KINDS, ...BLOCK_KINDS],
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
        case 'activityBlock':
        case 'summaryBlock':
          return { ...layer, style: { ...layer.style, color } };
        case 'route':
        case 'summaryRoutes':
          return { ...layer, stroke: { ...layer.stroke, color } };
        case 'summaryChart':
        case 'activityChart':
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
 * Font, weight, slant, case, alignment, backdrop or letter spacing of a text layer; the color
 * goes through `setLayerColor`.
 */
export function setTextStyle(
  template: Template,
  id: string,
  patch: Partial<Omit<TextStyle, 'color' | 'shadow'>>,
): Template {
  return editLayer(template, id, TEXT_KINDS, 'text style', (layer) => {
    // Without them a text is upright, has no backdrop and normal spacing: choosing that changes
    // nothing.
    const current = {
      ...layer.style,
      italic: layer.style.italic ?? false,
      backdrop: layer.style.backdrop ?? 'none',
      letterSpacing: layer.style.letterSpacing ?? 'normal',
    };
    return unchanged(current, patch) ? layer : { ...layer, style: { ...layer.style, ...patch } };
  });
}

/**
 * Whether a metric shows its name above the value and its unit after it. How its value reads (a
 * pace's marks, a time's notation) is chosen in the gallery.
 */
export function setDataLabels(
  template: Template,
  id: string,
  patch: Partial<Pick<LayerOf<'metric'>, 'showLabel' | 'showUnit'>>,
): Template {
  return editLayer(template, id, DATA_KINDS, 'data labels', (layer) =>
    unchanged(layer, patch) ? layer : { ...layer, ...patch },
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

/** What a chart's texts look like. */
type ChartLooks = Pick<ChartLayer, 'font' | 'bold' | 'italic' | 'uppercase' | 'align'>;

/**
 * How a chart's texts are written (font, bold, italic, capitals, where its header sits). What it measures
 * and draws (its header, bar size, average line, zones, each bar's value) is chosen in the
 * gallery.
 */
export function setChartOptions(
  template: Template,
  id: string,
  patch: Partial<ChartLooks>,
): Template {
  return editLayer(template, id, CHART_KINDS, 'chart options', (layer) =>
    // Without it a chart's texts are upright: choosing that changes nothing.
    unchanged({ ...layer, italic: layer.italic ?? false }, patch) ? layer : { ...layer, ...patch },
  );
}

/** Tone of the logo (light, dark or brand colors); its artwork is chosen in the gallery. */
export function setLogoOptions(
  template: Template,
  id: string,
  patch: Partial<Pick<LogoLayer, 'tone'>>,
): Template {
  return editLayer(template, id, ['logo'], 'logo options', (layer) =>
    unchanged(layer, patch) ? layer : { ...layer, ...patch },
  );
}

/** Frames a picture of the user's (see `IMAGE_FRAMES`), or takes its frame away. */
export function setImageFrame(template: Template, id: string, frame: ImageFrame): Template {
  return editLayer(template, id, ['image'], 'frame', (layer) =>
    layer.frame === frame ? layer : { ...layer, frame },
  );
}

/**
 * What a mixed widget's panel sets: its texts' font, weight, slant and case, its logo, and a data
 * widget's backdrop and letter spacing.
 */
export type BlockOptions = Pick<
  BlockLayer['style'],
  'font' | 'bold' | 'italic' | 'uppercase' | 'backdrop' | 'letterSpacing'
> &
  Pick<BlockLayer, 'logo'>;

/**
 * Font, weight, slant and case of a mixed widget's texts, and whether it signs with the AllRun name.
 * Its design and version are chosen in the gallery; its color goes through `setLayerColor`.
 */
export function setBlockOptions(
  template: Template,
  id: string,
  patch: Partial<BlockOptions>,
): Template {
  return editLayer(template, id, BLOCK_KINDS, 'block options', (layer) => {
    const { logo, ...style } = patch;
    const current = {
      ...layer.style,
      italic: layer.style.italic ?? false,
      backdrop: layer.style.backdrop ?? 'none',
      letterSpacing: layer.style.letterSpacing ?? 'normal',
      logo: layer.logo,
    };
    if (unchanged(current, patch)) {
      return layer;
    }
    return { ...layer, logo: logo ?? layer.logo, style: { ...layer.style, ...style } };
  });
}

/** Whether a period's chart writes the day, date or month under each bar. */
export function setAxisLabels(template: Template, id: string, axisLabels: boolean): Template {
  return editLayer(template, id, ['summaryChart'], 'axis labels', (layer) =>
    layer.axisLabels === axisLabels ? layer : { ...layer, axisLabels },
  );
}
