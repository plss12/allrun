import type { Activity } from './activity';
import type { PeriodSummary } from './summary';
import type { FontId, Layer } from './template';

/**
 * Building blocks shared by the compositions in `default-layout.ts` and the starter templates:
 * slots on the canvas, text styles and the AllRun watermark.
 */

/** What a composition is laid out for: one activity, or a period summary. */
export type TemplateData =
  | { readonly mode: 'activity'; readonly activity: Activity }
  | { readonly mode: 'summary'; readonly summary: PeriodSummary };

export const WHITE = '#FFFFFF';

export type TextStyle = Extract<Layer, { kind: 'text' }>['style'];

/** A white, centered, shadowed text style in `font`, with any field overridden. */
export const textStyle = (font: FontId, overrides: Partial<TextStyle> = {}): TextStyle => ({
  font,
  color: WHITE,
  bold: false,
  uppercase: false,
  align: 'center',
  shadow: true,
  ...overrides,
});

/** Where an element goes: its center (0..1 of the canvas) and its scale. */
export interface Slot {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export const slot = (x: number, y: number, scale: number): Slot => ({ x, y, scale });

/** The transform of a layer in `slot`, unrotated. */
export const at = ({ x, y, scale }: Slot) => ({ x, y, scale, rotation: 0 });

/**
 * A layer's `maxWidth` for it to be at most `width` wide on the canvas: `maxWidth` applies before
 * the layer's scale. Capped at the whole canvas, the most the schema allows.
 */
export const fitWidth = (width: number, scale: number): number => Math.min(1, width / scale);

/**
 * `count` slots spread across `from`..`to` at height `y`, each in the middle of an equal column,
 * and the `maxWidth` that keeps each widget narrower than its column: a long value ("4362,23 KM")
 * shrinks to that width instead of running into its neighbours or off the canvas.
 */
export function row(
  count: number,
  { y, from, to, scale }: { y: number; from: number; to: number; scale: number },
): { readonly maxWidth: number; readonly slots: readonly Slot[] } {
  const column = (to - from) / count;
  return {
    maxWidth: fitWidth(column * 0.88, scale),
    slots: Array.from({ length: count }, (_, i) => slot(from + column * (i + 0.5), y, scale)),
  };
}

/** The AllRun watermark in `where`: white, the name alone (what people can search for). */
export const logoLayer = (where: Slot, opacity = 0.95): Layer => ({
  id: 'logo',
  kind: 'logo',
  brand: 'allrun',
  tone: 'light',
  variant: 'wordmark',
  transform: at(where),
  opacity,
});
