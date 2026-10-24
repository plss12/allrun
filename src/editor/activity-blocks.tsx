import {
  Circle,
  FontWeight,
  Group,
  Line,
  LinearGradient,
  Paint,
  Paragraph,
  Path,
  Rect,
  RoundedRect,
  Skia,
  type SkParagraph,
  type SkPath,
  type SkTypefaceFontProvider,
  TextAlign,
} from '@shopify/react-native-skia';
import type { ReactElement } from 'react';

import {
  blockDataCount,
  blockMetrics,
  dataWidgetMetrics,
  fastestIndex,
  isAppReplica,
  isDataWidget,
  sentencePlan,
  sportIcon,
  type SportIconId,
  type TyreCompound,
  tyreCompounds,
} from '@/core/activity-block';
import { splitRows } from '@/core/activity-charts';
import { castsShadow, contrastingInk } from '@/core/layer-style';
import { metricValue, type MetricId } from '@/core/metrics';
import { formatPlace } from '@/core/place';
import { decodePolyline } from '@/core/polyline';
import { DEFAULT_PRIVACY_TRIM_METERS, trimRouteEnds } from '@/core/route-privacy';
import { type Point, projectRoutes } from '@/core/route-projection';
import type { HitHole } from '@/core/layer-transform';
import type { Size } from '@/core/photo-framing';
import type { APP_MODES, BRAND_COVERS, FontId, LAPS_LAYOUTS, Layer } from '@/core/template';
import { durationParts } from '@/core/units';
import { formatActivityDate, formatShortWeekday, formatTimeAfter } from '@/ui/format';

import { markWidth, PlainMark, PlainWordmark, wordmarkHeight } from './brand/brand-art';
import {
  type ActivityData,
  type LabelKey,
  metricText,
  plainMetricParts,
  plainMetricText,
  speedMeasure,
  splitGapText,
  splitRowTexts,
  type TextContext,
} from './editor-data';
import { CAP_HEIGHTS, drawsBold, fontFamiliesOf, lettersExtent } from './fonts';
import { APP_ICON_PATHS, SPORT_ICON_PATHS, SPORT_ICON_SIZE } from './icons/sport-icons.generated';
import {
  addLeanRoom,
  DropShadow,
  LETTER_SPACING,
  leanRoom,
  slantOf,
  softBackdrop,
  textShadows,
} from './scene-text';

/**
 * The mixed widgets of an activity (ADR 009): several of its data in one designed block, laid out
 * from measured texts. Each design is a composition of boxes (texts, columns, rows, rules, the
 * sport's icon), measured first and then placed, so a block is exactly as big as what it holds in
 * any font. Its content is centered on (0, 0), like every layer's.
 */

type BlockLayer = Extract<Layer, { kind: 'activityBlock' }>;
export type BlockStyle = BlockLayer['style'];

/** What a block needs besides its activity: fonts, how to write data, and translations. */
export interface BlockContext {
  readonly fonts: SkTypefaceFontProvider;
  readonly textContext: TextContext;
  /** Translates a label; `values` fill its placeholders ("{{unit}}"). */
  readonly translate: (key: LabelKey, values?: Readonly<Record<string, string>>) => string;
  /** Size of the canvas, which the camera frames whole. */
  readonly canvas: Size;
}

/**
 * A block laid out: its size before the layer's scale, in canvas pixels, and its drawing; and
 * the see-through part a touch goes through (the camera's view of the photo), if any.
 */
export interface PreparedBlock {
  readonly width: number;
  readonly height: number;
  readonly content: ReactElement;
  readonly hole?: HitHole;
}

/** Something drawn in a block, at its place in the block (top-left origin). */
type Piece =
  | {
      readonly kind: 'text';
      readonly paragraph: SkParagraph;
      readonly x: number;
      readonly y: number;
      /** Drawn this many times taller than it is laid out (see `STRETCHED_FONTS`). */
      readonly stretch?: number;
      /** Drawn this many times its laid-out size: a small text laid out large (see `scaledBox`). */
      readonly scale?: number;
      /** Casts the shadow of shapes once stretched, laid out without its own (see `capitals`). */
      readonly shadow?: true;
      /**
       * Drawn turned a quarter counterclockwise (see `turned`): placed at (x, y) in a frame
       * `length` long whose top-left corner, once turned, is at (`turn.x`, `turn.y`).
       */
      readonly turn?: { readonly x: number; readonly y: number; readonly length: number };
    }
  | {
      /** A replica's card or bubble, in its app's color. */
      readonly kind: 'panel';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly radius: number;
      readonly color: string;
      /**
       * Part of a see-through view, as the phone's glass: drawn in its turn among the app's
       * marks, without a shadow (it would darken it from inside), and its `edge` in a color.
       */
      readonly flat?: true;
      readonly edge?: string;
    }
  | {
      /**
       * A replica's colors fading from top to bottom over a rectangle, kept within the rounded
       * card it lies on (`card`): the light on a timing tower's header, the shadow under it.
       */
      readonly kind: 'shade';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly colors: readonly [string, string];
      readonly card: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly radius: number;
      };
    }
  | {
      /**
       * A sheet of paper that lifts off the photo with a shadow: a receipt, torn in teeth at its
       * top and bottom (`receipt`), or a boarding pass, its corners rounded and notched on both
       * sides where its stub tears off, `cut` down from its top (`pass`).
       */
      readonly kind: 'paper';
      readonly shape: 'receipt' | 'pass';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly color: string;
      readonly cut?: number;
    }
  | {
      /** The grain of a sheet of paper over a rectangle: specks of `color`, the same every time. */
      readonly kind: 'grain';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly color: string;
    }
  | {
      /** A marker's strokes behind words, one rectangle per stretch of a line. */
      readonly kind: 'highlight';
      readonly rects: readonly {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      }[];
      readonly color: string;
    }
  | {
      /** A replica's thin line in its own color, without a shadow: the camera's grid. */
      readonly kind: 'hairline';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly width: number;
      readonly color: string;
    }
  | {
      /** The tail of a sent chat message, out of its bubble's top right corner. */
      readonly kind: 'messageTail';
      readonly x: number;
      readonly y: number;
      readonly color: string;
    }
  | {
      /** An app's mark drawn with lines: the back chevron, or the read ticks. */
      readonly kind: 'chevron' | 'ticks';
      readonly x: number;
      readonly y: number;
      readonly size: number;
      readonly color: string;
    }
  | {
      readonly kind: 'icon';
      readonly icon: IconId;
      readonly x: number;
      readonly y: number;
      readonly size: number;
      /** A replica's own color for it; the block's when absent. */
      readonly color?: string;
    }
  | {
      /** A control of an app drawn as a filled glyph (see `symbolArt`), `size` square. */
      readonly kind: 'symbol';
      readonly symbol: AppSymbol;
      readonly x: number;
      readonly y: number;
      readonly size: number;
      readonly color: string;
    }
  | {
      /** A replica's round button: filled, or a ring `stroke` wide. */
      readonly kind: 'disc';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly color: string;
      readonly stroke?: number;
    }
  | {
      readonly kind: 'logo';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      /** A replica's own color for it; the block's when absent. */
      readonly color?: string;
    }
  | {
      /** AllRun's monogram, in a replica's own color. */
      readonly kind: 'mark';
      readonly x: number;
      readonly y: number;
      readonly height: number;
      readonly color: string;
    }
  | {
      readonly kind: 'route';
      readonly points: readonly Point[];
      /** A replica's own color and width for it; the block's color and `ROUTE_STROKE` when absent. */
      readonly color?: string;
      readonly width?: number;
    };

/** The controls of the apps a replica recreates. */
type AppSymbol =
  | 'backward'
  | 'pause'
  | 'forward'
  | 'airplay'
  | 'waveform'
  | 'flip'
  | 'pin'
  | 'stopwatch'
  | 'badge'
  | 'check';

/** A measured part of a block, which places its pieces with its top-left corner at (x, y). */
export interface Box {
  readonly width: number;
  readonly height: number;
  readonly place: (x: number, y: number) => Piece[];
}

type Align = 'start' | 'center' | 'end';

/** Where a `size` long box starts within `span` when aligned. */
const offset = (align: Align, size: number, span: number): number =>
  align === 'start' ? 0 : align === 'end' ? span - size : (span - size) / 2;

/** Boxes one under another, `gap` apart, aligned across. */
export function column(boxes: readonly Box[], gap: number, align: Align): Box {
  const width = Math.max(0, ...boxes.map((box) => box.width));
  const height =
    boxes.reduce((sum, box) => sum + box.height, 0) + gap * Math.max(0, boxes.length - 1);
  return {
    width,
    height,
    place: (x, y) => {
      let top = y;
      return boxes.flatMap((box) => {
        const pieces = box.place(x + offset(align, box.width, width), top);
        top += box.height + gap;
        return pieces;
      });
    },
  };
}

/**
 * A box of texts turned a quarter counterclockwise, read upwards: what was its start is at its
 * bottom, and its first line at its left.
 */
export function turned(box: Box): Box {
  return {
    width: box.height,
    height: box.width,
    place: (x, y) =>
      box.place(0, 0).map((piece) => {
        if (piece.kind !== 'text') {
          throw new Error(`Only texts turn, not a ${piece.kind}`);
        }
        return { ...piece, turn: { x, y, length: box.width } };
      }),
  };
}

/** How many times larger than drawn a small text is laid out (see `scaledBox`). */
const LAYOUT_SCALE = 4;

/**
 * A box of texts laid out {@link LAYOUT_SCALE} times larger than drawn, `build` laying it out
 * that many times its size: the phone rounds small type's metrics and advances to whole units,
 * which moves a text a few units big off where it is measured (a day's number off the center of
 * its mark); laid out large, the rounding is too small to see.
 */
export function scaledBox(build: (scale: number) => Box): Box {
  const box = build(LAYOUT_SCALE);
  return {
    width: box.width / LAYOUT_SCALE,
    height: box.height / LAYOUT_SCALE,
    place: (x, y) =>
      box.place(0, 0).map((piece) => {
        if (piece.kind !== 'text') {
          throw new Error(`Only texts scale, not a ${piece.kind}`);
        }
        return {
          ...piece,
          x: x + piece.x / LAYOUT_SCALE,
          y: y + piece.y / LAYOUT_SCALE,
          scale: (piece.scale ?? 1) / LAYOUT_SCALE,
        };
      }),
  };
}

/** Boxes side by side, `gap` apart, aligned up and down. */
export function row(boxes: readonly Box[], gap: number, align: Align): Box {
  const width =
    boxes.reduce((sum, box) => sum + box.width, 0) + gap * Math.max(0, boxes.length - 1);
  const height = Math.max(0, ...boxes.map((box) => box.height));
  return {
    width,
    height,
    place: (x, y) => {
      let left = x;
      return boxes.flatMap((box) => {
        const pieces = box.place(left, y + offset(align, box.height, height));
        left += box.width + gap;
        return pieces;
      });
    },
  };
}

/** A box widened to `width`, its content aligned within it. */
export function widened(box: Box, width: number, align: Align): Box {
  const span = Math.max(width, box.width);
  return {
    width: span,
    height: box.height,
    place: (x, y) => box.place(x + offset(align, box.width, span), y),
  };
}

/** `left` at the start and `right` at the end of a `width` wide line, bottoms lined up. */
export function spread(left: Box, right: Box, width: number): Box {
  const span = Math.max(width, left.width + right.width);
  const height = Math.max(left.height, right.height);
  return {
    width: span,
    height,
    place: (x, y) => [
      ...left.place(x, y + height - left.height),
      ...right.place(x + span - right.width, y + height - right.height),
    ],
  };
}

/**
 * Boxes along a `width` long line, bottoms lined up: the first at its start, the last at its end
 * and the rest evenly between them, at least `minGap` apart (one alone is centered).
 */
export function justified(boxes: readonly Box[], width: number, minGap: number): Box {
  if (boxes.length === 1) {
    return widened(boxes[0], width, 'center');
  }
  const used = boxes.reduce((sum, box) => sum + box.width, 0);
  const span = Math.max(width, used + minGap * (boxes.length - 1));
  const gap = (span - used) / (boxes.length - 1);
  const height = Math.max(0, ...boxes.map((box) => box.height));
  return {
    width: span,
    height,
    place: (x, y) => {
      let left = x;
      return boxes.flatMap((box) => {
        const pieces = box.place(left, y + height - box.height);
        left += box.width + gap;
        return pieces;
      });
    },
  };
}

/**
 * A `width` × `height` box with each of `parts` at its own place in it (top-left corners), for
 * a replica that copies where an app puts each thing.
 */
export function placed(
  width: number,
  height: number,
  parts: readonly { readonly box: Box; readonly x: number; readonly y: number }[],
): Box {
  return {
    width,
    height,
    place: (x, y) => parts.flatMap((part) => part.box.place(x + part.x, y + part.y)),
  };
}

/** `front` centered over `back`, as big as the bigger of them. */
export function overlay(back: Box, front: Box): Box {
  const width = Math.max(back.width, front.width);
  const height = Math.max(back.height, front.height);
  return {
    width,
    height,
    place: (x, y) => [
      ...back.place(x + (width - back.width) / 2, y + (height - back.height) / 2),
      ...front.place(x + (width - front.width) / 2, y + (height - front.height) / 2),
    ],
  };
}

/** Width of each column of a table: its widest cell. */
const columnWidths = (cells: readonly (readonly Box[])[]): number[] =>
  cells[0].map((_, i) => Math.max(...cells.map((line) => line[i].width)));

/** Width of a table of `widths` columns, `gap` apart and `pad` inside its edges. */
const tableWidth = (widths: readonly number[], gap: number, pad: number): number =>
  widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1) + 2 * pad;

/** A row of a table, `height` tall: each box at the start of its column, centered up and down. */
function tableRow(
  boxes: readonly Box[],
  widths: readonly number[],
  gap: number,
  pad: number,
  height: number,
): Box {
  let left = pad;
  return placed(
    tableWidth(widths, gap, pad),
    height,
    boxes.map((box, i) => {
      const x = left;
      left += widths[i] + gap;
      return { box, x, y: (height - box.height) / 2 };
    }),
  );
}

/** A sport's icon, or one a replica of an app draws (a streak's flame). */
export type IconId = SportIconId | keyof typeof APP_ICON_PATHS;

/** Every icon's path, the sports' and the replicas'. */
const ICON_PATHS: Readonly<Record<IconId, string>> = { ...SPORT_ICON_PATHS, ...APP_ICON_PATHS };

export const iconBox = (icon: IconId, size: number, color?: string): Box => ({
  width: size,
  height: size,
  place: (x, y) => [{ kind: 'icon', icon, x, y, size, ...(color === undefined ? {} : { color }) }],
});

/**
 * What a summary's widget shows of its sport: one sport's icon `size` big, or, for a summary of
 * every sport (`allrun`), AllRun's monogram, a little lower so it weighs about as much.
 */
export type SportMark = SportIconId | 'allrun';

/** AllRun's monogram's height, a share of a sport's icon's size: about as heavy. */
const SPORT_MARK_HEIGHT = 0.62;

/** A sport's icon, or AllRun's monogram (see `SportMark`), in `color`. */
export const sportMarkBox = (mark: SportMark, size: number, color: string): Box =>
  mark === 'allrun' ? markBrandBox(size * SPORT_MARK_HEIGHT, color) : iconBox(mark, size, color);

/** AllRun's monogram `height` tall, in a replica's own `color`. */
export const markBrandBox = (height: number, color: string): Box => ({
  width: markWidth(height),
  height,
  place: (x, y) => [{ kind: 'mark', x, y, height, color }],
});

/** AllRun's name `width` wide, in the block's color or a replica's own `color`. */
export const logoBox = (width: number, color?: string): Box => ({
  width,
  height: wordmarkHeight(width),
  place: (x, y) => [{ kind: 'logo', x, y, width, ...(color === undefined ? {} : { color }) }],
});

/** Width of a block's route, before the layer's scale. */
const ROUTE_STROKE = 8;

/**
 * The route of `polyline` (its private ends trimmed) as big as fits a `width` × `height` box,
 * shrunk to its own extent plus the stroke, or `null` when nothing is left to draw. A replica
 * draws it in a `look` of its own: a color and a line width.
 */
export function routeBox(
  polyline: string,
  width: number,
  height: number,
  look?: { readonly color?: string; readonly width: number },
): Box | null {
  const stroke = look?.width ?? ROUTE_STROKE;
  const [points] = projectRoutes(
    [trimRouteEnds(decodePolyline(polyline), DEFAULT_PRIVACY_TRIM_METERS)],
    width,
    height,
  );
  if (points.length < 2) {
    return null;
  }
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const spanX = Math.max(...points.map((point) => point.x)) - minX;
  const spanY = Math.max(...points.map((point) => point.y)) - minY;
  return {
    width: spanX + stroke,
    height: spanY + stroke,
    place: (x, y) => [
      {
        kind: 'route',
        points: points.map((point) => ({
          x: x + stroke / 2 + point.x - minX,
          y: y + stroke / 2 + point.y - minY,
        })),
        ...look,
      },
    ],
  };
}

/** A filled glyph of an app's control, `size` square. */
export const symbolBox = (symbol: AppSymbol, size: number, color: string): Box => ({
  width: size,
  height: size,
  place: (x, y) => [{ kind: 'symbol', symbol, x, y, size, color }],
});

/** A round button `r` in radius: filled, or a ring `stroke` wide. */
export const discBox = (r: number, color: string, stroke?: number): Box => ({
  width: 2 * r,
  height: 2 * r,
  place: (x, y) => [
    { kind: 'disc', cx: x + r, cy: y + r, r, color, ...(stroke === undefined ? {} : { stroke }) },
  ],
});

/** How a see-through replica draws a rectangle: flat, with an edge or without (see `Piece`). */
interface Glass {
  readonly edge?: string;
}

/**
 * A replica's rounded rectangle of `color`, with nothing in it; part of a see-through view when
 * it is of `glass`.
 */
export const fillBox = (
  width: number,
  height: number,
  radius: number,
  color: string,
  glass?: Glass,
): Box => ({
  width,
  height,
  place: (x, y) => [
    {
      kind: 'panel',
      x,
      y,
      width,
      height,
      radius,
      color,
      ...(glass === undefined ? {} : { flat: true, ...glass }),
    },
  ],
});

/** `box` with its center at (`cx`, `cy`) of a `placed` box. */
const centeredAt = (box: Box, cx: number, cy: number) => ({
  box,
  x: cx - box.width / 2,
  y: cy - box.height / 2,
});

/** Width of a glass card's edge. */
const GLASS_EDGE = 2;

/** A replica's thin line from (0, 0) to (`dx`, `dy`) of where it is placed. */
export const hairlineBox = (dx: number, dy: number, width: number, color: string): Box => ({
  width: dx,
  height: dy,
  place: (x, y) => [{ kind: 'hairline', x1: x, y1: y, x2: x + dx, y2: y + dy, width, color }],
});

/** A replica's dashed line `width` long, `dash` long dashes `gap` apart, `thick` thick. */
function dashedBox(width: number, dash: number, gap: number, thick: number, color: string): Box {
  const count = Math.max(1, Math.floor((width + gap) / (dash + gap)));
  // Spread so that the line starts and ends with a whole dash.
  const step = count === 1 ? 0 : (width - dash) / (count - 1);
  return placed(
    width,
    thick,
    Array.from({ length: count }, (_, i) => ({
      box: hairlineBox(dash, 0, thick, color),
      x: i * step,
      y: thick / 2,
    })),
  );
}

/**
 * Pseudo-random numbers in [0, 1) from `seed`, the same for the same seed (a linear congruential
 * generator, Numerical Recipes' constants): a receipt's barcode and the paper's grain look alike
 * every time they are drawn.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

/** A number from a text, to seed a barcode: the same text, the same bars. Time O(n). */
const seedOf = (text: string): number =>
  [...text].reduce(
    (hash, char) => Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16_777_619),
    2_166_136_261,
  );

/**
 * A barcode `width` × `height` of `color`: bars and gaps of one to four units, from `seed`, with
 * a bar at each end.
 */
function barcodeBox(width: number, height: number, seed: number, color: string): Box {
  const random = seededRandom(seed);
  const unit = width / 120;
  const bars: { x: number; width: number }[] = [];
  let x = 0;
  while (x < width - 4 * unit) {
    const bar = (1 + Math.floor(random() * 4)) * unit;
    bars.push({ x, width: bar });
    x += bar + (1 + Math.floor(random() * 3)) * unit;
  }
  bars.push({ x: width - 2 * unit, width: 2 * unit });
  return placed(
    width,
    height,
    bars.map((bar) => ({ box: fillBox(bar.width, height, 0, color, {}), x: bar.x, y: 0 })),
  );
}

export const textBox = (paragraph: SkParagraph): Box => ({
  width: Math.ceil(paragraph.getLongestLine()) + 1,
  height: paragraph.getHeight(),
  place: (x, y) => [{ kind: 'text', paragraph, x, y }],
});

/**
 * A text of several lines, `fontSize` big, with room at the right for its letters to lean out of
 * any line when `italic`.
 */
const wrappedBox = (laidOut: SkParagraph, fontSize: number, italic: boolean | undefined): Box => {
  const box = textBox(laidOut);
  return italic === true ? { ...box, width: box.width + leanRoom(fontSize) } : box;
};

/** Runs on one line in the block's lettering, drawn taller in a stretched font. */
function styledTextBox(
  fonts: SkTypefaceFontProvider,
  runs: readonly Run[],
  style: BlockStyle,
): Box {
  const laidOut = paragraph(runs, fonts, style);
  const box = textBox(laidOut);
  const stretch = STRETCHED_FONTS[style.font] ?? 1;
  return stretch === 1
    ? box
    : {
        width: box.width,
        height: box.height * stretch,
        place: (x, y) => [{ kind: 'text', paragraph: laidOut, x, y, stretch }],
      };
}

/**
 * Words in quotation marks in the block's lettering, wrapped in even lines (at most
 * `SIZES.quotation.lines`, shrunk until they fit), and who said them or where, under them: a
 * quote's or a verse's, of an activity or a period alike. Time O(s log w) layouts for the s sizes
 * tried, each balanced in O(log w).
 */
export function quotationBox(
  fonts: SkTypefaceFontProvider,
  style: BlockStyle,
  translate: BlockContext['translate'],
  words: string,
  source: string,
): Box {
  const sizes = SIZES.quotation;
  const laidOut = (size: number) =>
    paragraph(
      [{ text: translate('widgets.quoted', { text: words }), size, bold: style.bold }],
      fonts,
      style,
      { wrapWidth: sizes.width },
    );
  let size: number = sizes.text;
  let fitted = laidOut(size);
  while (fitted.getLineMetrics().length > sizes.lines && size > sizes.minText) {
    size = Math.max(sizes.minText, size * 0.92);
    fitted = laidOut(size);
  }
  return column(
    [
      wrappedBox(fitted, size, style.italic),
      styledTextBox(
        fonts,
        [{ text: source, size: sizes.source, bold: false, faded: true, spacing: LABEL_SPACING }],
        style,
      ),
    ],
    sizes.source * 0.6,
    'center',
  );
}

/** `box` on a replica's card of `color`, `padX` and `padY` inside its edges. */
export const panel = (box: Box, color: string, padX: number, padY: number, radius: number): Box => {
  const width = box.width + 2 * padX;
  const height = box.height + 2 * padY;
  return {
    width,
    height,
    place: (x, y) => [
      { kind: 'panel', x, y, width, height, radius, color },
      ...box.place(x + padX, y + padY),
    ],
  };
};

/** Room inside a sent message's bubble, its corners' radius and its tail's size. */
const MESSAGE_PAD_X = 30;
const MESSAGE_PAD_Y = 18;
const MESSAGE_RADIUS = 30;
const MESSAGE_TAIL = 18;

/** `box` in a sent message's bubble of `color`, its tail out of the top right corner. */
const messageBubble = (box: Box, color: string): Box => {
  const bubble = panel(box, color, MESSAGE_PAD_X, MESSAGE_PAD_Y, MESSAGE_RADIUS);
  return {
    width: bubble.width + MESSAGE_TAIL,
    height: bubble.height,
    place: (x, y) => [
      { kind: 'messageTail', x: x + bubble.width, y, color },
      ...bubble.place(x, y),
    ],
  };
};

/** A mark drawn with lines, `size` tall (the ticks are wider). */
export const markBox = (kind: 'chevron' | 'ticks', size: number, color: string): Box => ({
  width: kind === 'ticks' ? size * 1.4 : size * 0.6,
  height: size,
  place: (x, y) => [{ kind, x, y, size, color }],
});

/** One stretch of a text with its own size and weight. */
export interface Run {
  readonly text: string;
  readonly size: number;
  readonly bold: boolean;
  /** Written in the font's light face (see `FontFaces`): a replica's thin text. */
  readonly light?: boolean;
  /** Written fainter: names of data and other secondary texts. */
  readonly faded?: boolean;
  /** Room after each letter, as a fraction of the size. */
  readonly spacing?: number;
}

/** How opaque faded texts and rules are. */
export const FADED_ALPHA = 0.72;
/** A layout width no text reaches: lines only break where the text does. */
const NO_WRAP_WIDTH = 1_000_000;

/** A replica's own font and slant, when not the apps' upright system-like one. */
export interface AppLettering {
  readonly font?: FontId;
  readonly italic?: boolean;
}

/** How a text is laid out besides its runs and style (see `paragraph`). */
export interface TextLook {
  /** With the drop shadow of its color (a text on a bubble needs none). */
  readonly shadow?: boolean;
  /** Longest a line is: longer ones are cut short with an ellipsis, as apps cut a long title. */
  readonly maxWidth?: number;
  /**
   * Broken into centered lines no longer than this, as even as they can be, instead of one line.
   */
  readonly wrapWidth?: number;
  /** Lines of a wrapped text aligned to their start instead (a chat message, a sentence). */
  readonly wrapStart?: boolean;
  /** To be drawn turned (see `turned`): its shadow falls down the canvas, not down its lines. */
  readonly turned?: boolean;
}

/**
 * A replica's text in `color`: in the system-like font of the apps unless its `font` is another
 * (a timing sheet's typewriter), upright unless `italic`, and without a shadow unless `look` asks
 * for one (see `TextLook`).
 */
export function appTextBox(
  fonts: SkTypefaceFontProvider,
  runs: readonly Run[],
  color: string,
  { font = 'inter', italic = false, ...look }: TextLook & AppLettering = {},
): Box {
  return textBox(
    paragraph(
      runs,
      fonts,
      { font, color, bold: false, uppercase: false, italic },
      {
        shadow: false,
        ...look,
      },
    ),
  );
}

/**
 * Lays out runs in the block's font and color, on one line unless it is to wrap, shrunk to fit
 * them (see `TextLook`).
 */
export function paragraph(
  runs: readonly Run[],
  fonts: SkTypefaceFontProvider,
  style: BlockStyle,
  {
    shadow = true,
    maxWidth = NO_WRAP_WIDTH,
    wrapWidth,
    wrapStart = false,
    turned = false,
  }: TextLook = {},
) {
  const tightening =
    (TIGHT_FONTS[style.font] ?? 0) + LETTER_SPACING[style.letterSpacing ?? 'normal'];
  // A backdrop already sets the texts apart: no shadow.
  const shadows = (
    shadow && (style.backdrop ?? 'none') === 'none' ? textShadows(style.color) : []
  ).map((cast) =>
    // Turned a quarter counterclockwise, the text's left is the canvas's down.
    turned && cast.offset !== undefined
      ? { ...cast, offset: { x: -cast.offset.y, y: cast.offset.x } }
      : cast,
  );
  /** Laid out cut short with an ellipsis (`cut`), or with each word on a line of its own. */
  const build = (cut: boolean, wordPerLine = false) => {
    const builder = Skia.ParagraphBuilder.Make(
      cut
        ? { textAlign: TextAlign.Left, maxLines: 1, ellipsis: '…' }
        : {
            textAlign: wrapWidth === undefined || wrapStart ? TextAlign.Left : TextAlign.Center,
          },
      fonts,
    );
    for (const run of runs) {
      const color = Skia.Color(style.color);
      if (run.faded === true) {
        color[3] *= FADED_ALPHA;
      }
      builder
        .pushStyle({
          color,
          fontFamilies: fontFamiliesOf(style.font),
          fontSize: run.size,
          fontStyle: {
            weight:
              run.light === true
                ? FontWeight.ExtraLight
                : drawsBold(style.font, run.bold)
                  ? FontWeight.Bold
                  : FontWeight.Normal,
            slant: slantOf(style.italic),
          },
          letterSpacing: run.size * ((run.spacing ?? 0) + tightening),
          shadows,
        })
        .addText(
          (style.uppercase ? run.text.toLocaleUpperCase() : run.text).replace(
            / /gu,
            wordPerLine ? '\n' : ' ',
          ),
        )
        .pop();
    }
    // A wrapped text leans out of each of its lines: `wrappedBox` makes room for all of them.
    if (style.italic === true && runs.length > 0 && wrapWidth === undefined) {
      addLeanRoom(builder, runs[runs.length - 1].size);
    }
    return builder.build();
  };
  const built = build(false);
  if (wrapWidth !== undefined) {
    // The narrowest width that keeps as few lines as the widest allowed: even lines, no word left
    // alone on the last one. Never narrower than the widest word (words tied with no-break spaces
    // are one), which would break inside it. Halved down to a pixel, O(log w) layouts.
    const words = build(false, true);
    words.layout(NO_WRAP_WIDTH);
    const widestWord = Math.ceil(words.getLongestLine()) + 1;
    built.layout(Math.max(wrapWidth, widestWord));
    const lines = built.getLineMetrics().length;
    let low = widestWord;
    let high = Math.max(widestWord, Math.ceil(built.getLongestLine()) + 1);
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      built.layout(middle);
      if (built.getLineMetrics().length > lines) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    built.layout(high);
    built.layout(Math.ceil(built.getLongestLine()) + 1);
    return built;
  }
  built.layout(NO_WRAP_WIDTH);
  if (built.getLongestLine() > maxWidth) {
    const cut = build(true);
    cut.layout(maxWidth);
    cut.layout(Math.ceil(cut.getLongestLine()) + 1);
    return cut;
  }
  built.layout(Math.ceil(built.getLongestLine()) + 1);
  return built;
}

/**
 * `runs` at `size` cut to their letters: from the top of their capitals, or of their small
 * letters when they have any, to `below` under the baseline (room for a comma's tail, or for
 * what goes under them), and as far again as their small letters go down (see
 * `lettersExtent`), so what goes over or under them sits as close as it looks. Over an accented
 * capital ("MIÉRCOLES"), the line keeps its own room above. Drawn `taller` times taller than
 * the font (squashed when less than one), in the block's lettering or in another `lettering`,
 * laid out with `look`. Texts side by side on one baseline are cut as one, all their letters
 * in `shared`.
 */
export function capitalsBox(
  fonts: SkTypefaceFontProvider,
  runs: readonly Run[],
  size: number,
  below: number,
  taller: number,
  lettering: BlockStyle,
  look: TextLook = {},
  shared?: string,
): Box {
  const stretch = (STRETCHED_FONTS[lettering.font] ?? 1) * taller;
  // A stretched text's own shadow would stretch with it, down past its room: it casts the
  // shadow of shapes once stretched instead, as long as it would have one.
  const shadow =
    stretch !== 1 &&
    (look.shadow ?? true) &&
    (lettering.backdrop ?? 'none') === 'none' &&
    castsShadow(lettering.color);
  const laidOut = paragraph(
    runs,
    fonts,
    lettering,
    stretch === 1 ? look : { ...look, shadow: false },
  );
  const baseline = laidOut.getLineMetrics()[0]?.baseline ?? laidOut.getHeight();
  const written = shared ?? runs.map((run) => run.text).join('');
  const extent = lettersExtent(
    lettering.uppercase ? written.toLocaleUpperCase() : written,
    lettering.font,
  );
  const top = extent.top === null ? 0 : baseline - extent.top * size;
  // What the letters draw under the baseline stretches with them: their descenders, and the
  // dip of round letters ("C", "O"), which only shows once stretched. The room asked for under
  // them stays as it is.
  const under = (extent.descent * stretch + ROUND_DIP * (stretch - 1)) * size;
  return {
    width: textBox(laidOut).width,
    height: (baseline - top) * stretch + under + below,
    place: (x, y) => [
      {
        kind: 'text',
        paragraph: laidOut,
        x,
        y: y - top * stretch,
        ...(stretch === 1 ? {} : { stretch }),
        ...(shadow ? { shadow } : {}),
      },
    ],
  };
}

/**
 * Fonts set tighter in mixed widgets, as a share of their size taken from the room after each
 * letter, and drawn taller than they are, as AURA's "WED": Bowlby One SC is heavy but low and
 * wide, so its letters go close together, almost touching, and stand taller.
 */
const TIGHT_FONTS: Partial<Record<FontId, number>> = { bowlbyOneSC: -0.06 };
const STRETCHED_FONTS: Partial<Record<FontId, number>> = { bowlbyOneSC: 1.35 };

/** How far round letters ("C", "O") dip under the baseline, at most, as a share of their size. */
const ROUND_DIP = 0.02;

/** Room after each letter of a secondary text (a quotation's source). */
const LABEL_SPACING = 0.1;

/**
 * Base sizes of each design's texts, in canvas pixels before the layer's scale, chosen for a
 * story (other formats scale the whole block, see `newLayer`).
 */
const SIZES = {
  /**
   * A big datum (`value`) and the data under it (`data`), in each look: as tall as AURA's, their
   * capitals about a fifth or a quarter of the big one's.
   */
  big: {
    wide: { value: 120, data: 38, stretch: 1 },
    day: { value: 120, data: 38, stretch: 1 },
    route: { value: 120, data: 38, stretch: 1 },
    // Drawn this many times taller than the font, as AURA stretches its big "11.3 KM".
    stretched: { value: 180, data: 56, stretch: 1.9 },
    stretchedDay: { value: 180, data: 56, stretch: 1.9 },
    smallDay: { value: 120, data: 38, stretch: 1 },
  },
  /** The weekday and the big datum, as wide, and the room around the route between them. */
  dayRoute: { value: 120, gap: 0.3 },
  /** The data beside the short weekday, and the room between their lines and beside it. */
  dayBetween: { data: 44, rowGap: 0.45, sideGap: 0.7 },
  /** The weekday over its columns, and their lines, in each look. */
  dayOver: { wide: { weekday: 130, data: 30 }, narrow: { weekday: 210, data: 44 } },
  /** The lines of the date and the data, and the room between their columns. */
  dayColumns: { text: 44, gap: 3 },
  /** The stacked data, and the weekday and time under them, a share of their size. */
  dataStack: { value: 110, footer: 0.3 },
  /**
   * A tower's lines: their size, how many times taller than the font they are drawn, the room
   * under each (a share of their capitals' height) and how narrow its sport's word may be squeezed
   * to be no wider than the lines over it. The data on their side: the room between them and
   * beside the word (shares of their capitals' height), and the biggest they get (a share of the
   * lines' size).
   */
  tower: { value: 150, stretch: 1.9, gap: 0.15, squeeze: 0.6, sideGap: 0.5, sideMax: 0.3 },
  /**
   * The data in a line, and the room between them, a share of their size; named, the names'
   * size and the room under them, and the room between data, shares of the data's size too.
   */
  dataLine: { text: 60, gap: 0.7, name: 0.5, nameGap: 0.2, namedGap: 1 },
  /**
   * A card's names of data, their values and its title, the room between a name and its value,
   * between rows and under the title (shares of their sizes), between columns and inside it.
   */
  card: {
    label: 26,
    value: 40,
    title: 64,
    labelGap: 0.35,
    rowGap: 0.6,
    titleGap: 0.5,
    columnGap: 70,
    padX: 44,
    padY: 38,
  },
  /**
   * A quotation's words: at most `lines` lines no wider than `width`, as big as `text` when they
   * fit, smaller (down to `minText`) when they don't, so a long verse is wide rather than tall.
   */
  quotation: { text: 64, minText: 34, width: 900, lines: 3, source: 36 },
  notes: { bar: 34, icon: 40, title: 74, row: 40 },
  message: { text: 50, meta: 26 },
} as const;

/**
 * Room around a data widget on a backdrop, as a share of its height (at least `minPad`), wider
 * at its sides, and the box's corners, as a share of that room: as a text widget's.
 */
const BLOCK_BACKDROP = { padding: 0.16, minPad: 6, wider: 1.6, radius: 1.4 } as const;

/**
 * Room under a big datum's baseline and its data's, for a comma's tail (a share of their size),
 * and least room between two data, a share of theirs: they spread to the big one's width.
 */
const BIG = { below: 0.12, minGap: 0.8 } as const;

/**
 * Over a big datum: the weekday, as wide as it, its room under it a share of the big datum's
 * size; or the route, in a box `routeWidth` and `routeHeight` times the big datum's width, so it
 * doesn't outweigh the data, its room under it a share of the big datum's size too.
 */
const BIG_HEADER = {
  dayGap: 0.08,
  smallDay: 0.34,
  smallDayGap: 0.12,
  routeWidth: 0.8,
  routeHeight: 0.9,
  routeGap: 0.3,
} as const;

/**
 * The date widgets' room: between a header and what goes under it, between lines, between
 * stacked data and least between columns, each a share of its text's size.
 */
const DATE = { headGap: 0.1, lineGap: 0.3, stackGap: 0.12, minGap: 1.2 } as const;

/** The typewriter's letters of the data on their side beside a tower's sport, as a caption. */
const TOWER_SIDE_FONT: FontId = 'spaceMono';

/** Data a card puts in a row. */
const CARD_COLUMNS = 3;

/** The size a text is laid out at to measure it before writing it as wide as something. */
const FIT_SIZE = 100;

/** Most splits a note lists one by one; longer activities group them (km 1–2…). */
const NOTES_ROWS = 16;
/** Room inside a note, its corners' radius and its narrowest width. */
const NOTES_PAD = 40;
const NOTES_RADIUS = 34;
const NOTES_MIN_WIDTH = 520;

/** A note's texts: its bar's ("< AllRun") and icon, its title and its lines. */
export const NOTES_SIZES = SIZES.notes;

/** A sport at the end of a note's bar: its `name` in small letters and its icon, in the accent. */
export function noteSportBox(
  fonts: SkTypefaceFontProvider,
  mode: (typeof APP_MODES)[number],
  name: string,
  icon: SportIconId,
): Box {
  const { accent } = NOTES_COLORS[mode];
  return row(
    [
      appTextBox(
        fonts,
        [{ text: name.toLocaleLowerCase(), size: NOTES_SIZES.bar, bold: false }],
        accent,
      ),
      iconBox(icon, NOTES_SIZES.icon, accent),
    ],
    NOTES_SIZES.bar * 0.3,
    'center',
  );
}

/**
 * A note of the iPhone's Notes in `mode`, in its font and colors: "< AllRun" at the start of its
 * bar and `side`, if any, at its end, over its `title` and its `lines` (`NOTES_SIZES.row` tall).
 */
export function noteBox(
  fonts: SkTypefaceFontProvider,
  mode: (typeof APP_MODES)[number],
  title: string,
  lines: readonly Box[],
  side?: Box,
): Box {
  const colors = NOTES_COLORS[mode];
  const sizes = NOTES_SIZES;
  const heading = appTextBox(fonts, [{ text: title, size: sizes.title, bold: true }], colors.ink);
  const back = row(
    [
      markBox('chevron', sizes.bar, colors.accent),
      appTextBox(fonts, [{ text: 'AllRun', size: sizes.bar, bold: false }], colors.accent),
    ],
    sizes.bar * 0.3,
    'center',
  );
  const note = column(
    [heading, column(lines, sizes.row * 0.15, 'start')],
    sizes.row * 0.3,
    'start',
  );
  const width = Math.max(
    NOTES_MIN_WIDTH,
    note.width,
    back.width + (side?.width ?? 0) + sizes.bar * 2,
  );
  const bar = side === undefined ? widened(back, width, 'start') : spread(back, side, width);
  return panel(
    column([bar, note], sizes.bar * 0.7, 'start'),
    colors.page,
    NOTES_PAD,
    NOTES_PAD * 0.8,
    NOTES_RADIUS,
  );
}

/** The iPhone's Notes in dark and light mode: the page, the text and the yellow of its accents. */
export const NOTES_COLORS = {
  dark: { page: '#000000', ink: '#FFFFFF', accent: '#E8B43A' },
  light: { page: '#FFFFFF', ink: '#000000', accent: '#D49B12' },
} as const;

/**
 * A sent chat message in dark and light mode: the green bubble, its text, the line under it
 * (where the time goes) and the blue read ticks.
 */
const MESSAGE_COLORS = {
  dark: { bubble: '#005C4B', ink: '#E9EDEF', meta: '#E9EDEF99', ticks: '#53BDEB' },
  light: { bubble: '#D9FDD3', ink: '#111B21', meta: '#667781', ticks: '#53BDEB' },
} as const;

/**
 * A song playing on the iPhone's lock screen (iOS 26), in dark and light mode: the see-through
 * glass card and its edge, its texts (the song's name, and the fainter artist and times), the
 * progress bar's track and what has played, and the dimmed "previous" button.
 */
export const MUSIC_COLORS = {
  dark: {
    card: '#2C2C2EA6',
    edge: '#FFFFFF2E',
    ink: '#FFFFFF',
    faded: '#FFFFFF8C',
    dimmed: '#FFFFFF59',
    track: '#FFFFFF2E',
    played: '#FFFFFF8C',
  },
  light: {
    card: '#F2F2F7CC',
    edge: '#FFFFFF99',
    ink: '#000000',
    faded: '#3C3C4399',
    dimmed: '#3C3C4359',
    track: '#3C3C432E',
    played: '#3C3C4399',
  },
} as const;
/** The cover's colors in AllRun's red and night ink, the route in chalk on either. */
export const BRAND_COVER_COLORS = { red: '#C94A2E', ink: '#141B2D' } as const;
export const COVER_ROUTE = '#F6F1EA';

/**
 * Where the lock screen's player puts each thing, measured on an iPhone and scaled to a card
 * 840 px wide: the cover in the top-left corner with the song's name and artist beside it, the
 * sound wave in the top-right one, the times on the progress bar's line, at its ends, and the
 * controls centered under it, AirPlay at the right.
 */
const MUSIC = {
  width: 840,
  height: 373,
  radius: 46,
  cover: { x: 32, y: 32, size: 128, radius: 10, route: 3 },
  text: { x: 184, size: 40 },
  wave: { x: 740, y: 58, size: 46 },
  bar: { y: 194, height: 16, left: 119, right: 704, gap: 20 },
  time: { inset: 45, size: 28 },
  controls: { y: 296, pause: 71, skip: 79, skipOffset: 172, airplayX: 735, airplay: 50 },
} as const;
/** How much of the song has played, as the bar shows it. */
const MUSIC_PLAYED = 0.3;

/**
 * The iPhone's camera (iOS 26): the dimmed bands over the photo, the grid, its texts and the
 * yellow of what is chosen, its see-through buttons and pills and their edges, the shutter's
 * ring and button, and the last photo's thumbnail (the route, as the music's cover).
 */
const CAMERA_COLORS = {
  band: '#0000008C',
  grid: '#FFFFFF73',
  ink: '#FFFFFF',
  chosen: '#FFD60A',
  pill: '#1C1C1EA6',
  button: '#3A3A3CA6',
  chosenPill: '#48484AA6',
  edge: '#FFFFFF33',
  ring: '#2C2C2ECC',
  shutter: '#FFFFFF',
} as const;

/**
 * Where the camera puts each thing on a story, measured on an iPhone and scaled to 1080 px wide
 * (the bands a little lower: a story is shorter than the phone's screen): the data's pill at the
 * top right, where the camera's settings go; the f button (with the sport's icon) and the zoom
 * at the bottom of the photo; the shutter, and under it the thumbnail, the modes' pill and the
 * flip button. Shorter formats shrink all of it alike.
 */
const CAMERA = {
  storyHeight: 1920,
  top: 170,
  bottom: 440,
  grid: 2,
  data: { height: 94, inset: 47, size: 36, gap: 40, pad: 40 },
  lens: { size: 101, x: 121, fromBottom: 95, icon: 0.5 },
  zoom: { size: 35, side: 105 },
  shutter: { y: 150, outer: 105, inner: 89, edge: 3 },
  controls: { y: 335, size: 123, x: 154, symbol: 0.58 },
  modes: { width: 438, size: 34, chosenFrom: -12, chosenTo: 211, inset: 6, videoX: -113 },
} as const;

/**
 * Most laps a timing table lists one by one (an interval session's reps and recoveries fit) and
 * most splits a timing tower lists, a grid's 20; more are grouped, as in the note.
 */
const LAPS_ROWS = 24;
/** A board's sport icon, a share of its column names' size. */
const LAPS_ICON = 1.3;
const GRAND_PRIX_ROWS = 20;

/** A table of laps as `lapsTableBox` draws it: its rows' texts and how to write them. */
export interface LapsTable {
  /** The columns' names: the lap, its distance, its time and its pace, speed or count. */
  readonly names: readonly [string, string, string, string];
  readonly rows: readonly {
    readonly number: string;
    readonly distance: string;
    /** The distance's unit when not the table's (a gym day's calories). */
    readonly unit?: string;
    readonly time: string;
    readonly value: string;
  }[];
  /** The row in the brand color, -1 for none. */
  readonly fastest: number;
  /** The distance's unit, after each distance. */
  readonly unit: string;
  /** What follows a value on the board ("/km"). */
  readonly after: string;
  /** A value as the timing sheet writes it (a pace with its marks). */
  readonly sheetValue: (value: string) => string;
  /** The sheet's title. */
  readonly title: string;
  /**
   * The sport the laps are all of, its icon (or AllRun's monogram for every sport) before the
   * board's first column name; a summary's laps (the sheet says it in its title).
   */
  readonly icon?: SportMark;
}

/**
 * Laps as a table, of an activity or a period alike (see `LAPS`): a board of them (`board`), its
 * numbers in a dot matrix on a see-through panel, or a karting's timing sheet (`sheet`) under its
 * title; the fastest row in AllRun's `cover` color.
 */
export function lapsTableBox(
  fonts: SkTypefaceFontProvider,
  layout: (typeof LAPS_LAYOUTS)[number],
  coverColor: (typeof BRAND_COVERS)[number],
  table: LapsTable,
): Box {
  const { fastest } = table;
  const cover = BRAND_COVER_COLORS[coverColor];
  if (layout === 'board') {
    // A board's dot matrix for its numbers.
    const board = LAPS.board;
    const { colors } = board;
    const value = (amount: string, unitText: string) =>
      appTextBox(
        fonts,
        [
          { text: amount, size: board.value, bold: false },
          { text: unitText, size: board.value * board.unit, bold: false },
        ],
        colors.ink,
        { font: 'doto' },
      );
    const names = table.names.map((name, i) => {
      const written = appTextBox(
        fonts,
        [{ text: name.toLocaleUpperCase(), size: board.header, bold: true }],
        colors.ink,
        {
          shadow: true,
        },
      );
      return i === 0 && table.icon !== undefined
        ? row(
            [sportMarkBox(table.icon, board.header * LAPS_ICON, colors.ink), written],
            board.header * 0.35,
            'center',
          )
        : written;
    });
    const cells = table.rows.map((written) => [
      appTextBox(fonts, [{ text: written.number, size: board.number, bold: false }], colors.faded, {
        font: 'doto',
      }),
      value(written.distance, written.unit ?? table.unit),
      value(written.time, ''),
      value(written.value, table.after),
    ]);
    const widths = columnWidths([names, ...cells]);
    const width = tableWidth(widths, board.gap, board.padX);
    const body = placed(
      width,
      board.rowHeight * table.rows.length,
      cells.flatMap((boxes, i) => [
        ...(i === fastest || i % 2 === 1
          ? [
              {
                box: fillBox(width, board.rowHeight, 0, i === fastest ? cover : colors.stripe, {}),
                x: 0,
                y: board.rowHeight * i,
              },
            ]
          : []),
        {
          box: tableRow(boxes, widths, board.gap, board.padX, board.rowHeight),
          x: 0,
          y: board.rowHeight * i,
        },
      ]),
    );
    return column(
      [
        tableRow(names, widths, board.gap, board.padX, board.header * 1.4),
        overlay(fillBox(width, body.height, 0, colors.panel, {}), body),
      ],
      board.headerGap,
      'start',
    );
  }
  const sheet = LAPS.sheet;
  const { colors } = sheet;
  const cells = table.rows.map((written, i) => {
    const ink = i === fastest ? colors.chosen : colors.ink;
    const mono = (text: string) =>
      appTextBox(fonts, [{ text, size: sheet.text, bold: false }], ink, { font: 'spaceMono' });
    return [
      mono(written.number),
      mono(`${written.distance}${written.unit ?? table.unit}`),
      mono(written.time),
      mono(table.sheetValue(written.value)),
    ];
  });
  const widths = columnWidths(cells);
  const width = tableWidth(widths, sheet.gap, sheet.padX);
  const paper = placed(
    width,
    sheet.rowHeight * table.rows.length,
    cells.flatMap((boxes, i) => [
      ...(i === fastest
        ? [
            {
              box: fillBox(width, sheet.rowHeight, 0, cover, {}),
              x: 0,
              y: sheet.rowHeight * i,
            },
          ]
        : []),
      ...(i === 0
        ? []
        : [
            {
              box: hairlineBox(width, 0, sheet.rule, colors.rule),
              x: 0,
              y: sheet.rowHeight * i,
            },
          ]),
      {
        box: tableRow(boxes, widths, sheet.gap, sheet.padX, sheet.rowHeight),
        x: 0,
        y: sheet.rowHeight * i,
      },
    ]),
  );
  const title = appTextBox(
    fonts,
    [{ text: table.title, size: sheet.title, bold: false }],
    colors.title,
    { shadow: true },
  );
  return column(
    [title, overlay(fillBox(width, paper.height, 0, colors.paper), paper)],
    sheet.titleGap,
    'start',
  );
}

/**
 * A board of laps (`board`), as AURA's: the names of the columns over a grey see-through panel,
 * every other row lighter; and a karting's timing sheet (`sheet`): white paper, lines between
 * rows, a typewriter's letters and the title over it. The fastest row is in a brand color.
 */
const LAPS = {
  board: {
    header: 22,
    number: 24,
    value: 40,
    unit: 0.45,
    rowHeight: 70,
    padX: 26,
    gap: 44,
    headerGap: 14,
    colors: {
      panel: '#636366B3',
      stripe: '#FFFFFF14',
      ink: '#FFFFFF',
      faded: '#FFFFFFB3',
    },
  },
  sheet: {
    title: 36,
    text: 30,
    rowHeight: 52,
    padX: 18,
    gap: 30,
    titleGap: 12,
    rule: 2,
    colors: {
      paper: '#FFFFFF',
      ink: '#1C1C1E',
      rule: '#0000002E',
      title: '#FFFFFF',
      chosen: '#FFFFFF',
    },
  },
} as const;

/**
 * A race's timing tower on TV: its dark panel, the sport and how far into the race it is on top,
 * then a row per split: its number, pace, gap to the fastest and tyre compound, or the purple
 * stopwatch of the fastest lap.
 */
const GRAND_PRIX = {
  title: 50,
  icon: 54,
  lap: 30,
  row: 36,
  rowHeight: 58,
  padX: 24,
  padY: 22,
  gap: 26,
  radius: 18,
  rule: 2,
  /** Height of the shadow the header casts on the rows. */
  shadow: 22,
  colors: {
    panel: '#15151EF0',
    header: ['#3D3D4C', '#262633'],
    shadow: ['#00000099', '#00000000'],
    ink: '#FFFFFF',
    faded: '#FFFFFFA6',
    rule: '#FFFFFF1F',
    fastest: '#A13BD4',
  },
  tyres: { soft: '#FF3B30', medium: '#FFD60A', hard: '#F2F2F2' },
} as const;
/** How a tyre compound is written on the tower, as TV writes it in any language. */
const TYRE_LETTERS: Readonly<Record<TyreCompound, string>> = { soft: 'S', medium: 'M', hard: 'H' };

/** A race's timing tower as `timingTowerBox` draws it. */
export interface TimingTower {
  /** The race's sport, its icon (or AllRun's monogram for every sport) before the title, if any. */
  readonly icon?: SportMark;
  readonly title: string;
  /** Under the title, where TV writes the lap. */
  readonly subtitle: string;
  readonly rows: readonly {
    readonly number: string;
    /** The row's own sport, its icon before its value (a period's activities). */
    readonly icon?: SportIconId;
    readonly value: string;
    /** Its gap to the leader, or the leader's word. */
    readonly gap: string;
    /** Its tyre, or the leader's purple stopwatch. */
    readonly mark: TyreCompound | 'fastest';
  }[];
}

/**
 * A race's timing tower, as TV shows one (see `GRAND_PRIX`), of an activity's splits or a
 * period's activities alike: the header lit from above over the rows, each its number and value
 * at the left, its gap and its tyre (the leader's stopwatch) at the right, in a condensed italic.
 */
export function timingTowerBox(fonts: SkTypefaceFontProvider, tower: TimingTower): Box {
  const sizes = GRAND_PRIX;
  const { colors } = sizes;
  const race = (content: string, size: number, color: string, bold = true) =>
    appTextBox(fonts, [{ text: content, size, bold }], color, {
      font: 'barlowCondensed',
      italic: true,
    });
  const cells = tower.rows.map((line) => {
    const value = race(line.value, sizes.row, colors.ink);
    return [
      race(line.number, sizes.row, colors.ink, false),
      line.icon === undefined
        ? value
        : row([iconBox(line.icon, sizes.row, colors.ink), value], sizes.gap * 0.35, 'center'),
      race(line.gap, sizes.row, colors.faded, false),
      line.mark === 'fastest'
        ? overlay(
            discBox(sizes.row * 0.5, colors.fastest),
            symbolBox('stopwatch', sizes.row * 0.82, colors.ink),
          )
        : race(TYRE_LETTERS[line.mark], sizes.row, sizes.tyres[line.mark]),
    ];
  });
  const title = race(tower.title.toLocaleUpperCase(), sizes.title, colors.ink);
  const header = column(
    [
      tower.icon === undefined
        ? title
        : row([sportMarkBox(tower.icon, sizes.icon, colors.ink), title], sizes.gap * 0.5, 'center'),
      race(tower.subtitle.toLocaleUpperCase(), sizes.lap, colors.faded, false),
    ],
    0,
    'center',
  );
  const widths = columnWidths(cells);
  const inner = Math.max(header.width, tableWidth(widths, sizes.gap, 0));
  // The number and the pace at the left, the gap and the tyre at the right end, as on TV.
  const lines = cells.map((boxes) =>
    placed(inner, sizes.rowHeight, [
      { box: boxes[0], x: 0, y: (sizes.rowHeight - boxes[0].height) / 2 },
      {
        box: boxes[1],
        x: widths[0] + sizes.gap,
        y: (sizes.rowHeight - boxes[1].height) / 2,
      },
      {
        box: boxes[2],
        x: inner - widths[3] - sizes.gap - boxes[2].width,
        y: (sizes.rowHeight - boxes[2].height) / 2,
      },
      centeredAt(boxes[3], inner - widths[3] / 2, sizes.rowHeight / 2),
    ]),
  );
  const rows = placed(
    inner,
    sizes.rowHeight * lines.length,
    lines.flatMap((line, i) => [
      ...(i === 0
        ? []
        : [
            {
              box: hairlineBox(inner, 0, sizes.rule, colors.rule),
              x: 0,
              y: sizes.rowHeight * i,
            },
          ]),
      { box: line, x: 0, y: sizes.rowHeight * i },
    ]),
  );
  // The header lit from above, apart from the rows by the shadow it casts on them.
  const width = inner + 2 * sizes.padX;
  const headerHeight = sizes.padY + header.height + sizes.padY * 0.6;
  const height = headerHeight + rows.height + sizes.padY;
  // `y` down the card: the card's top is that far above where the shade is placed.
  const shade = (y: number, tall: number, shades: readonly [string, string]): Box => ({
    width,
    height: tall,
    place: (x, top) => [
      {
        kind: 'shade',
        x,
        y: top,
        width,
        height: tall,
        colors: shades,
        card: { x, y: top - y, width, height, radius: sizes.radius },
      },
    ],
  });
  return placed(width, height, [
    { box: fillBox(width, height, sizes.radius, colors.panel), x: 0, y: 0 },
    { box: shade(0, headerHeight, colors.header), x: 0, y: 0 },
    { box: shade(headerHeight, sizes.shadow, colors.shadow), x: 0, y: headerHeight },
    { box: widened(header, inner, 'center'), x: sizes.padX, y: sizes.padY },
    { box: rows, x: sizes.padX, y: headerHeight },
  ]);
}

/**
 * An alarm of the iPhone's Clock (iOS 26) in dark and light mode: its card, its time and label,
 * and its switch, on.
 */
const ALARM_COLORS = {
  dark: { card: '#000000', ink: '#FFFFFF', on: '#30D158', knob: '#FFFFFF' },
  light: { card: '#FFFFFF', ink: '#000000', on: '#34C759', knob: '#FFFFFF' },
} as const;
/** Sizes of an alarm: the time, its AM or PM, the label, the room inside and the switch. */
const ALARM = {
  time: 150,
  meridiem: 64,
  label: 32,
  padX: 46,
  padY: 26,
  radius: 44,
  gap: 80,
  minWidth: 700,
  toggle: { width: 126, height: 77, inset: 6 },
} as const;

/**
 * A location sticker in light and dark mode, as Instagram's: the place and a datum after a pin,
 * in a typewriter's letters, as AURA writes it.
 */
const LOCATION_COLORS = {
  light: { card: '#FFFFFF', ink: '#000000' },
  dark: { card: '#1C1C1E', ink: '#FFFFFF' },
} as const;
const LOCATION = { text: 40, pin: 1.15, gap: 14, padX: 30, padY: 18, radius: 24 } as const;

/**
 * AURA's board of splits: the names of its columns, then a row per split, its number at the top
 * left of a dark see-through band and a grey bar from the right as long as the split took (between
 * `shortest` and `longest` of the width), its time at the bar's end; the distance and the time
 * under it.
 */
const SPLIT_BARS = {
  width: 760,
  header: 20,
  number: 20,
  value: 44,
  total: 64,
  rowHeight: 66,
  rowGap: 4,
  pad: 14,
  headerGap: 12,
  totalGap: 22,
  shortest: 0.3,
  longest: 0.85,
  colors: { band: '#0000008C', bar: '#8E8E93', ink: '#FFFFFF' },
} as const;
/** Most splits the board lists one by one; more are grouped, as in the note. */
const SPLIT_BARS_ROWS = 20;

/**
 * A ladder of splits: white tags in a typewriter's letters under their title, each wider the
 * faster it went (up to `stretch` times the narrowest), the fastest in a brand color.
 */
const SPLIT_LADDER = {
  title: 40,
  text: 34,
  rowHeight: 58,
  rowGap: 10,
  padX: 16,
  gap: 34,
  stretch: 2,
  radius: 5,
  titleGap: 14,
  colors: { tag: '#FFFFFF', ink: '#000000', title: '#FFFFFF', chosen: '#FFFFFF' },
} as const;
const SPLIT_LADDER_ROWS = 20;

/** Instagram's verified badge after a datum, in its blue, its check white; the text's color. */
const VERIFIED = {
  text: 66,
  badge: 1.0,
  gap: 0.22,
  scallops: 8,
  blue: '#3897F0',
  check: '#FFFFFF',
} as const;
const VERIFIED_COLORS = { dark: '#FFFFFF', light: '#000000' } as const;

/** Sizes of a chat message with a phrase: the phrase, wrapped when long, and the line under it. */
const CHAT = { text: 50, meta: 26, wrap: 680, metaGap: 40 } as const;

/**
 * A sentence on a sheet of paper, as AURA's: the paper and its grain, the serif text and the
 * yellow of the marker over the data, a little wider than the words.
 */
const SENTENCE = {
  text: 58,
  wrap: 800,
  padX: 48,
  padY: 40,
  colors: { paper: '#EEEBE5', grain: '#00000024', ink: '#151515', marker: '#F5C542' },
  /**
   * Its band reaches this far above and below the baseline, and out of the words' ends: into the
   * space around them, or only a little next to a stop.
   */
  marker: { padX: 0.2, tight: 0.04, above: 0.95, below: 0.3 },
} as const;
/** A stretch of a highlighted sentence, and whether the marker goes over it. */
export interface SentencePart {
  readonly text: string;
  readonly marked: boolean;
}

/** A datum as a highlighted sentence writes it, in one piece: the marker never breaks a line. */
export const markedPart = (content: string): SentencePart => ({
  text: content.replace(/ /gu, '\u00A0'),
  marked: true,
});

/**
 * A highlighted sentence's parts: its `templates`, translated with the given placeholders (which
 * come back as markers, and as they are where nothing fills them), each placeholder filled with its
 * value in `values`, of an activity or a period alike.
 *
 * @throws Error if a template has a placeholder without a value.
 */
export function sentenceParts(
  templates: (holders: Readonly<Record<string, string>>) => readonly string[],
  values: Readonly<Record<string, SentencePart>>,
): SentencePart[] {
  const holders = Object.fromEntries(
    Object.keys(values).map((name) => [name, `\uE000${name}\uE001`]),
  );
  return templates(holders).flatMap((template) =>
    template
      .replace(/\uE000(\w+)\uE001/gu, '{{$1}}')
      .split(/\{\{(\w+)\}\}/u)
      .flatMap((part, i) => {
        if (i % 2 === 0) {
          return part === '' ? [] : [{ text: part, marked: false }];
        }
        const value = values[part];
        if (value === undefined) {
          throw new Error(`Nothing to write for {{${part}}} in a sentence`);
        }
        return [value];
      }),
  );
}

/**
 * A sentence typed on a sheet of paper, as AURA's, its `parts` that are `marked` highlighted.
 */
export function highlightedSentenceBox(
  fonts: SkTypefaceFontProvider,
  parts: readonly SentencePart[],
): Box {
  const sizes = SENTENCE;
  const { colors } = sizes;
  const laidOut = paragraph(
    parts.map((part) => ({ text: part.text, size: sizes.text, bold: false })),
    fonts,
    {
      font: 'spaceMono',
      color: colors.ink,
      bold: false,
      uppercase: false,
      italic: false,
    },
    { shadow: false, wrapWidth: sizes.wrap, wrapStart: true },
  );
  // Where each datum lies in the laid out text: a band per line it is on, from its first
  // letter to its last, as tall on every line whatever its letters (around the line's
  // baseline), as a marker draws it.
  const lines = laidOut.getLineMetrics();
  const { marker } = sizes;
  /** How far the band goes out of a datum's end: into a space, not over a stop. */
  const reach = (next: string | undefined) =>
    (next === undefined || /^\s/u.test(next) ? marker.padX : marker.tight) * sizes.text;
  let index = 0;
  const rects = parts.flatMap((part, i) => {
    const start = index;
    index += part.text.length;
    if (!part.marked) {
      return [];
    }
    const before = reach(parts[i - 1]?.text.slice(-1));
    const after = reach(parts[i + 1]?.text);
    const pieces = laidOut.getRectsForRange(start, index);
    return lines.flatMap((line) => {
      const on = pieces.filter(
        (rect) => rect.y <= line.baseline && line.baseline <= rect.y + rect.height,
      );
      if (on.length === 0) {
        return [];
      }
      const left = Math.min(...on.map((rect) => rect.x));
      const right = Math.max(...on.map((rect) => rect.x + rect.width));
      return [{ x: left - before, baseline: line.baseline, width: right - left + before + after }];
    });
  });
  const text = textBox(laidOut);
  const width = text.width + 2 * sizes.padX;
  const height = text.height + 2 * sizes.padY;
  return {
    width,
    height,
    place: (x, y) => {
      const left = x + sizes.padX;
      const top = y + sizes.padY;
      return [
        { kind: 'panel', x, y, width, height, radius: 0, color: colors.paper },
        { kind: 'grain', x, y, width, height, color: colors.grain },
        {
          kind: 'highlight',
          color: colors.marker,
          rects: rects.map((rect) => ({
            x: left + rect.x,
            y: top + rect.baseline - marker.above * sizes.text,
            width: rect.width,
            height: (marker.above + marker.below) * sizes.text,
          })),
        },
        ...text.place(left, top),
      ];
    },
  };
}

/**
 * How a marker's stroke strays from a rectangle, as AURA's: its ends straight, its top and bottom
 * edges leaning together from one end to the other (by up to `tilt` of its height) and slightly
 * wavy along the way (up to `wave` of its height, a wave every `step` heights), as a stroke drawn
 * by hand.
 */
const MARKER_WOBBLE = { tilt: 0.07, wave: 0.025, step: 0.6 } as const;
/** Room the paper's grain leaves between its specks, in square pixels per speck. */
const GRAIN_AREA = 260;

/**
 * A shop's receipt on thermal paper, in a typewriter's letters: the shop (AllRun), the activity
 * and its day, a line per datum, the total (the main datum), thanks and a barcode, between dashed
 * lines; its top and bottom torn in teeth.
 */
const RECEIPT = {
  width: 620,
  shop: 50,
  text: 28,
  total: 36,
  padX: 40,
  padY: 46,
  tooth: 14,
  gap: 22,
  dash: { length: 10, gap: 8, thick: 2 },
  barcode: 86,
  colors: { paper: '#FBFAF6', ink: '#1C1C1E' },
} as const;

/** A shop's receipt as `receiptBox` prints it. */
export interface Receipt {
  /** Under the shop's name (AllRun): what was bought and when. */
  readonly header: readonly string[];
  /** A line each, its name at the start and its value at the end. */
  readonly items: readonly { readonly name: string; readonly value: string }[];
  /** Under the items, between dashes: the last one is the total, in bold and bigger. */
  readonly totals: readonly { readonly name: string; readonly value: string }[];
  readonly thanks: string;
  /** What its barcode is drawn from, so the same receipt always has the same one. */
  readonly seed: string;
}

/**
 * A shop's receipt on thermal paper, of an activity or a period alike (see `RECEIPT`): the shop
 * and its header, a line per item, the totals, thanks and a barcode, between dashed lines; its
 * top and bottom torn in teeth. An item's name is cut short before its value.
 */
export function receiptBox(fonts: SkTypefaceFontProvider, receipt: Receipt): Box {
  const sizes = RECEIPT;
  const { colors } = sizes;
  const inner = sizes.width - 2 * sizes.padX;
  const mono = (content: string, size: number, bold = false, maxWidth = inner) =>
    appTextBox(fonts, [{ text: content, size, bold }], colors.ink, {
      font: 'spaceMono',
      maxWidth,
    });
  const dashes = () =>
    dashedBox(inner, sizes.dash.length, sizes.dash.gap, sizes.dash.thick, colors.ink);
  const item = (name: string, value: string, size: number, bold: boolean) => {
    const right = mono(value, size, bold);
    return spread(
      mono(name.toLocaleUpperCase(), size, bold, inner - right.width - size),
      right,
      inner,
    );
  };
  const last = receipt.totals.length - 1;
  const content = column(
    [
      column(
        [mono('AllRun', sizes.shop, true), ...receipt.header.map((line) => mono(line, sizes.text))],
        sizes.gap * 0.3,
        'center',
      ),
      dashes(),
      column(
        receipt.items.map((line) => item(line.name, line.value, sizes.text, false)),
        sizes.gap * 0.5,
        'start',
      ),
      dashes(),
      column(
        receipt.totals.map((line, i) =>
          i === last
            ? item(line.name, line.value, sizes.total, true)
            : item(line.name, line.value, sizes.text, false),
        ),
        sizes.gap * 0.5,
        'start',
      ),
      dashes(),
      mono(receipt.thanks, sizes.text),
      barcodeBox(inner, sizes.barcode, seedOf(receipt.seed), colors.ink),
    ],
    sizes.gap,
    'center',
  );
  const width = content.width + 2 * sizes.padX;
  const height = content.height + 2 * sizes.padY;
  return {
    width,
    height,
    place: (x, y) => [
      { kind: 'paper', shape: 'receipt', x, y, width, height, color: colors.paper },
      ...content.place(x + sizes.padX, y + sizes.padY),
    ],
  };
}

/**
 * A boarding pass: the band in a brand color with its title and the sport's icon; from the start
 * (no distance yet, its time) to the finish (the distance, when it ended), with the sport's icon
 * on the dashed line between them; the date and the data in a row; and the stub with its barcode,
 * apart by the notches where it tears off.
 */
const BOARDING_PASS = {
  width: 880,
  radius: 30,
  padX: 44,
  band: 96,
  title: 28,
  icon: 46,
  label: 21,
  big: 84,
  time: 30,
  field: 32,
  routeIcon: 52,
  gap: 26,
  notch: 18,
  barcode: 92,
  dash: { length: 14, gap: 10, thick: 3 },
  colors: { paper: '#FFFFFF', ink: '#141B2D', faded: '#8A8F98', band: '#F6F1EA', rule: '#C9CDD3' },
} as const;

/** One end of a boarding pass's trip: big, its unit after it, and what goes under it. */
export interface PassEnd {
  readonly big: string;
  readonly unit: string | null;
  readonly under: string | null;
}

/** A boarding pass as `boardingPassBox` draws it. */
export interface BoardingPass {
  /** On its band, as a pass names its destination. */
  readonly title: string;
  /** Its sport's icon (or AllRun's monogram), on its band and on the dashed line. */
  readonly mark: SportMark;
  readonly departure: PassEnd;
  readonly arrival: PassEnd;
  readonly names: { readonly departure: string; readonly arrival: string };
  /** The data in a row under the trip. */
  readonly fields: readonly { readonly name: string; readonly value: string }[];
  /** What its barcode is drawn from, so the same pass always has the same one. */
  readonly seed: string;
}

/**
 * A boarding pass, of an activity or a period alike (see `BOARDING_PASS`): its band in AllRun's
 * `coverColor` with its title and mark; from its departure to its arrival, the mark on the dashed
 * line between them; its fields in a row; and the stub with its barcode, apart by the notches
 * where it tears off.
 */
export function boardingPassBox(
  fonts: SkTypefaceFontProvider,
  coverColor: (typeof BRAND_COVERS)[number],
  pass: BoardingPass,
): Box {
  const sizes = BOARDING_PASS;
  const { colors } = sizes;
  const cover = BRAND_COVER_COLORS[coverColor];
  const label = (content: string) =>
    appTextBox(
      fonts,
      [{ text: content.toLocaleUpperCase(), size: sizes.label, bold: true, spacing: 0.08 }],
      colors.faded,
    );
  const strong = (content: string, size: number) =>
    appTextBox(fonts, [{ text: content, size, bold: true }], colors.ink);
  /** A value written big, its unit after it, smaller. */
  const big = (value: string, unit: string | null) =>
    appTextBox(
      fonts,
      [
        { text: value, size: sizes.big, bold: true },
        ...(unit === null ? [] : [{ text: ` ${unit}`, size: sizes.big * 0.45, bold: true }]),
      ],
      colors.ink,
    );
  const end = (name: string, at: PassEnd, align: Align) =>
    column(
      [
        label(name),
        big(at.big, at.unit),
        ...(at.under === null ? [] : [strong(at.under, sizes.time)]),
      ],
      4,
      align,
    );
  const from = end(pass.names.departure, pass.departure, 'start');
  const to = end(pass.names.arrival, pass.arrival, 'end');
  const dash = (length: number) =>
    dashedBox(length, sizes.dash.length, sizes.dash.gap, sizes.dash.thick, colors.rule);
  const minRoute = sizes.routeIcon * 3;
  const inner = Math.max(
    sizes.width - 2 * sizes.padX,
    from.width + to.width + 2 * sizes.gap + minRoute,
  );
  const routeWidth = inner - from.width - to.width - 2 * sizes.gap;
  const leg = (routeWidth - sizes.routeIcon) / 2 - sizes.gap * 0.4;
  const trip = placed(inner, Math.max(from.height, to.height), [
    { box: from, x: 0, y: 0 },
    centeredAt(
      row(
        [dash(leg), sportMarkBox(pass.mark, sizes.routeIcon, colors.ink), dash(leg)],
        sizes.gap * 0.4,
        'center',
      ),
      from.width + sizes.gap + routeWidth / 2,
      Math.max(from.height, to.height) / 2,
    ),
    { box: to, x: inner - to.width, y: 0 },
  ]);
  const fields = justified(
    pass.fields.map((field) =>
      column([label(field.name), strong(field.value, sizes.field)], 4, 'start'),
    ),
    inner,
    sizes.gap,
  );
  // A long title is cut short before the icon.
  const title = appTextBox(
    fonts,
    [
      {
        text: pass.title.toLocaleUpperCase(),
        size: sizes.title,
        bold: true,
        spacing: 0.12,
      },
    ],
    colors.band,
    { maxWidth: inner - sizes.icon - sizes.gap },
  );
  const width = inner + 2 * sizes.padX;
  const body = sizes.band + sizes.gap * 1.2;
  const cut = body + trip.height + sizes.gap * 1.4 + fields.height + sizes.gap * 1.4;
  const height = cut + sizes.gap * 1.4 + sizes.barcode + sizes.gap * 1.4;
  const inset = sizes.notch + sizes.gap * 0.4;
  return {
    width,
    height,
    place: (x, y) => [
      { kind: 'paper', shape: 'pass', x, y, width, height, color: colors.paper, cut },
      ...placed(width, height, [
        // The band, its top corners rounded as the pass's, its bottom ones square.
        { box: fillBox(width, sizes.band, sizes.radius, cover, {}), x: 0, y: 0 },
        {
          box: fillBox(width, sizes.band - sizes.radius, 0, cover, {}),
          x: 0,
          y: sizes.radius,
        },
        { box: title, x: sizes.padX, y: (sizes.band - title.height) / 2 },
        {
          box: sportMarkBox(pass.mark, sizes.icon, colors.band),
          x: width - sizes.padX - sizes.icon,
          y: (sizes.band - sizes.icon) / 2,
        },
        { box: trip, x: sizes.padX, y: body },
        { box: fields, x: sizes.padX, y: body + trip.height + sizes.gap * 1.4 },
        { box: dash(width - 2 * inset), x: inset, y: cut - sizes.dash.thick / 2 },
        {
          box: barcodeBox(inner, sizes.barcode, seedOf(pass.seed), colors.ink),
          x: sizes.padX,
          y: cut + sizes.gap * 1.4,
        },
      ]).place(x, y),
    ],
  };
}

/** Width of the AllRun name signing a block, and its room above. */
const LOGO_WIDTH = 190;
const LOGO_GAP = 40;

/**
 * Lays out a mixed widget with the data of `data`'s activity, or `null` when the activity has no
 * datum to show. Time O(d) for the d data of the block, each text laid out once.
 */
export function prepareActivityBlock(
  layer: BlockLayer,
  data: ActivityData,
  { fonts, textContext, translate, canvas }: BlockContext,
): PreparedBlock | null {
  const { activity } = data;
  const { block, style } = layer;
  const metrics = isDataWidget(block.design)
    ? dataWidgetMetrics(activity, block)
    : blockMetrics(activity, blockDataCount(block));
  // A verse or a quote shows no data: it is drawn for any activity.
  if (metrics.length === 0 && blockDataCount(block) > 0) {
    return null;
  }
  /** A replica's text in `color` (see `appTextBox`). */
  const appText = (runs: readonly Run[], color: string, options: TextLook & AppLettering = {}) =>
    appTextBox(fonts, runs, color, options);
  /** `runs` cut to their letters (see `capitalsBox`), in the block's lettering by default. */
  const capitals = (
    runs: readonly Run[],
    size: number,
    below: number,
    taller = 1,
    lettering: BlockStyle = style,
    look: TextLook = {},
    shared?: string,
  ): Box => capitalsBox(fonts, runs, size, below, taller, lettering, look, shared);
  /**
   * `text` on one line at `size` in the block's lettering, cut to its letters, or to all of
   * `shared`'s when it sits on one baseline with others (see `capitals`).
   */
  const line = (text: string, size: number, below: number, taller = 1, shared?: string): Box =>
    capitals([{ text, size, bold: style.bold }], size, below, taller, style, {}, shared);
  /** The size `text` is written at to be `width` wide (its width grows with its size). */
  const sizeFor = (text: string, width: number): number =>
    (FIT_SIZE * width) /
    textBox(paragraph([{ text, size: FIT_SIZE, bold: style.bold }], fonts, style)).width;
  /**
   * Lines of `size` one under another, `gap` (a share of the size) apart and aligned to `align`,
   * shrunk as one so that `columns` of them fit in `width` with `minGap` between them.
   */
  const fitted = (columns: readonly (readonly string[])[], size: number, width: number): Box => {
    const laid = (at: number) =>
      columns.map((lines, i) =>
        column(
          lines.map((text) => line(text, at, at * DATE.lineGap)),
          0,
          i === 0 ? 'start' : i === columns.length - 1 ? 'end' : 'start',
        ),
      );
    const room = (boxes: readonly Box[], at: number) =>
      boxes.reduce((sum, box) => sum + box.width, 0) + at * DATE.minGap * (boxes.length - 1);
    const wanted = laid(size);
    const fits = room(wanted, size) <= width;
    const at = fits ? size : (size * width) / room(wanted, size);
    return justified(fits ? wanted : laid(at), width, at * DATE.minGap);
  };
  /** The weekday's full name, and the short one ("Mié"). */
  const weekdayName = formatActivityDate(activity.startLocal, textContext.locale, 'weekday');
  const shortWeekdayName = formatShortWeekday(activity.startLocal, textContext.locale);
  /** When the activity started ("10:00"), and its sport's name. */
  const startTime = formatActivityDate(activity.startLocal, textContext.locale, 'time');
  const sportWord = translate(`modalities.${activity.sportModality}`);
  /** The text context with a time's units at their shortest ("1h 5min 5s"), for tight widgets. */
  const compactContext: TextContext = {
    ...textContext,
    durationUnits: {
      hours: translate('compactDurationUnits.hours'),
      minutes: translate('compactDurationUnits.minutes'),
      seconds: translate('compactDurationUnits.seconds'),
    },
  };
  /** A datum as a data widget without names writes it (see `plainMetricText`). */
  const plain = (metric: MetricId) => plainMetricText(activity, metric, textContext);
  /** A datum as one text, its unit after it: "11,34 km". */
  const written = (metric: MetricId): string => {
    const { value: amount, unit } = metricText(activity, metric, textContext);
    return unit === null ? amount : `${amount} ${textContext.unitLabel(unit)}`;
  };
  /**
   * A datum in words: a time in units ("1h 5min 22s"), a distance with its unit's name, as the
   * verified badge writes it ("11,34 kilometers") or before a sport's word ("11.34 kilometer
   * run"); any other datum as written.
   */
  const inWords = (metric: MetricId, words: 'verified' | 'sentence'): string => {
    const seconds =
      metric === 'movingTime' || metric === 'elapsedTime' ? metricValue(activity, metric) : null;
    if (seconds !== null) {
      return durationParts(seconds, 'seconds')
        .map(({ amount, unit }) => `${amount}${textContext.durationUnits[unit]}`)
        .join(' ');
    }
    const { value, unit } = metricText(activity, metric, textContext);
    if (unit !== 'km' && unit !== 'mi') {
      return written(metric);
    }
    return words === 'verified'
      ? translate(`widgets.verified.${unit}`, { value })
      : translate(`widgets.sentence.units.${unit}`, { value });
  };
  /** The splits in the user's unit, kilometers or miles; none without a detail. */
  const splits =
    data.detail === null
      ? []
      : textContext.unit === 'mi'
        ? data.detail.splits.imperial
        : data.detail.splits.metric;
  const quotation = (words: string, source: string): Box =>
    quotationBox(fonts, style, translate, words, source);

  let hole: HitHole | undefined;
  const body = ((): Box | null => {
    switch (block.design) {
      case 'bigTrio':
      case 'bigPair':
      case 'bigSolo': {
        // A datum big, unit and all (stretched upwards in its stretched looks), and the others
        // small under it, spread across its width: the first at its start, the last at its end.
        const sizes = SIZES.big[block.layout];
        const [first, ...rest] = metrics;
        const main = capitals(
          [{ text: plain(first), size: sizes.value, bold: style.bold }],
          sizes.value,
          sizes.value * BIG.below,
          sizes.stretch,
        );
        const under = (size: number) =>
          rest.map((metric) =>
            capitals([{ text: plain(metric), size, bold: style.bold }], size, size * BIG.below),
          );
        // Smaller when they don't fit under it (a short time over three long data).
        const room = (data: readonly Box[], size: number) =>
          data.reduce((sum, box) => sum + box.width, 0) + size * BIG.minGap * (data.length - 1);
        const wanted = under(sizes.data);
        const fits = room(wanted, sizes.data) <= main.width;
        const size = fits ? sizes.data : (sizes.data * main.width) / room(wanted, sizes.data);
        const data = fits ? wanted : under(size);
        const stack =
          data.length === 0
            ? main
            : column([main, justified(data, main.width, size * BIG.minGap)], 0, 'start');
        if (block.layout === 'day' || block.layout === 'stretchedDay') {
          // The weekday as wide as the big datum, written at the size that makes it so. Not
          // stretched with it: an accent stretched upwards would float off its letter.
          const day = line(
            weekdayName,
            sizeFor(weekdayName, main.width),
            sizes.value * BIG_HEADER.dayGap,
          );
          return column([day, stack], 0, 'start');
        }
        if (block.layout === 'smallDay') {
          // The weekday small and centered over it.
          const day = line(
            weekdayName,
            sizes.value * BIG_HEADER.smallDay,
            sizes.value * BIG_HEADER.smallDayGap,
          );
          return column([day, stack], 0, 'center');
        }
        if (block.layout === 'route' && activity.routePolyline !== null) {
          // The route over it, centered, a little narrower than the big datum.
          const route = routeBox(
            activity.routePolyline,
            main.width * BIG_HEADER.routeWidth,
            main.width * BIG_HEADER.routeHeight,
          );
          return route === null
            ? stack
            : column([route, stack], sizes.value * BIG_HEADER.routeGap, 'center');
        }
        return stack;
      }
      case 'dayRoute': {
        // The weekday and the big datum as wide as each other, the route between them.
        const sizes = SIZES.dayRoute;
        const main = capitals(
          [{ text: plain(metrics[0]), size: sizes.value, bold: style.bold }],
          sizes.value,
          0,
        );
        const day = line(weekdayName, sizeFor(weekdayName, main.width), 0);
        const route =
          activity.routePolyline === null
            ? null
            : routeBox(
                activity.routePolyline,
                main.width * BIG_HEADER.routeWidth,
                main.width * BIG_HEADER.routeHeight,
              );
        return column(
          route === null ? [day, main] : [day, route, main],
          sizes.value * sizes.gap,
          'center',
        );
      }
      case 'dayBetween': {
        // The short weekday between its data, half on each side, one under another: one level
        // band, the weekday's capitals as tall as two lines of data and the room between them.
        // With a datum on each side, it keeps that size, squashed to their one line.
        const sizes = SIZES.dayBetween;
        const cells = metrics.map((metric) => line(plain(metric), sizes.data, 0));
        const half = Math.ceil(cells.length / 2);
        const side = (boxes: readonly Box[]) => column(boxes, sizes.data * sizes.rowGap, 'start');
        const left = side(cells.slice(0, half));
        const capital = CAP_HEIGHTS[style.font] * (STRETCHED_FONTS[style.font] ?? 1);
        const twoLines = sizes.data * (2 * capital + sizes.rowGap);
        const weekdaySize = twoLines / capital;
        const day = line(shortWeekdayName, weekdaySize, 0, left.height / twoLines);
        // Their baselines lined up at the bottom: an accent rises over the band, not under it.
        return row([left, day, side(cells.slice(half))], sizes.data * sizes.sideGap, 'end');
      }
      case 'dayOver': {
        // The weekday wide, and under it, as wide, the sport and start time, then the data, in
        // columns of two lines.
        const sizes = SIZES.dayOver[block.layout];
        const day = line(weekdayName, sizes.weekday, sizes.weekday * DATE.headGap);
        const texts = metrics.map(plain);
        const columns: string[][] = [[sportWord, startTime]];
        for (let i = 0; i < texts.length; i += 2) {
          columns.push(texts.slice(i, i + 2));
        }
        return column([day, fitted(columns, sizes.data, day.width)], 0, 'start');
      }
      case 'dayColumns': {
        // The date on the left, the data on the right, a line each.
        const sizes = SIZES.dayColumns;
        const date = formatActivityDate(activity.startLocal, textContext.locale, 'short');
        const left = [
          weekdayName,
          date,
          startTime,
          ...(block.layout === 'four' ? [sportWord] : []),
        ];
        const lines = (texts: readonly string[]) =>
          texts.map((text) => line(text, sizes.text, sizes.text * DATE.lineGap));
        const lefts = lines(left);
        // With more text around them, a pace keeps its unit and a time is written in units.
        const rights = lines(
          metrics.map((metric) => plainMetricText(activity, metric, compactContext, 'words')),
        );
        const width =
          Math.max(...lefts.map((box) => box.width)) +
          Math.max(...rights.map((box) => box.width)) +
          sizes.text * sizes.gap;
        return column(
          lefts.map((box, i) => spread(box, rights[i], width)),
          0,
          'start',
        );
      }
      case 'dataStack': {
        // The data big, one under another, over the short weekday and start time.
        const sizes = SIZES.dataStack;
        const data = column(
          metrics.map((metric) => line(plain(metric), sizes.value, sizes.value * DATE.stackGap)),
          0,
          'center',
        );
        const footer = line(
          translate('widgets.dayAndTime', { day: shortWeekdayName, time: startTime }),
          sizes.value * sizes.footer,
          0,
        );
        return column([data, footer], sizes.value * DATE.stackGap, 'center');
      }
      case 'tower': {
        // The big datum's amount, its unit and the sport's word, one under another, tall and
        // narrow; the other two small beside the word, on their side, read upwards from its foot
        // and as long as it is tall.
        const sizes = SIZES.tower;
        const [first, ...rest] = metrics;
        const letters =
          sizes.value *
          CAP_HEIGHTS[style.font] *
          (STRETCHED_FONTS[style.font] ?? 1) *
          sizes.stretch;
        const big = (text: string, size: number, below: number) =>
          line(text, size, below, (sizes.stretch * sizes.value) / size);
        // Short, to stay narrow: a distance to its hundreds of meters (or tenths of a mile).
        const { amount, unit } = plainMetricParts(activity, first, textContext, 1);
        const over = [amount, ...(unit === null ? [] : [textContext.unitLabel(unit)])].map((text) =>
          big(text, sizes.value, letters * sizes.gap),
        );
        // A long word is squeezed, up to a point, to the width of the lines over it: written
        // smaller and drawn taller, its capitals as tall as theirs.
        const word = translate(`widgets.tower.sports.${activity.sportModality}`);
        const natural = big(word, sizes.value, 0).width;
        const widest = Math.max(...over.map((box) => box.width));
        const squeeze = Math.min(1, Math.max(sizes.squeeze, widest / natural));
        const sport = big(word, sizes.value * squeeze, 0);
        const caption: BlockStyle = { ...style, font: TOWER_SIDE_FONT, bold: false };
        const captions = rest.map((metric) =>
          plainMetricText(activity, metric, compactContext, 'tight'),
        );
        const captionCap = CAP_HEIGHTS[TOWER_SIDE_FONT];
        const longest = Math.max(
          ...captions.map(
            (text) =>
              textBox(paragraph([{ text, size: FIT_SIZE, bold: false }], fonts, caption)).width,
          ),
        );
        const size = Math.min((FIT_SIZE * letters) / longest, sizes.value * sizes.sideMax);
        const lines = captions.map((text) =>
          capitals([{ text, size, bold: false }], size, size * BIG.below, 1, caption, {
            turned: true,
          }),
        );
        const data = turned(column(lines, size * captionCap * sizes.sideGap, 'start'));
        return column(
          [...over, row([sport, data], size * captionCap * sizes.sideGap, 'end')],
          0,
          'start',
        );
      }
      case 'dataLine': {
        // The data in a line, briefly: a time without its seconds. Named, as Strava writes them:
        // each under its name, aligned to their start, a pace with its unit.
        // The names, and the data, each on one baseline: cut as one, whatever their letters.
        const sizes = SIZES.dataLine;
        if (block.layout === 'namedThree' || block.layout === 'namedTwo') {
          const names = metrics.map((metric) => translate(`metrics.${metric}`));
          const values = metrics.map((metric) =>
            plainMetricText(activity, metric, compactContext, 'tight'),
          );
          return row(
            names.map((name, i) =>
              column(
                [
                  line(
                    name,
                    sizes.text * sizes.name,
                    sizes.text * sizes.nameGap,
                    1,
                    names.join(' '),
                  ),
                  line(values[i], sizes.text, 0, 1, values.join(' ')),
                ],
                0,
                'start',
              ),
            ),
            sizes.text * sizes.namedGap,
            'start',
          );
        }
        const values = metrics.map((metric) =>
          plainMetricText(activity, metric, compactContext, 'brief'),
        );
        return row(
          values.map((value) => line(value, sizes.text, 0, 1, values.join(' '))),
          sizes.text * sizes.gap,
          'start',
        );
      }
      case 'card': {
        // The data with their short names over them, three a row, on a see-through card with
        // square corners, under the activity's name in its two looks with one.
        const sizes = SIZES.card;
        const unshaded = (runs: readonly Run[], look: TextLook = {}) =>
          textBox(paragraph(runs, fonts, style, { shadow: false, ...look }));
        const cells = metrics.map((metric) =>
          column(
            [
              unshaded([
                {
                  text: translate(`widgets.cardLabels.${metric}`),
                  size: sizes.label,
                  bold: false,
                  faded: true,
                },
              ]),
              unshaded([
                {
                  text: plainMetricText(activity, metric, compactContext, 'words'),
                  size: sizes.value,
                  bold: style.bold,
                },
              ]),
            ],
            sizes.label * sizes.labelGap,
            'start',
          ),
        );
        const rows: Box[][] = [];
        for (let i = 0; i < cells.length; i += CARD_COLUMNS) {
          rows.push(cells.slice(i, i + CARD_COLUMNS));
        }
        const widths = columnWidths(rows);
        const rowHeight = Math.max(...cells.map((cell) => cell.height));
        const grid = column(
          rows.map((cellsOfRow) => tableRow(cellsOfRow, widths, sizes.columnGap, 0, rowHeight)),
          sizes.value * sizes.rowGap,
          'start',
        );
        const named = block.layout === 'nameThree' || block.layout === 'nameSix';
        const name = activity.name.trim();
        const content = named
          ? column(
              [
                unshaded(
                  [
                    {
                      text: name === '' ? sportWord : name,
                      size: sizes.title,
                      bold: true,
                    },
                  ],
                  { maxWidth: grid.width },
                ),
                grid,
              ],
              sizes.value * sizes.titleGap,
              'start',
            )
          : grid;
        return overlay(
          fillBox(
            content.width + 2 * sizes.padX,
            content.height + 2 * sizes.padY,
            0,
            softBackdrop(style.color),
            {},
          ),
          content,
        );
      }
      case 'notes': {
        // The splits as a note of the iPhone's Notes, in its font and colors.
        const rows = splitRows(splits, NOTES_ROWS);
        if (rows.length === 0) {
          return null;
        }
        const colors = NOTES_COLORS[block.layout];
        const sizes = SIZES.notes;
        const speed = speedMeasure(activity.sportFamily);
        const unit = textContext.unitLabel(textContext.unit);
        const fastest = rows.reduce(
          (best, split, i) => (split.speed > rows[best].speed ? i : best),
          0,
        );
        const written = rows.map((split, i) => {
          const texts = splitRowTexts(split, speed, textContext);
          const ink = i === fastest ? colors.accent : colors.ink;
          return {
            name: appText([{ text: `${unit} ${texts.number}`, size: sizes.row, bold: false }], ink),
            pace: appText([{ text: `- ${texts.value}`, size: sizes.row, bold: false }], ink),
          };
        });
        // Every "km n" as wide as the widest, so the dashes and the paces line up.
        const nameWidth = Math.max(...written.map((line) => line.name.width));
        const lines = written.map((line) =>
          row([widened(line.name, nameWidth, 'start'), line.pace], sizes.row * 0.25, 'start'),
        );
        const distance = metricText(activity, 'distance', textContext);
        const sport = noteSportBox(
          fonts,
          block.layout,
          translate(`modalities.${activity.sportModality}`),
          sportIcon(activity),
        );
        return noteBox(
          fonts,
          block.layout,
          distance.unit === null
            ? distance.value
            : `${distance.value} ${textContext.unitLabel(distance.unit)}`,
          lines,
          sport,
        );
      }
      case 'music': {
        // The activity as the song playing: the route as its cover, its name as the song's, and
        // its distance and time at the ends of the progress bar.
        const colors = MUSIC_COLORS[block.layout];
        const { cover, text: song, wave, bar, time, controls } = MUSIC;
        const glass = { edge: colors.edge };
        const route =
          activity.routePolyline === null
            ? null
            : routeBox(activity.routePolyline, cover.size * 0.7, cover.size * 0.7, {
                color: COVER_ROUTE,
                width: cover.route,
              });
        const art = overlay(
          fillBox(cover.size, cover.size, cover.radius, BRAND_COVER_COLORS[block.cover], {}),
          route ?? iconBox(sportIcon(activity), cover.size * 0.5, COVER_ROUTE),
        );
        // As far from the sound wave as from the cover.
        const textWidth = wave.x - song.x - (song.x - cover.x - cover.size);
        const sport = translate(`modalities.${activity.sportModality}`);
        const day = formatActivityDate(activity.startLocal, textContext.locale, 'short');
        const name = activity.name.trim();
        const texts = column(
          [
            appText(
              [{ text: name === '' ? sport : name, size: song.size, bold: true }],
              colors.ink,
              { maxWidth: textWidth },
            ),
            appText([{ text: `${sport} · ${day}`, size: song.size, bold: false }], colors.faded, {
              maxWidth: textWidth,
            }),
          ],
          0,
          'start',
        );
        const [first, second] = metrics.map((metric) =>
          appText([{ text: written(metric), size: time.size, bold: false }], colors.faded),
        );
        const hasSecond = metrics.length > 1;
        // The bar between the times, `gap` away from each, however long they are.
        const barLeft = Math.max(bar.left, time.inset + first.width + bar.gap);
        const barRight = hasSecond
          ? Math.min(bar.right, MUSIC.width - time.inset - second.width - bar.gap)
          : bar.right;
        const barWidth = barRight - barLeft;
        const barMiddle = bar.y + bar.height / 2;
        const middle = MUSIC.width / 2;
        return placed(MUSIC.width, MUSIC.height, [
          { box: fillBox(MUSIC.width, MUSIC.height, MUSIC.radius, colors.card, glass), x: 0, y: 0 },
          { box: art, x: cover.x, y: cover.y },
          { box: texts, x: song.x, y: cover.y + (cover.size - texts.height) / 2 },
          { box: symbolBox('waveform', wave.size, colors.faded), x: wave.x, y: wave.y },
          {
            box: fillBox(barWidth, bar.height, bar.height / 2, colors.track, {}),
            x: barLeft,
            y: bar.y,
          },
          {
            box: fillBox(barWidth * MUSIC_PLAYED, bar.height, bar.height / 2, colors.played, {}),
            x: barLeft,
            y: bar.y,
          },
          centeredAt(first, time.inset + first.width / 2, barMiddle),
          ...(hasSecond
            ? [centeredAt(second, MUSIC.width - time.inset - second.width / 2, barMiddle)]
            : []),
          centeredAt(
            symbolBox('backward', controls.skip, colors.dimmed),
            middle - controls.skipOffset,
            controls.y,
          ),
          centeredAt(symbolBox('pause', controls.pause, colors.ink), middle, controls.y),
          centeredAt(
            symbolBox('forward', controls.skip, colors.ink),
            middle + controls.skipOffset,
            controls.y,
          ),
          {
            box: symbolBox('airplay', controls.airplay, colors.faded),
            x: controls.airplayX,
            y: controls.y - controls.airplay / 2,
          },
        ]);
      }
      case 'camera': {
        // The photo seen through the camera, which frames the whole canvas: the data where its
        // settings go, the sport's icon on its f button, and the route as the last photo's
        // thumbnail.
        const colors = CAMERA_COLORS;
        const { width, height } = canvas;
        const unit = Math.min(1, height / CAMERA.storyHeight);
        const top = CAMERA.top * unit;
        const bottom = height - CAMERA.bottom * unit;
        const third = (bottom - top) / 3;
        const flat = {};
        const glass = { edge: colors.edge };
        /** A round button `size` across with `content` in its middle. */
        const button = (size: number, color: string, content: Box | null, edge?: string) =>
          [discBox(size / 2, color), ...(edge === undefined ? [] : [discBox(size / 2, edge, 2)])]
            .concat(content === null ? [] : [content])
            .reduce(overlay);
        const camText = (key: LabelKey, size: number, color: string, bold = false) =>
          appText([{ text: translate(key), size: size * unit, bold }], color);

        const data = CAMERA.data;
        const values = row(
          metrics.map((metric) =>
            appText([{ text: written(metric), size: data.size * unit, bold: true }], colors.ink),
          ),
          data.gap * unit,
          'center',
        );
        const pillHeight = data.height * unit;
        const pill = overlay(
          fillBox(
            values.width + 2 * data.pad * unit,
            pillHeight,
            pillHeight / 2,
            colors.pill,
            flat,
          ),
          values,
        );

        const lens = CAMERA.lens;
        const lensSize = lens.size * unit;
        const lensY = bottom - lens.fromBottom * unit;
        const zoom = CAMERA.zoom;

        const shutter = CAMERA.shutter;
        const shutterY = bottom + shutter.y * unit;

        const controls = CAMERA.controls;
        const controlSize = controls.size * unit;
        const controlsY = bottom + controls.y * unit;
        const route =
          activity.routePolyline === null
            ? null
            : routeBox(activity.routePolyline, controlSize * 0.55, controlSize * 0.55, {
                color: COVER_ROUTE,
                width: 3,
              });
        // The last photo is the route; without one, nothing: the f button has the sport's icon.
        const thumb =
          route === null ? null : button(controlSize, BRAND_COVER_COLORS[block.cover], route);
        const modes = CAMERA.modes;
        const chosenWidth = (modes.chosenTo - modes.chosenFrom) * unit;
        const chosenHeight = controlSize - 2 * modes.inset * unit;

        hole = { x: 0, y: top, width, height: bottom - top };
        return placed(width, height, [
          { box: fillBox(width, top, 0, colors.band, flat), x: 0, y: 0 },
          { box: fillBox(width, height - bottom, 0, colors.band, flat), x: 0, y: bottom },
          ...[1, 2].flatMap((i) => [
            {
              box: hairlineBox(0, bottom - top, CAMERA.grid, colors.grid),
              x: (width * i) / 3,
              y: top,
            },
            { box: hairlineBox(width, 0, CAMERA.grid, colors.grid), x: 0, y: top + third * i },
          ]),
          centeredAt(pill, width - data.inset * unit - pill.width / 2, top / 2),
          centeredAt(
            button(
              lensSize,
              colors.button,
              iconBox(sportIcon(activity), lensSize * lens.icon, colors.ink),
            ),
            lens.x * unit,
            lensY,
          ),
          centeredAt(
            camText('widgets.cameraZoom.wide', zoom.size, colors.ink),
            width / 2 - zoom.side * unit,
            lensY,
          ),
          centeredAt(
            button(
              lensSize,
              colors.button,
              camText('widgets.cameraZoom.main', zoom.size, colors.chosen),
            ),
            width / 2,
            lensY,
          ),
          centeredAt(
            camText('widgets.cameraZoom.tele', zoom.size, colors.ink),
            width / 2 + zoom.side * unit,
            lensY,
          ),
          centeredAt(
            button(
              2 * shutter.outer * unit,
              colors.ring,
              discBox(shutter.inner * unit, colors.shutter),
              colors.edge,
            ),
            width / 2,
            shutterY,
          ),
          ...(thumb === null ? [] : [centeredAt(thumb, controls.x * unit, controlsY)]),
          centeredAt(
            fillBox(modes.width * unit, controlSize, controlSize / 2, colors.pill, glass),
            width / 2,
            controlsY,
          ),
          {
            box: fillBox(chosenWidth, chosenHeight, chosenHeight / 2, colors.chosenPill, glass),
            x: width / 2 + modes.chosenFrom * unit,
            y: controlsY - chosenHeight / 2,
          },
          centeredAt(
            camText('widgets.cameraModes.video', modes.size, colors.ink),
            width / 2 + modes.videoX * unit,
            controlsY,
          ),
          centeredAt(
            camText('widgets.cameraModes.photo', modes.size, colors.chosen),
            width / 2 + ((modes.chosenFrom + modes.chosenTo) / 2) * unit,
            controlsY,
          ),
          centeredAt(
            button(
              controlSize,
              colors.pill,
              symbolBox('flip', controlSize * controls.symbol, colors.ink),
              colors.edge,
            ),
            width - controls.x * unit,
            controlsY,
          ),
        ]);
      }
      case 'laps': {
        // The laps as a table: number, distance, time and pace (or speed).
        const rows = splitRows(data.detail?.laps ?? [], LAPS_ROWS);
        if (rows.length === 0) {
          return null;
        }
        const speed = speedMeasure(activity.sportFamily);
        const unit = textContext.unitLabel(textContext.unit);
        // "6:07/km", as AURA writes a pace; a swimmer's pace and a speed with their unit.
        const imperial = textContext.unit === 'mi';
        const after =
          speed === 'pace'
            ? `/${unit}`
            : ` ${textContext.unitLabel(speed === 'speed' ? (imperial ? 'mph' : 'km/h') : imperial ? 'min/100yd' : 'min/100m')}`;
        return lapsTableBox(fonts, block.layout, block.cover, {
          names: [
            translate('widgets.laps.lap'),
            translate('widgets.laps.distance'),
            translate('widgets.laps.time'),
            translate(speed === 'speed' ? 'widgets.laps.speed' : 'widgets.laps.pace'),
          ],
          rows: rows.map((split) => {
            const texts = splitRowTexts(split, speed, textContext);
            return { ...texts, number: texts.number.padStart(2, '0') };
          }),
          fastest: fastestIndex(rows.map((split) => split.speed)),
          unit,
          after,
          // A pace as a timing sheet writes it: 5'42".
          sheetValue: (value) => (speed === 'speed' ? value : `${value.replace(':', "'")}"`),
          title: translate('widgets.laps.title'),
        });
      }
      case 'grandPrix': {
        // The splits as a race's timing tower, in lap order: each with its pace and its gap to
        // the fastest, which carries the fastest lap's purple stopwatch instead of a tyre.
        const rows = splitRows(splits, GRAND_PRIX_ROWS);
        if (rows.length === 0) {
          return null;
        }
        const speed = speedMeasure(activity.sportFamily);
        const speeds = rows.map((split) => split.speed);
        const fastest = fastestIndex(speeds);
        const tyres = tyreCompounds(speeds);
        return timingTowerBox(fonts, {
          icon: sportIcon(activity),
          title: translate(`modalities.${activity.sportModality}`),
          // How far the race went, exactly, where TV writes the lap.
          subtitle: written('distance'),
          rows: rows.map((split, i) => {
            const texts = splitRowTexts(split, speed, textContext);
            return {
              number: texts.number,
              value: texts.value,
              gap:
                i === fastest
                  ? translate('widgets.grandPrix.leader')
                  : splitGapText(split, rows[fastest], speed, textContext),
              mark: i === fastest ? 'fastest' : tyres[i],
            };
          }),
        });
      }
      case 'alarm': {
        // The start time as an alarm, on: the sport and the main datum as its label.
        const colors = ALARM_COLORS[block.layout];
        const clock = formatActivityDate(activity.startLocal, textContext.locale, 'time');
        // "9:31 AM": the AM or PM smaller after the time, as the Clock writes it.
        const [, time = clock, meridiem] = /^(.*?)\s*([AaPp]\.?\s?[Mm]\.?)?$/u.exec(clock) ?? [];
        const timeText = appText(
          [
            { text: time, size: ALARM.time, bold: false, light: true },
            ...(meridiem === undefined
              ? []
              : [
                  {
                    text: meridiem.replace(/[\s.]/gu, '').toLocaleUpperCase(),
                    size: ALARM.meridiem,
                    bold: false,
                    light: true,
                  },
                ]),
          ],
          colors.ink,
        );
        const label = appText(
          [
            {
              text: translate('widgets.alarmLabel', {
                sport: translate(`modalities.${activity.sportModality}`),
                datum: written(metrics[0]),
              }),
              size: ALARM.label,
              bold: false,
            },
          ],
          colors.ink,
        );
        const toggle = ALARM.toggle;
        const onSwitch = placed(toggle.width, toggle.height, [
          {
            box: fillBox(toggle.width, toggle.height, toggle.height / 2, colors.on, {}),
            x: 0,
            y: 0,
          },
          centeredAt(
            discBox(toggle.height / 2 - toggle.inset, colors.knob),
            toggle.width - toggle.height / 2,
            toggle.height / 2,
          ),
        ]);
        const texts = column([timeText, label], 0, 'start');
        const width = Math.max(ALARM.minWidth, texts.width + ALARM.gap + toggle.width);
        return panel(
          placed(width, texts.height, [
            { box: texts, x: 0, y: 0 },
            centeredAt(onSwitch, width - toggle.width / 2, texts.height / 2),
          ]),
          colors.card,
          ALARM.padX,
          ALARM.padY,
          ALARM.radius,
        );
      }
      case 'location': {
        // The place where it started and the main datum, as a location sticker.
        const place = data.place === null ? null : formatPlace(data.place, 'city');
        if (place === null) {
          return null;
        }
        const colors = LOCATION_COLORS[block.layout];
        const line = translate('widgets.locationLine', { place, datum: written(metrics[0]) });
        return panel(
          row(
            [
              symbolBox('pin', LOCATION.text * LOCATION.pin, colors.ink),
              appText([{ text: line, size: LOCATION.text, bold: false }], colors.ink, {
                font: 'spaceMono',
              }),
            ],
            LOCATION.gap,
            'center',
          ),
          colors.card,
          LOCATION.padX,
          LOCATION.padY,
          LOCATION.radius,
        );
      }
      case 'verse':
        return quotation(
          translate(`widgets.verses.${block.verse}.text`),
          translate(`widgets.verses.${block.verse}.source`),
        );
      case 'quote':
        return quotation(
          translate(`widgets.quotes.${block.quote}.text`),
          translate(`widgets.quotes.${block.quote}.author`),
        );
      case 'message': {
        // The data as a sent chat message, but the time: the sport and the activity's time go
        // where the message's time goes. Without other data, the time is the message and the
        // start time goes there.
        const colors = MESSAGE_COLORS[block.layout];
        const sizes = SIZES.message;
        const others = metrics.filter((metric) => metric !== 'movingTime');
        const footTime =
          others.length > 0 && metrics.includes('movingTime')
            ? written('movingTime')
            : formatActivityDate(activity.startLocal, textContext.locale, 'time');
        const said = others.length > 0 ? others.slice(0, 2) : metrics;
        const message = appText(
          said.map((metric, i) => {
            const written = metricText(activity, metric, textContext);
            const unit = written.unit === null ? '' : ` ${textContext.unitLabel(written.unit)}`;
            return {
              text: `${i === 0 ? '' : ', '}${written.value}${unit}`,
              size: sizes.text,
              bold: false,
            };
          }),
          colors.ink,
        );
        const meta = row(
          [
            appText(
              [
                {
                  text: translate('widgets.chatLine', {
                    sport: translate(`modalities.${activity.sportModality}`),
                    time: footTime,
                  }),
                  size: sizes.meta,
                  bold: false,
                },
              ],
              colors.meta,
            ),
            markBox('ticks', sizes.meta * 0.8, colors.ticks),
          ],
          sizes.meta * 0.3,
          'center',
        );
        return messageBubble(
          column(
            [message, widened(meta, Math.max(message.width, meta.width), 'end')],
            sizes.meta * 0.2,
            'start',
          ),
          colors.bubble,
        );
      }
      case 'splitBars': {
        // The splits as AURA's board: a bar per split as long as it took, the totals under it.
        const rows = splitRows(splits, SPLIT_BARS_ROWS);
        if (rows.length === 0) {
          return null;
        }
        const sizes = SPLIT_BARS;
        const { colors } = sizes;
        const speed = speedMeasure(activity.sportFamily);
        const wide = (content: string, size: number, bold: boolean, shadow = false) =>
          appText([{ text: content.toLocaleUpperCase(), size, bold }], colors.ink, {
            font: 'unbounded',
            shadow,
          });
        const names = spread(
          wide(translate(`widgets.splitBars.${textContext.unit}`), sizes.header, true, true),
          wide(
            translate(speed === 'speed' ? 'widgets.laps.speed' : 'widgets.laps.pace'),
            sizes.header,
            true,
            true,
          ),
          sizes.width,
        );
        // How long each split took per unit: the slowest gets the longest bar.
        const times = rows.map((split) => (split.speed > 0 ? 1 / split.speed : 0));
        const quickest = Math.min(...times);
        const slowest = Math.max(...times);
        const share = (time: number) =>
          slowest === quickest
            ? (sizes.shortest + sizes.longest) / 2
            : sizes.shortest +
              ((sizes.longest - sizes.shortest) * (time - quickest)) / (slowest - quickest);
        const lines = rows.map((split, i) => {
          const texts = splitRowTexts(split, speed, textContext);
          const value = wide(texts.value, sizes.value, false);
          const number = wide(
            split.first === split.last ? texts.number.padStart(2, '0') : texts.number,
            sizes.number,
            true,
          );
          // Never shorter than its time.
          const bar = Math.max(sizes.width * share(times[i]), value.width + 2 * sizes.pad);
          return placed(sizes.width, sizes.rowHeight, [
            { box: fillBox(sizes.width, sizes.rowHeight, 0, colors.band, {}), x: 0, y: 0 },
            { box: fillBox(bar, sizes.rowHeight, 0, colors.bar, {}), x: sizes.width - bar, y: 0 },
            { box: number, x: sizes.pad * 0.7, y: sizes.pad * 0.4 },
            {
              box: value,
              x: sizes.width - sizes.pad - value.width,
              y: (sizes.rowHeight - value.height) / 2,
            },
          ]);
        });
        const total = (metric: MetricId) =>
          appText([{ text: written(metric), size: sizes.total, bold: true }], colors.ink, {
            shadow: true,
          });
        return column(
          [
            column([names, column(lines, sizes.rowGap, 'start')], sizes.headerGap, 'start'),
            spread(total('distance'), total('movingTime'), sizes.width),
          ],
          sizes.totalGap,
          'start',
        );
      }
      case 'splitLadder': {
        // The splits as a ladder of tags, each as wide as it was fast, the fastest in a brand
        // color.
        const rows = splitRows(splits, SPLIT_LADDER_ROWS);
        if (rows.length === 0) {
          return null;
        }
        const sizes = SPLIT_LADDER;
        const { colors } = sizes;
        const speed = speedMeasure(activity.sportFamily);
        const speeds = rows.map((split) => split.speed);
        const fastest = fastestIndex(speeds);
        const slowest = Math.min(...speeds);
        const mono = (content: string, color: string) =>
          appText([{ text: content, size: sizes.text, bold: false }], color, { font: 'spaceMono' });
        const cells = rows.map((split, i) => {
          const texts = splitRowTexts(split, speed, textContext);
          const ink = i === fastest ? colors.chosen : colors.ink;
          return { number: mono(texts.number, ink), value: mono(texts.value, ink) };
        });
        const narrowest =
          2 * sizes.padX +
          Math.max(...cells.map((cell) => cell.number.width)) +
          sizes.gap +
          Math.max(...cells.map((cell) => cell.value.width));
        const tags = cells.map((cell, i) => {
          const share =
            speeds[fastest] === slowest ? 1 : (speeds[i] - slowest) / (speeds[fastest] - slowest);
          const width = narrowest * (1 + (sizes.stretch - 1) * share);
          const middle = (box: Box) => (sizes.rowHeight - box.height) / 2;
          return placed(width, sizes.rowHeight, [
            {
              box: fillBox(
                width,
                sizes.rowHeight,
                sizes.radius,
                i === fastest ? BRAND_COVER_COLORS[block.cover] : colors.tag,
              ),
              x: 0,
              y: 0,
            },
            { box: cell.number, x: sizes.padX, y: middle(cell.number) },
            { box: cell.value, x: width - sizes.padX - cell.value.width, y: middle(cell.value) },
          ]);
        });
        const title = appText(
          [{ text: translate('widgets.splitLadder.title'), size: sizes.title, bold: false }],
          colors.title,
          { font: 'spaceMono', shadow: true },
        );
        return column([title, column(tags, sizes.rowGap, 'start')], sizes.titleGap, 'start');
      }
      case 'verified': {
        // The main datum in words, verified.
        const color = VERIFIED_COLORS[block.layout];
        const badge = VERIFIED.text * VERIFIED.badge;
        return row(
          [
            appText(
              [{ text: inWords(metrics[0], 'verified'), size: VERIFIED.text, bold: true }],
              color,
              {
                shadow: true,
              },
            ),
            overlay(
              symbolBox('badge', badge, VERIFIED.blue),
              symbolBox('check', badge, VERIFIED.check),
            ),
          ],
          VERIFIED.text * VERIFIED.gap,
          'center',
        );
      }
      case 'chat': {
        // A phrase as a sent chat message: the second datum where the time goes, the main one by
        // the read ticks.
        const colors = MESSAGE_COLORS[block.layout];
        const said = appText(
          [
            {
              text:
                typeof block.phrase === 'string'
                  ? translate(`widgets.phrases.${block.phrase}`)
                  : block.phrase.own,
              size: CHAT.text,
              bold: false,
            },
          ],
          colors.ink,
          { wrapWidth: CHAT.wrap, wrapStart: true },
        );
        const meta = (metric: MetricId) =>
          appText([{ text: written(metric), size: CHAT.meta, bold: false }], colors.meta);
        const read = row(
          [meta(metrics[0]), markBox('ticks', CHAT.meta * 0.8, colors.ticks)],
          CHAT.meta * 0.3,
          'center',
        );
        const line =
          metrics.length > 1
            ? (() => {
                const other = meta(metrics[1]);
                return spread(
                  other,
                  read,
                  Math.max(said.width, other.width + CHAT.metaGap + read.width),
                );
              })()
            : widened(read, said.width, 'end');
        return messageBubble(column([said, line], CHAT.meta * 0.2, 'start'), colors.bubble);
      }
      case 'sentence': {
        // The activity as a sentence typed on paper, its data highlighted.
        const place = data.place === null ? null : formatPlace(data.place, 'cityRegion');
        const plan = sentencePlan(activity, place !== null);
        if (plan === null) {
          return null;
        }
        const values: Readonly<Record<string, SentencePart>> = {
          // Before a sport's own word, the distance reads as one word with it ("11.34 kilometer
          // run"); before a sport's name, it is a number of kilometers.
          distance: markedPart(
            inWords('distance', plan.lead.lead === 'distance' ? 'verified' : 'sentence'),
          ),
          time: markedPart(inWords('movingTime', 'sentence')),
          sport: {
            text: translate(`modalities.${activity.sportModality}`).toLocaleLowerCase(
              textContext.locale,
            ),
            marked: false,
          },
          place: { text: place ?? '', marked: false },
          ...Object.fromEntries(
            plan.clauses.flatMap(({ clause, metric }) =>
              metric === null || clause === 'time' ? [] : [[clause, markedPart(written(metric))]],
            ),
          ),
        };
        return highlightedSentenceBox(
          fonts,
          sentenceParts(
            (holders) => [
              translate(`widgets.sentence.leads.${plan.lead.lead}`, holders),
              ...plan.clauses.map(({ clause }) =>
                translate(`widgets.sentence.clauses.${clause}`, holders),
              ),
              translate('widgets.sentence.end'),
            ],
            values,
          ),
        );
      }
      case 'receipt': {
        // The data as a shop's receipt: a line each, the main datum as the total.
        const name = activity.name.trim();
        return receiptBox(fonts, {
          header: [
            ...(name === '' ? [] : [name]),
            [
              formatActivityDate(activity.startLocal, textContext.locale, 'numeric'),
              formatActivityDate(activity.startLocal, textContext.locale, 'time'),
            ].join('  '),
          ],
          items: metrics.map((metric) => ({
            name: translate(`metrics.${metric}`),
            value: written(metric),
          })),
          totals: [{ name: translate('widgets.receipt.total'), value: written(metrics[0]) }],
          thanks: translate('widgets.receipt.thanks'),
          seed: activity.id,
        });
      }
      case 'boardingPass': {
        // The activity as a flight from its start to its finish, in the city it started in.
        const departure = formatActivityDate(activity.startLocal, textContext.locale, 'time');
        const arrival = formatTimeAfter(
          activity.startLocal,
          activity.elapsedTimeSeconds,
          textContext.locale,
        );
        const distance = metrics.includes('distance')
          ? metricText(activity, 'distance', textContext)
          : null;
        const unit =
          distance === null || distance.unit === null ? null : textContext.unitLabel(distance.unit);
        // Its band names the city it started in, as a pass names its destination; while the
        // place is unknown, it says what it is.
        const city = data.place === null ? null : formatPlace(data.place, 'city');
        return boardingPassBox(fonts, block.cover, {
          title: city ?? translate('widgets.boardingPass.title'),
          mark: sportIcon(activity),
          // From no distance at the start to all of it at the finish, under their times; without
          // a distance, the times alone.
          departure:
            distance === null
              ? { big: departure, unit: null, under: null }
              : { big: '0', unit, under: departure },
          arrival:
            distance === null
              ? { big: arrival, unit: null, under: null }
              : { big: distance.value, unit, under: arrival },
          names: {
            departure: translate('widgets.boardingPass.departure'),
            arrival: translate('widgets.boardingPass.arrival'),
          },
          fields: [
            {
              name: translate('widgets.boardingPass.date'),
              value: formatActivityDate(activity.startLocal, textContext.locale, 'short'),
            },
            ...metrics
              .filter((metric) => metric !== 'distance')
              .slice(0, 3)
              .map((metric) => ({ name: translate(`metrics.${metric}`), value: written(metric) })),
          ],
          seed: activity.id,
        });
      }
    }
  })();
  if (body === null) {
    return null;
  }

  // A replica is the app's own view: no signature under it.
  return finishBlock(body, layer, !isAppReplica(block.design), hole);
}

/**
 * A block's `body` finished: signed with the AllRun name under it when the layer asks for its
 * `logo` and the design is `signable` (a replica is the app's own view: no signature), on its
 * backdrop when it has one, and drawn centered on (0, 0); `hole` is its see-through part.
 */
export function finishBlock(
  body: Box,
  { logo, style }: { readonly logo: boolean; readonly style: BlockStyle },
  signable: boolean,
  hole?: HitHole,
): PreparedBlock {
  const signed = logo && signable ? column([body, logoBox(LOGO_WIDTH)], LOGO_GAP, 'center') : body;
  // On a backdrop (only data widgets offer one), as a text widget: a box of the color opposite
  // to its texts', translucent or solid, padded in proportion.
  const backdrop = style.backdrop ?? 'none';
  const whole =
    backdrop === 'none'
      ? signed
      : (() => {
          const pad = Math.max(BLOCK_BACKDROP.minPad, signed.height * BLOCK_BACKDROP.padding);
          const width = signed.width + 2 * pad * BLOCK_BACKDROP.wider;
          const height = signed.height + 2 * pad;
          return overlay(
            fillBox(
              width,
              height,
              Math.min(pad * BLOCK_BACKDROP.radius, height / 2),
              backdrop === 'solid' ? contrastingInk(style.color) : softBackdrop(style.color),
              {},
            ),
            signed,
          );
        })();
  return {
    width: whole.width,
    height: whole.height,
    ...(hole === undefined ? {} : { hole }),
    content: (
      <BlockArt
        pieces={whole.place(0, 0)}
        color={style.color}
        width={whole.width}
        height={whole.height}
      />
    ),
  };
}

/**
 * The tail of a sent message, out of its bubble's top right corner at (`x`, `y`): it covers the
 * rounded corner and points right. A path of its own, so it never cuts into the bubble.
 */
function messageTailPath(x: number, y: number): SkPath {
  const builder = Skia.PathBuilder.Make();
  builder.moveTo(x - MESSAGE_RADIUS, y);
  builder.lineTo(x + MESSAGE_TAIL - 4, y);
  builder.quadTo(x + MESSAGE_TAIL + 2, y, x + MESSAGE_TAIL - 2, y + 6);
  builder.lineTo(x, y + MESSAGE_RADIUS * 1.1);
  builder.lineTo(x - MESSAGE_RADIUS, y + MESSAGE_RADIUS * 1.1);
  builder.close();
  return builder.detach();
}

/**
 * The outline of a sheet of paper (see `Piece`): a receipt's, torn in teeth at its top and bottom,
 * or a boarding pass's, its corners rounded and a round notch on each side at its cut.
 */
function paperPath(piece: Extract<Piece, { kind: 'paper' }>): SkPath {
  const { x, y, width, height } = piece;
  const builder = Skia.PathBuilder.Make();
  if (piece.shape === 'receipt') {
    const teeth = Math.max(1, Math.round(width / (2 * RECEIPT.tooth)));
    const step = width / teeth;
    const depth = RECEIPT.tooth * 0.7;
    builder.moveTo(x, y + depth);
    for (let i = 0; i < teeth; i++) {
      builder.lineTo(x + step * (i + 0.5), y);
      builder.lineTo(x + step * (i + 1), y + depth);
    }
    builder.lineTo(x + width, y + height - depth);
    for (let i = teeth - 1; i >= 0; i--) {
      builder.lineTo(x + step * (i + 0.5), y + height);
      builder.lineTo(x + step * i, y + height - depth);
    }
    builder.close();
    return builder.detach();
  }
  const r = BOARDING_PASS.radius;
  const notch = BOARDING_PASS.notch;
  const cut = y + (piece.cut ?? height / 2);
  /** A quarter of a circle `r` round (cx, cy), clockwise from `start` degrees. */
  const corner = (cx: number, cy: number, start: number) =>
    builder.arcToOval({ x: cx - r, y: cy - r, width: 2 * r, height: 2 * r }, start, 90, false);
  /** Half a circle into the pass, round (cx, cut), from `start` degrees. */
  const bite = (cx: number, start: number) =>
    builder.arcToOval(
      { x: cx - notch, y: cut - notch, width: 2 * notch, height: 2 * notch },
      start,
      -180,
      false,
    );
  builder.moveTo(x + r, y);
  builder.lineTo(x + width - r, y);
  corner(x + width - r, y + r, 270);
  bite(x + width, 270);
  corner(x + width - r, y + height - r, 0);
  corner(x + r, y + height - r, 90);
  bite(x, 90);
  corner(x + r, y + r, 180);
  builder.close();
  return builder.detach();
}

/**
 * A marker's strokes over `rects`, drawn by hand (see `MARKER_WOBBLE`): each a band with straight
 * ends whose top and bottom edges lean together and waver a little, the same every time for the
 * same place (seeded by it), so the canvas and the exported image match. Time O(w / h) per band.
 */
function markerPath(rects: Extract<Piece, { kind: 'highlight' }>['rects']): SkPath {
  const builder = Skia.PathBuilder.Make();
  for (const { x, y, width, height } of rects) {
    const random = seededRandom(Math.round(x) * 7_919 + Math.round(y));
    // From one end to the other, both edges go this much up (or down), the bottom a bit less.
    const tilt = (random() * 2 - 1) * MARKER_WOBBLE.tilt * height;
    const steps = Math.max(2, Math.round(width / (MARKER_WOBBLE.step * height)));
    /** An edge's wave: a gentle drift, step by step, that never strays past `wave`. */
    const wave = () => {
      const limit = MARKER_WOBBLE.wave * height;
      let drift = 0;
      return Array.from({ length: steps + 1 }, () => {
        drift = Math.max(-limit, Math.min(limit, drift + (random() * 2 - 1) * limit * 0.8));
        return drift;
      });
    };
    const top = wave();
    const bottom = wave();
    const at = (i: number) => x + (width * i) / steps;
    const lean = (i: number) => tilt * (0.5 - i / steps);
    // Along the top from left to right, then back along the bottom: the ends are straight.
    for (let i = 0; i <= steps; i++) {
      const py = y + lean(i) + top[i];
      if (i === 0) {
        builder.moveTo(at(i), py);
      } else {
        builder.lineTo(at(i), py);
      }
    }
    for (let i = steps; i >= 0; i--) {
      builder.lineTo(at(i), y + height + lean(i) * 0.8 + bottom[i]);
    }
    builder.close();
  }
  return builder.detach();
}

/** The paper's grain over a piece's rectangle: specks scattered alike every time. */
function grainPath({ x, y, width, height }: Extract<Piece, { kind: 'grain' }>): SkPath {
  const random = seededRandom(Math.round(width) * 31 + Math.round(height));
  const builder = Skia.PathBuilder.Make();
  const count = Math.round((width * height) / GRAIN_AREA);
  for (let i = 0; i < count; i++) {
    builder.addCircle(x + random() * width, y + random() * height, 0.6 + random() * 1.2);
  }
  return builder.detach();
}

/** The back chevron of an app's bar, `size` tall, its top-left corner at (x, y). */
function chevronPath({ x, y, size }: { x: number; y: number; size: number }): SkPath {
  const builder = Skia.PathBuilder.Make();
  builder.moveTo(x + size * 0.5, y + size * 0.1);
  builder.lineTo(x + size * 0.1, y + size * 0.5);
  builder.lineTo(x + size * 0.5, y + size * 0.9);
  return builder.detach();
}

/**
 * Two read ticks, `size` tall and 1.4 times as wide, their top-left corner at (x, y), as WhatsApp
 * draws them: the second tick's short stroke is cut short, leaving air before the first tick.
 */
function ticksPath({ x, y, size }: { x: number; y: number; size: number }): SkPath {
  const builder = Skia.PathBuilder.Make();
  const shift = size * 0.4;
  builder.moveTo(x + size * 0.05, y + size * 0.55);
  builder.lineTo(x + size * 0.35, y + size * 0.85);
  builder.lineTo(x + size * 0.95, y + size * 0.15);
  // Cut well before the first tick's long stroke, with air between them.
  builder.moveTo(x + shift + size * 0.29, y + size * 0.79);
  builder.lineTo(x + shift + size * 0.35, y + size * 0.85);
  builder.lineTo(x + shift + size * 0.95, y + size * 0.15);
  return builder.detach();
}

function routePath(points: readonly Point[]): SkPath {
  const builder = Skia.PathBuilder.Make();
  points.forEach((point, i) =>
    i === 0 ? builder.moveTo(point.x, point.y) : builder.lineTo(point.x, point.y),
  );
  return builder.detach();
}

/** The icons, parsed once. */
const iconPaths = new Map<IconId, SkPath>();

function iconPath(icon: IconId): SkPath {
  const cached = iconPaths.get(icon);
  if (cached !== undefined) {
    return cached;
  }
  const path = Skia.Path.MakeFromSVGString(ICON_PATHS[icon]);
  if (path === null) {
    throw new Error(`Invalid sport icon path: ${icon}`);
  }
  iconPaths.set(icon, path);
  return path;
}

/** A path through `points` of a `size` square at (x, y), given as fractions of its side. */
function polygon(
  builder: ReturnType<typeof Skia.PathBuilder.Make>,
  { x, y, size }: { x: number; y: number; size: number },
  points: readonly (readonly [number, number])[],
  close: boolean,
): void {
  points.forEach(([px, py], i) =>
    i === 0
      ? builder.moveTo(x + px * size, y + py * size)
      : builder.lineTo(x + px * size, y + py * size),
  );
  if (close) {
    builder.close();
  }
}

/**
 * A control of an app, `size` square with its top-left corner at (x, y), as the phone draws it:
 * its filled part, and the outline drawn as a line (the AirPlay screen, the flip's arrows).
 */
function symbolPaths(piece: Extract<Piece, { kind: 'symbol' }>): {
  readonly fill: SkPath | null;
  readonly line: SkPath | null;
} {
  const fill = Skia.PathBuilder.Make();
  const line = Skia.PathBuilder.Make();
  const { x, y, size } = piece;
  switch (piece.symbol) {
    case 'backward':
    case 'forward': {
      // Two triangles tip to base, their corners rounded by the outline drawn over them.
      const toLeft = piece.symbol === 'backward';
      for (const from of [0.08, 0.5]) {
        const points: [number, number][] = toLeft
          ? [
              [from + 0.42, 0.26],
              [from + 0.42, 0.74],
              [from, 0.5],
            ]
          : [
              [from, 0.26],
              [from + 0.42, 0.5],
              [from, 0.74],
            ];
        polygon(fill, piece, points, true);
        polygon(line, piece, points, true);
      }
      break;
    }
    case 'pause':
      for (const left of [0.11, 0.62]) {
        fill.addRRect({
          rect: { x: x + left * size, y: y + 0.02 * size, width: 0.27 * size, height: 0.96 * size },
          rx: 0.08 * size,
          ry: 0.08 * size,
        });
      }
      break;
    case 'airplay': {
      // AirPlay for sound: two rings open at the bottom, where the triangle comes in.
      const cx = x + 0.5 * size;
      const cy = y + 0.44 * size;
      for (const r of [0.4, 0.22]) {
        line.addArc(
          { x: cx - r * size, y: cy - r * size, width: 2 * r * size, height: 2 * r * size },
          125,
          290,
        );
      }
      polygon(
        fill,
        piece,
        [
          [0.5, 0.6],
          [0.78, 0.96],
          [0.22, 0.96],
        ],
        true,
      );
      break;
    }
    case 'waveform':
      // The sound wave of what is playing: bars short at the ends, tall in the middle.
      [0.22, 0.55, 0.9, 0.6, 0.22].forEach((tall, i) => {
        fill.addRRect({
          rect: {
            x: x + (0.07 + i * 0.19) * size,
            y: y + ((1 - tall) / 2) * size,
            width: 0.1 * size,
            height: tall * size,
          },
          rx: 0.05 * size,
          ry: 0.05 * size,
        });
      });
      break;
    case 'flip': {
      // Two arcs round a circle, each ending in a solid arrowhead: the top one comes down on the
      // right, the bottom one goes up on the left, with a gap before the next arc.
      const r = 0.35 * size;
      const cx = x + 0.5 * size;
      const cy = y + 0.5 * size;
      const oval = { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r };
      const length = 0.21 * size;
      const half = 0.14 * size;
      for (const start of [225, 45]) {
        line.addArc(oval, start, 135);
        const end = ((start + 135) * Math.PI) / 180;
        const endX = cx + r * Math.cos(end);
        const endY = cy + r * Math.sin(end);
        // Along the circle (clockwise) and across it.
        const alongX = -Math.sin(end);
        const alongY = Math.cos(end);
        const acrossX = Math.cos(end);
        const acrossY = Math.sin(end);
        fill.moveTo(endX + acrossX * half, endY + acrossY * half);
        fill.lineTo(endX + alongX * length, endY + alongY * length);
        fill.lineTo(endX - acrossX * half, endY - acrossY * half);
        fill.close();
      }
      break;
    }
    case 'pin': {
      // A map pin's outline: a circle drawn down to a tip, the lines from the tip touching it,
      // with a round hole.
      const r = 0.3 * size;
      const cx = x + 0.5 * size;
      const cy = y + 0.38 * size;
      const tipY = y + 0.95 * size;
      // The lines from the tip touch the circle this far round from straight down.
      const turn = (Math.acos(r / (tipY - cy)) * 180) / Math.PI;
      line.moveTo(cx, tipY);
      line.arcToOval(
        { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r },
        90 + turn,
        360 - 2 * turn,
        false,
      );
      line.close();
      line.addCircle(cx, cy, 0.12 * size);
      break;
    }
    case 'stopwatch': {
      // The fastest lap's stopwatch: a dial with its hand, and the crown on top.
      const r = 0.3 * size;
      const cx = x + 0.5 * size;
      const cy = y + 0.56 * size;
      line.addCircle(cx, cy, r);
      line.moveTo(cx, cy);
      line.lineTo(cx + 0.12 * size, cy - 0.12 * size);
      line.moveTo(cx, cy - r);
      line.lineTo(cx, y + 0.17 * size);
      fill.addRRect({
        rect: { x: cx - 0.1 * size, y: y + 0.08 * size, width: 0.2 * size, height: 0.09 * size },
        rx: 0.03 * size,
        ry: 0.03 * size,
      });
      break;
    }
    case 'badge': {
      // Instagram's verified badge: a round seal with scalloped edges.
      const cx = x + 0.5 * size;
      const cy = y + 0.5 * size;
      const steps = 120;
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        const r = size * (0.465 + 0.035 * Math.cos(VERIFIED.scallops * angle));
        const px = cx + r * Math.sin(angle);
        const py = cy - r * Math.cos(angle);
        if (i === 0) {
          fill.moveTo(px, py);
        } else {
          fill.lineTo(px, py);
        }
      }
      fill.close();
      break;
    }
    case 'check':
      polygon(
        line,
        piece,
        [
          [0.3, 0.51],
          [0.44, 0.65],
          [0.71, 0.37],
        ],
        false,
      );
      break;
  }
  return {
    fill: fill.isEmpty() ? null : fill.detach(),
    line: line.isEmpty() ? null : line.detach(),
  };
}

/** A replica's own mark, in its app's colors and without a shadow; `null` for other pieces. */
function appMark(piece: Piece, i: number): ReactElement | null {
  switch (piece.kind) {
    case 'chevron':
    case 'ticks':
      return (
        <Path
          key={i}
          path={piece.kind === 'chevron' ? chevronPath(piece) : ticksPath(piece)}
          style="stroke"
          strokeWidth={piece.size * 0.12}
          strokeCap="round"
          strokeJoin="round"
          color={piece.color}
        />
      );
    case 'icon':
      return piece.color === undefined ? null : (
        <Group
          key={i}
          transform={[
            { translateX: piece.x },
            { translateY: piece.y },
            { scale: piece.size / SPORT_ICON_SIZE },
            { translateY: SPORT_ICON_SIZE },
          ]}
        >
          <Path path={iconPath(piece.icon)} color={piece.color} />
        </Group>
      );
    case 'route':
      return piece.color === undefined ? null : (
        <Path
          key={i}
          path={routePath(piece.points)}
          style="stroke"
          strokeWidth={piece.width ?? ROUTE_STROKE}
          strokeCap="round"
          strokeJoin="round"
          color={piece.color}
        />
      );
    case 'disc':
      return (
        <Circle
          key={i}
          c={{ x: piece.cx, y: piece.cy }}
          r={piece.stroke === undefined ? piece.r : piece.r - piece.stroke / 2}
          color={piece.color}
          style={piece.stroke === undefined ? 'fill' : 'stroke'}
          strokeWidth={piece.stroke ?? 0}
        />
      );
    case 'symbol': {
      const { fill, line } = symbolPaths(piece);
      // Fill and outline overlap: drawn solid and faded together, a faded control shows no seams.
      const color = Skia.Color(piece.color);
      const opacity = color[3];
      color[3] = 1;
      return (
        <Group key={i} layer={opacity < 1 ? <Paint opacity={opacity} /> : undefined}>
          {fill === null ? null : <Path path={fill} color={color} />}
          {line === null ? null : (
            <Path
              path={line}
              style="stroke"
              strokeWidth={piece.size * 0.08}
              strokeCap="round"
              strokeJoin="round"
              color={color}
            />
          )}
        </Group>
      );
    }
    case 'panel':
      return piece.flat === true ? (
        <Group key={i}>
          <RoundedRect
            x={piece.x}
            y={piece.y}
            width={piece.width}
            height={piece.height}
            r={piece.radius}
            color={piece.color}
          />
          {piece.edge === undefined ? null : (
            <RoundedRect
              x={piece.x + GLASS_EDGE / 2}
              y={piece.y + GLASS_EDGE / 2}
              width={piece.width - GLASS_EDGE}
              height={piece.height - GLASS_EDGE}
              r={piece.radius - GLASS_EDGE / 2}
              color={piece.edge}
              style="stroke"
              strokeWidth={GLASS_EDGE}
            />
          )}
        </Group>
      ) : null;
    case 'shade':
      return (
        <Group
          key={i}
          clip={Skia.RRectXY(
            Skia.XYWHRect(piece.card.x, piece.card.y, piece.card.width, piece.card.height),
            piece.card.radius,
            piece.card.radius,
          )}
        >
          <Rect x={piece.x} y={piece.y} width={piece.width} height={piece.height}>
            <LinearGradient
              start={{ x: piece.x, y: piece.y }}
              end={{ x: piece.x, y: piece.y + piece.height }}
              colors={[...piece.colors]}
            />
          </Rect>
        </Group>
      );
    case 'grain':
      return <Path key={i} path={grainPath(piece)} color={piece.color} />;
    case 'highlight':
      return <Path key={i} path={markerPath(piece.rects)} color={piece.color} />;
    case 'hairline':
      return (
        <Line
          key={i}
          p1={{ x: piece.x1, y: piece.y1 }}
          p2={{ x: piece.x2, y: piece.y2 }}
          color={piece.color}
          strokeWidth={piece.width}
        />
      );
    case 'logo':
      return piece.color === undefined ? null : (
        <Group key={i} transform={[{ translateX: piece.x }, { translateY: piece.y }]}>
          <PlainWordmark color={piece.color} width={piece.width} />
        </Group>
      );
    case 'mark':
      return (
        <Group key={i} transform={[{ translateX: piece.x }, { translateY: piece.y }]}>
          <PlainMark color={piece.color} height={piece.height} />
        </Group>
      );
    case 'text':
    case 'messageTail':
    case 'paper':
      return null;
  }
}

/**
 * Draws a block's pieces centered on (0, 0): its shapes under one shadow (one blur for all of
 * them), then its texts, which carry their own.
 */
function BlockArt({
  pieces,
  color,
  width,
  height,
}: {
  readonly pieces: readonly Piece[];
  readonly color: string;
  readonly width: number;
  readonly height: number;
}) {
  const shapes = pieces.flatMap((piece, i) => {
    switch (piece.kind) {
      case 'text':
      case 'panel':
      case 'paper':
      case 'grain':
      case 'highlight':
      case 'shade':
      case 'hairline':
      case 'messageTail':
      case 'chevron':
      case 'ticks':
      case 'symbol':
      case 'disc':
      case 'mark':
        return [];
      case 'icon':
        return piece.color !== undefined
          ? []
          : [
              <Group
                key={i}
                transform={[
                  { translateX: piece.x },
                  { translateY: piece.y },
                  { scale: piece.size / SPORT_ICON_SIZE },
                  // Material Symbols draw from (0, -960) down to (960, 0).
                  { translateY: SPORT_ICON_SIZE },
                ]}
              >
                <Path path={iconPath(piece.icon)} color={piece.color ?? color} />
              </Group>,
            ];
      case 'logo':
        return piece.color !== undefined
          ? []
          : [
              <Group key={i} transform={[{ translateX: piece.x }, { translateY: piece.y }]}>
                <PlainWordmark color={color} width={piece.width} />
              </Group>,
            ];
      case 'route':
        return piece.color !== undefined
          ? []
          : [
              <Path
                key={i}
                path={routePath(piece.points)}
                style="stroke"
                strokeWidth={piece.width ?? ROUTE_STROKE}
                strokeCap="round"
                strokeJoin="round"
                color={color}
              />,
            ];
    }
  });
  return (
    <Group transform={[{ translateX: -width / 2 }, { translateY: -height / 2 }]}>
      {/* A replica's card lifts off the photo with a shadow, whatever its color. */}
      <Group
        layer={
          <Paint>
            <DropShadow />
          </Paint>
        }
      >
        {pieces.map((piece, i) =>
          piece.kind === 'panel' && piece.flat !== true ? (
            <RoundedRect
              key={i}
              x={piece.x}
              y={piece.y}
              width={piece.width}
              height={piece.height}
              r={piece.radius}
              color={piece.color}
            />
          ) : piece.kind === 'messageTail' ? (
            <Path key={i} path={messageTailPath(piece.x, piece.y)} color={piece.color} />
          ) : piece.kind === 'paper' ? (
            <Path key={i} path={paperPath(piece)} color={piece.color} />
          ) : null,
        )}
      </Group>
      {/* Its marks are part of the app: no shadow on them. */}
      {pieces.map(appMark)}
      <Group
        layer={
          castsShadow(color) ? (
            <Paint>
              <DropShadow />
            </Paint>
          ) : undefined
        }
      >
        {shapes}
      </Group>
      {pieces.map((piece, i) => {
        if (piece.kind !== 'text') {
          return null;
        }
        const width = Math.ceil(piece.paragraph.getLongestLine()) + 1;
        const text =
          piece.stretch !== undefined || piece.scale !== undefined ? (
            // The shadow's layer is outside the stretch, so the shadow is cast once stretched.
            <Group
              key={i}
              layer={
                piece.shadow === true ? (
                  <Paint>
                    <DropShadow />
                  </Paint>
                ) : undefined
              }
            >
              <Group
                transform={[
                  { translateX: piece.x },
                  { translateY: piece.y },
                  { scale: piece.scale ?? 1 },
                  { scaleY: piece.stretch ?? 1 },
                ]}
              >
                <Paragraph paragraph={piece.paragraph} x={0} y={0} width={width} />
              </Group>
            </Group>
          ) : (
            <Paragraph key={i} paragraph={piece.paragraph} x={piece.x} y={piece.y} width={width} />
          );
        return piece.turn === undefined ? (
          text
        ) : (
          <Group
            key={i}
            transform={[
              { translateX: piece.turn.x },
              { translateY: piece.turn.y + piece.turn.length },
              { rotate: -Math.PI / 2 },
            ]}
          >
            {text}
          </Group>
        );
      })}
    </Group>
  );
}
