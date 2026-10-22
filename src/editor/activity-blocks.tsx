import {
  Circle,
  FontWeight,
  Group,
  Line,
  Paint,
  Paragraph,
  Path,
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
  isAppReplica,
  sportIcon,
  type SportIconId,
} from '@/core/activity-block';
import { splitRows } from '@/core/activity-charts';
import { castsShadow } from '@/core/layer-style';
import type { MetricId } from '@/core/metrics';
import { decodePolyline } from '@/core/polyline';
import { DEFAULT_PRIVACY_TRIM_METERS, trimRouteEnds } from '@/core/route-privacy';
import { type Point, projectRoutes } from '@/core/route-projection';
import type { HitHole } from '@/core/layer-transform';
import type { Size } from '@/core/photo-framing';
import type { FontId, Layer } from '@/core/template';
import { formatActivityDate, formatShortWeekday } from '@/ui/format';

import { PlainWordmark, wordmarkHeight } from './brand/brand-art';
import {
  type ActivityData,
  type LabelKey,
  metricText,
  speedMeasure,
  splitRowTexts,
  type TextContext,
} from './editor-data';
import { FONT_FAMILIES } from './fonts';
import { SPORT_ICON_PATHS, SPORT_ICON_SIZE } from './icons/sport-icons.generated';
import { addLeanRoom, DropShadow, slantOf, textShadows } from './scene-text';

/**
 * The mixed widgets of an activity (ADR 009): several of its data in one designed block, laid out
 * from measured texts. Each design is a composition of boxes (texts, columns, rows, rules, the
 * sport's icon), measured first and then placed, so a block is exactly as big as what it holds in
 * any font. Its content is centered on (0, 0), like every layer's.
 */

type BlockLayer = Extract<Layer, { kind: 'activityBlock' }>;
type BlockStyle = BlockLayer['style'];

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
      /** Turned to read upwards, its top-left corner still at (x, y). */
      readonly turned?: boolean;
      /** Drawn this many times taller than it is laid out (see `STRETCHED_FONTS`). */
      readonly stretch?: number;
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
      readonly kind: 'rule';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    }
  | { readonly kind: 'dot'; readonly x: number; readonly y: number }
  | {
      readonly kind: 'icon';
      readonly icon: SportIconId;
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
  | { readonly kind: 'logo'; readonly x: number; readonly y: number; readonly width: number }
  | {
      readonly kind: 'route';
      readonly points: readonly Point[];
      /** A replica's own color and width for it; the block's color and `ROUTE_STROKE` when absent. */
      readonly color?: string;
      readonly width?: number;
    };

/** The controls of the apps a replica recreates. */
type AppSymbol = 'backward' | 'pause' | 'forward' | 'airplay' | 'waveform' | 'flip';

/** A measured part of a block, which places its pieces with its top-left corner at (x, y). */
interface Box {
  readonly width: number;
  readonly height: number;
  readonly place: (x: number, y: number) => Piece[];
}

type Align = 'start' | 'center' | 'end';

/** Where a `size` long box starts within `span` when aligned. */
const offset = (align: Align, size: number, span: number): number =>
  align === 'start' ? 0 : align === 'end' ? span - size : (span - size) / 2;

/** Boxes one under another, `gap` apart, aligned across. */
function column(boxes: readonly Box[], gap: number, align: Align): Box {
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

/** Boxes side by side, `gap` apart, aligned up and down. */
function row(boxes: readonly Box[], gap: number, align: Align): Box {
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
function widened(box: Box, width: number, align: Align): Box {
  const span = Math.max(width, box.width);
  return {
    width: span,
    height: box.height,
    place: (x, y) => box.place(x + offset(align, box.width, span), y),
  };
}

/** `left` at the start and `right` at the end of a `width` wide line, bottoms lined up. */
function spread(left: Box, right: Box, width: number): Box {
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
function justified(boxes: readonly Box[], width: number, minGap: number): Box {
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
function placed(
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
function overlay(back: Box, front: Box): Box {
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

/** Boxes in rows, each column as wide as its widest box, its boxes aligned to `align`. */
function grid(rows: readonly (readonly Box[])[], gapX: number, gapY: number, align: Align): Box {
  const columns = Math.max(0, ...rows.map((cells) => cells.length));
  const widths = Array.from({ length: columns }, (_, i) =>
    Math.max(0, ...rows.map((cells) => cells[i]?.width ?? 0)),
  );
  return column(
    rows.map((cells) =>
      row(
        cells.map((cell, i) => widened(cell, widths[i], align)),
        gapX,
        'end',
      ),
    ),
    gapY,
    'start',
  );
}

/** Width of a block's rules, before the layer's scale. */
const RULE_WIDTH = 3;
/** Radius of the dots between data in one line. */
const DOT_RADIUS = 7;

/** Boxes side by side with an upright rule between each two, as tall as the tallest. */
function divided(boxes: readonly Box[], gap: number): Box {
  const height = Math.max(0, ...boxes.map((box) => box.height));
  const rule: Box = {
    width: RULE_WIDTH,
    height,
    place: (x, y) => [
      { kind: 'rule', x1: x + RULE_WIDTH / 2, y1: y, x2: x + RULE_WIDTH / 2, y2: y + height },
    ],
  };
  return row(
    boxes.flatMap((box, i) => (i === 0 ? [box] : [rule, box])),
    gap,
    'center',
  );
}

/** Boxes side by side with a dot between each two. */
function dotted(boxes: readonly Box[], gap: number): Box {
  const dot: Box = {
    width: DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    place: (x, y) => [{ kind: 'dot', x: x + DOT_RADIUS, y: y + DOT_RADIUS }],
  };
  return row(
    boxes.flatMap((box, i) => (i === 0 ? [box] : [dot, box])),
    gap,
    'center',
  );
}

/** A level rule `width` long. */
const ruleAcross = (width: number): Box => ({
  width,
  height: RULE_WIDTH,
  place: (x, y) => [
    { kind: 'rule', x1: x, y1: y + RULE_WIDTH / 2, x2: x + width, y2: y + RULE_WIDTH / 2 },
  ],
});

const iconBox = (icon: SportIconId, size: number, color?: string): Box => ({
  width: size,
  height: size,
  place: (x, y) => [{ kind: 'icon', icon, x, y, size, ...(color === undefined ? {} : { color }) }],
});

const logoBox = (width: number): Box => ({
  width,
  height: wordmarkHeight(width),
  place: (x, y) => [{ kind: 'logo', x, y, width }],
});

/** Width of a block's route, before the layer's scale. */
const ROUTE_STROKE = 8;

/**
 * The route of `polyline` (its private ends trimmed) as big as fits a `width` × `height` box,
 * shrunk to its own extent plus the stroke, or `null` when nothing is left to draw. A replica
 * draws it in a `look` of its own: a color and a line width.
 */
function routeBox(
  polyline: string,
  width: number,
  height: number,
  look?: { readonly color: string; readonly width: number },
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
const symbolBox = (symbol: AppSymbol, size: number, color: string): Box => ({
  width: size,
  height: size,
  place: (x, y) => [{ kind: 'symbol', symbol, x, y, size, color }],
});

/** A round button `r` in radius: filled, or a ring `stroke` wide. */
const discBox = (r: number, color: string, stroke?: number): Box => ({
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
const fillBox = (
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
const hairlineBox = (dx: number, dy: number, width: number, color: string): Box => ({
  width: dx,
  height: dy,
  place: (x, y) => [{ kind: 'hairline', x1: x, y1: y, x2: x + dx, y2: y + dy, width, color }],
});

const textBox = (paragraph: SkParagraph): Box => ({
  width: Math.ceil(paragraph.getLongestLine()) + 1,
  height: paragraph.getHeight(),
  place: (x, y) => [{ kind: 'text', paragraph, x, y }],
});

/** A text turned to read upwards: as tall as the text is long. */
const turnedBox = (paragraph: SkParagraph): Box => ({
  width: paragraph.getHeight(),
  height: Math.ceil(paragraph.getLongestLine()) + 1,
  place: (x, y) => [{ kind: 'text', paragraph, x, y, turned: true }],
});

/** `box` on a replica's card of `color`, `padX` and `padY` inside its edges. */
const panel = (box: Box, color: string, padX: number, padY: number, radius: number): Box => {
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
const markBox = (kind: 'chevron' | 'ticks', size: number, color: string): Box => ({
  width: kind === 'ticks' ? size * 1.4 : size * 0.6,
  height: size,
  place: (x, y) => [{ kind, x, y, size, color }],
});

/** One stretch of a text with its own size and weight. */
interface Run {
  readonly text: string;
  readonly size: number;
  readonly bold: boolean;
  /** Written fainter: names of data and other secondary texts. */
  readonly faded?: boolean;
  /** Room after each letter, as a fraction of the size. */
  readonly spacing?: number;
}

/** How opaque faded texts and rules are. */
const FADED_ALPHA = 0.72;
const RULE_ALPHA = 0.45;
/** A layout width no text reaches: lines only break where the text does. */
const NO_WRAP_WIDTH = 1_000_000;

/**
 * Lays out runs in the block's font and color, on one line, shrunk to fit them; with the drop
 * shadow of its color unless `shadow` is off (a text on a bubble needs none). A line longer than
 * `maxWidth` is cut short with an ellipsis, as apps cut a long title.
 */
function paragraph(
  runs: readonly Run[],
  fonts: SkTypefaceFontProvider,
  style: BlockStyle,
  shadow = true,
  maxWidth = NO_WRAP_WIDTH,
) {
  const tightening = TIGHT_FONTS[style.font] ?? 0;
  const shadows = shadow ? textShadows(style.color) : [];
  const build = (cut: boolean) => {
    const builder = Skia.ParagraphBuilder.Make(
      cut
        ? { textAlign: TextAlign.Left, maxLines: 1, ellipsis: '…' }
        : { textAlign: TextAlign.Left },
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
          fontFamilies: [FONT_FAMILIES[style.font]],
          fontSize: run.size,
          fontStyle: {
            weight: run.bold ? FontWeight.Bold : FontWeight.Normal,
            slant: slantOf(style.italic),
          },
          letterSpacing: run.size * ((run.spacing ?? 0) + tightening),
          shadows,
        })
        .addText(style.uppercase ? run.text.toLocaleUpperCase() : run.text)
        .pop();
    }
    if (style.italic === true && runs.length > 0) {
      addLeanRoom(builder, runs[runs.length - 1].size);
    }
    return builder.build();
  };
  const built = build(false);
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
 * Fonts set tighter in mixed widgets, as a share of their size taken from the room after each
 * letter, and drawn taller than they are, as AURA's "WED": Bowlby One SC is heavy but low and
 * wide, so its letters go close together, almost touching, and stand taller.
 */
const TIGHT_FONTS: Partial<Record<FontId, number>> = { bowlbyOneSC: -0.06 };
const STRETCHED_FONTS: Partial<Record<FontId, number>> = { bowlbyOneSC: 1.35 };

/** Size of a unit after its value, and of a datum's name over it, relative to the value. */
const UNIT_SCALE = 0.45;
const LABEL_SCALE = 0.32;
const MIN_LABEL_SIZE = 24;
/** Room after each letter of a datum's name. */
const LABEL_SPACING = 0.1;

/**
 * Base sizes of each design's texts, in canvas pixels before the layer's scale, chosen for a
 * story (other formats scale the whole block, see `newLayer`).
 */
const SIZES = {
  headline: {
    stacked: { primary: 210, secondary: 72 },
    inline: { primary: 170, secondary: 62 },
    condensed: { value: 84 },
  },
  columns: { 2: 96, 3: 96, 4: 90, 6: 76 },
  route: {
    stacked: { route: { width: 560, height: 420 }, value: 66 },
    inline: { route: { width: 380, height: 380 }, value: 60 },
    between: { route: { width: 300, height: 300 }, value: 76 },
  },
  day: {
    stacked: { weekday: 170, date: 40, value: 62 },
    inline: { weekday: 130, date: 36, value: 56 },
  },
  sport: {
    centered: { icon: 150, name: 52, value: 76 },
    list: { icon: 96, name: 58, label: 34, value: 56 },
  },
  poster: { value: 250, name: 48, cell: 62 },
  tall: {
    thin: { primary: 250, secondary: 66 },
    heavy: { primary: 230, secondary: 62 },
  },
  wide: { value: 112, secondary: 44 },
  weekday: {
    grid: { weekday: 190, value: 56 },
    inline: { weekday: 140, value: 40 },
  },
  serif: { title: 40, label: 34, value: 80 },
  notes: { bar: 34, icon: 40, title: 74, row: 40 },
  message: { text: 50, meta: 26 },
} as const;

/** Most splits a note lists one by one; longer activities group them (km 1–2…). */
const NOTES_ROWS = 16;
/** Room inside a note, its corners' radius and its narrowest width. */
const NOTES_PAD = 40;
const NOTES_RADIUS = 34;
const NOTES_MIN_WIDTH = 520;

/** The iPhone's Notes in dark and light mode: the page, the text and the yellow of its accents. */
const NOTES_COLORS = {
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
const MUSIC_COLORS = {
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
const BRAND_COVER_COLORS = { red: '#C94A2E', ink: '#141B2D' } as const;
const COVER_ROUTE = '#F6F1EA';

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

/** Width of the AllRun name signing a block, and its room above. */
const LOGO_WIDTH = 190;
const LOGO_GAP = 40;
/** Narrowest a list of data is, so a short one doesn't look cramped. */
const LIST_MIN_WIDTH = 560;

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
  const metrics = blockMetrics(activity, blockDataCount(block));
  if (metrics.length === 0) {
    return null;
  }
  const text = (runs: readonly Run[]): Box => {
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
  };
  /**
   * A replica's text: in the system-like font of the apps, in `color`, without a shadow, cut short
   * with an ellipsis past `maxWidth`.
   */
  const appText = (runs: readonly Run[], color: string, maxWidth?: number) =>
    textBox(
      paragraph(
        runs,
        fonts,
        { font: 'inter', color, bold: false, uppercase: false },
        false,
        maxWidth,
      ),
    );
  /** A datum as one text, its unit after it: "11,34 km". */
  const written = (metric: MetricId): string => {
    const { value: amount, unit } = metricText(activity, metric, textContext);
    return unit === null ? amount : `${amount} ${textContext.unitLabel(unit)}`;
  };
  /** A datum at `size`, its unit as big as its value, as AURA writes "11.3 KM". */
  const datum = (metric: MetricId, size: number) =>
    text([{ text: written(metric), size, bold: style.bold }]);
  /** The runs of a datum's value at `size`, with its unit after it, smaller. */
  const valueRuns = (metric: MetricId, size: number): Run[] => {
    const written = metricText(activity, metric, textContext);
    return [
      { text: written.value, size, bold: style.bold },
      ...(written.unit === null
        ? []
        : [
            {
              text: ` ${textContext.unitLabel(written.unit)}`,
              size: size * UNIT_SCALE,
              bold: style.bold,
            },
          ]),
    ];
  };
  /** A datum's value at `size`, with its unit after it, smaller. */
  const value = (metric: MetricId, size: number) => text(valueRuns(metric, size));
  /** A datum's name, small, faded and spaced out, for a value of `size`. */
  const label = (metric: MetricId, size: number) =>
    text([
      {
        text: translate(`metrics.${metric}`),
        size: Math.max(MIN_LABEL_SIZE, size * LABEL_SCALE),
        bold: false,
        faded: true,
        spacing: LABEL_SPACING,
      },
    ]);
  /** A datum's name over its value. */
  const cell = (metric: MetricId, size: number, align: Align) =>
    column([label(metric, size), value(metric, size)], size * 0.06, align);
  /** The data after the first, each with its name. */
  const cells = (from: number, size: number, align: Align) =>
    metrics.slice(from).map((metric) => cell(metric, size, align));
  const weekday = (size: number) =>
    text([
      {
        text: formatActivityDate(activity.startLocal, textContext.locale, 'weekday'),
        size,
        bold: style.bold,
      },
    ]);
  const shortWeekday = (size: number) =>
    text([
      {
        text: formatShortWeekday(activity.startLocal, textContext.locale),
        size,
        bold: style.bold,
      },
    ]);
  const date = (size: number) =>
    text([
      {
        text: formatActivityDate(activity.startLocal, textContext.locale, 'long'),
        size,
        bold: false,
        faded: true,
        spacing: LABEL_SPACING,
      },
    ]);
  const sportName = (size: number) =>
    text([
      {
        text: translate(`modalities.${activity.sportModality}`),
        size,
        bold: style.bold,
        spacing: LABEL_SPACING,
      },
    ]);

  let hole: HitHole | undefined;
  const body = ((): Box | null => {
    switch (block.design) {
      case 'headline': {
        if (block.layout === 'condensed') {
          const size = SIZES.headline.condensed.value;
          return dotted(
            metrics.map((metric) => value(metric, size)),
            size * 0.4,
          );
        }
        const sizes = SIZES.headline[block.layout];
        const primary = value(metrics[0], sizes.primary);
        const rest = cells(1, sizes.secondary, block.layout === 'stacked' ? 'center' : 'start');
        if (rest.length === 0) {
          return primary;
        }
        return block.layout === 'stacked'
          ? column([primary, row(rest, sizes.secondary * 1.1, 'start')], 16, 'center')
          : divided([primary, column(rest, sizes.secondary * 0.3, 'start')], 44);
      }
      case 'route': {
        const sizes = SIZES.route[block.layout];
        const route =
          activity.routePolyline === null
            ? null
            : routeBox(activity.routePolyline, sizes.route.width, sizes.route.height);
        const data = cells(0, sizes.value, block.layout === 'inline' ? 'start' : 'center');
        // Without a route left to draw (all of it private), the data stand alone.
        if (route === null) {
          return row(data, sizes.value * 1.1, 'start');
        }
        switch (block.layout) {
          case 'stacked':
            return column(
              [route, row(data, sizes.value * 1.1, 'start')],
              sizes.value * 0.7,
              'center',
            );
          case 'inline':
            return divided([route, column(data, sizes.value * 0.3, 'start')], 48);
          case 'between':
            return row([data[0], route, ...data.slice(1)], sizes.value * 0.6, 'center');
        }
      }
      case 'columns': {
        const size = SIZES.columns[block.count];
        const perRow = block.count === 4 ? 2 : block.count === 6 ? 3 : block.count;
        const all = metrics.map((metric) => cell(metric, size, 'center'));
        // Every column as wide as the widest datum, so the rules line up from row to row.
        const width = Math.max(...all.map((box) => box.width));
        const rows: Box[] = [];
        for (let i = 0; i < all.length; i += perRow) {
          rows.push(
            divided(
              all.slice(i, i + perRow).map((box) => widened(box, width, 'center')),
              size * 0.45,
            ),
          );
        }
        return column(rows, size * 0.5, 'center');
      }
      case 'day': {
        const sizes = SIZES.day[block.layout];
        const data = cells(0, sizes.value, block.layout === 'stacked' ? 'center' : 'start');
        return block.layout === 'stacked'
          ? column(
              [
                column([weekday(sizes.weekday), date(sizes.date)], 0, 'center'),
                row(data, sizes.value * 1.1, 'start'),
              ],
              sizes.value * 0.6,
              'center',
            )
          : divided(
              [
                column([weekday(sizes.weekday), date(sizes.date)], 4, 'start'),
                column(data, sizes.value * 0.3, 'start'),
              ],
              44,
            );
      }
      case 'sport': {
        if (block.layout === 'centered') {
          const sizes = SIZES.sport.centered;
          return column(
            [
              column(
                [iconBox(sportIcon(activity), sizes.icon), sportName(sizes.name)],
                8,
                'center',
              ),
              column(cells(0, sizes.value, 'center'), sizes.value * 0.35, 'center'),
            ],
            sizes.value * 0.55,
            'center',
          );
        }
        const sizes = SIZES.sport.list;
        const header = row(
          [iconBox(sportIcon(activity), sizes.icon), sportName(sizes.name)],
          sizes.icon * 0.22,
          'center',
        );
        const pairs = metrics.map((metric) => ({
          name: text([
            {
              text: translate(`metrics.${metric}`),
              size: sizes.label,
              bold: false,
              faded: true,
            },
          ]),
          value: value(metric, sizes.value),
        }));
        const width = Math.max(
          LIST_MIN_WIDTH,
          header.width,
          ...pairs.map((pair) => pair.name.width + sizes.value * 1.5 + pair.value.width),
        );
        return column(
          [
            header,
            ruleAcross(width),
            column(
              pairs.map((pair) => spread(pair.name, pair.value, width)),
              sizes.value * 0.3,
              'start',
            ),
          ],
          sizes.value * 0.4,
          'start',
        );
      }
      case 'notes': {
        // The splits as a note of the iPhone's Notes, in its font and colors.
        const splits =
          data.detail === null
            ? []
            : textContext.unit === 'mi'
              ? data.detail.splits.imperial
              : data.detail.splits.metric;
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
        const title = appText(
          [
            {
              text:
                distance.unit === null
                  ? distance.value
                  : `${distance.value} ${textContext.unitLabel(distance.unit)}`,
              size: sizes.title,
              bold: true,
            },
          ],
          colors.ink,
        );
        const back = row(
          [
            markBox('chevron', sizes.bar, colors.accent),
            appText([{ text: 'AllRun', size: sizes.bar, bold: false }], colors.accent),
          ],
          sizes.bar * 0.3,
          'center',
        );
        const sport = row(
          [
            appText(
              [
                {
                  text: translate(`modalities.${activity.sportModality}`).toLocaleLowerCase(),
                  size: sizes.bar,
                  bold: false,
                },
              ],
              colors.accent,
            ),
            iconBox(sportIcon(activity), sizes.icon, colors.accent),
          ],
          sizes.bar * 0.3,
          'center',
        );
        const note = column(
          [title, column(lines, sizes.row * 0.15, 'start')],
          sizes.row * 0.3,
          'start',
        );
        const width = Math.max(
          NOTES_MIN_WIDTH,
          note.width,
          back.width + sport.width + sizes.bar * 2,
        );
        return panel(
          column([spread(back, sport, width), note], sizes.bar * 0.7, 'start'),
          colors.page,
          NOTES_PAD,
          NOTES_PAD * 0.8,
          NOTES_RADIUS,
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
              textWidth,
            ),
            appText(
              [{ text: `${sport} · ${day}`, size: song.size, bold: false }],
              colors.faded,
              textWidth,
            ),
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
      case 'tall': {
        // The main datum tall, the others small under it, without names.
        const sizes = SIZES.tall[block.layout];
        const rest = metrics.slice(1).map((metric) => datum(metric, sizes.secondary));
        const primary = datum(metrics[0], sizes.primary);
        return rest.length === 0
          ? primary
          : column([primary, row(rest, sizes.secondary * 0.9, 'end')], 0, 'center');
      }
      case 'wide': {
        // The main datum wide (under the weekday, as wide), the others spread under it.
        const sizes = SIZES.wide;
        const primary = datum(metrics[0], sizes.value);
        const top =
          block.layout === 'weekday'
            ? column([weekday(sizes.value), primary], -sizes.value * 0.12, 'start')
            : primary;
        const rest = metrics.slice(1).map((metric) => datum(metric, sizes.secondary));
        return rest.length === 0
          ? top
          : column(
              [top, justified(rest, top.width, sizes.secondary * 0.8)],
              sizes.secondary * 0.2,
              'start',
            );
      }
      case 'weekday': {
        const sizes = SIZES.weekday[block.layout];
        const data = metrics.map((metric) => datum(metric, sizes.value));
        const stretched = STRETCHED_FONTS[style.font] !== undefined;
        if (block.layout === 'grid') {
          // The weekday over its data, two by two.
          const rows: Box[][] = [];
          for (let i = 0; i < data.length; i += 2) {
            rows.push(data.slice(i, i + 2));
          }
          return column(
            [
              shortWeekday(sizes.weekday),
              grid(rows, sizes.value * 0.7, stretched ? -sizes.value * 0.2 : 0, 'start'),
            ],
            // A stretched font's boxes keep the room under its letters, stretched too: close
            // it up.
            stretched ? -sizes.weekday * 0.25 : 0,
            'center',
          );
        }
        // The weekday between its data, half on each side.
        const half = Math.ceil(data.length / 2);
        return row(
          [
            column(data.slice(0, half), sizes.value * 0.15, 'end'),
            shortWeekday(sizes.weekday),
            ...(data.length > half ? [column(data.slice(half), sizes.value * 0.15, 'start')] : []),
          ],
          sizes.value * 0.6,
          'center',
        );
      }
      case 'serif': {
        // The name and date over the data, each under its name, as a magazine's caption.
        const sizes = SIZES.serif;
        const data = row(
          metrics.map((metric) =>
            column(
              [
                text([
                  {
                    text: translate(`metrics.${metric}`),
                    size: sizes.label,
                    bold: false,
                    faded: true,
                  },
                ]),
                datum(metric, sizes.value),
              ],
              0,
              'start',
            ),
          ),
          sizes.value * 0.45,
          'end',
        );
        const day = formatActivityDate(activity.startLocal, textContext.locale, 'short');
        const name = activity.name.trim();
        const title = textBox(
          paragraph(
            [{ text: name === '' ? day : `${name} · ${day}`, size: sizes.title, bold: false }],
            fonts,
            style,
            true,
            data.width,
          ),
        );
        return column([title, data], sizes.title * 0.5, 'start');
      }
      case 'poster': {
        const sizes = SIZES.poster;
        // The main datum reads upwards along the poster's side.
        const big = turnedBox(paragraph(valueRuns(metrics[0], sizes.value), fonts, style));
        const side = column(
          [sportName(sizes.name), ...cells(1, sizes.cell, 'start')],
          sizes.cell * 0.4,
          'start',
        );
        return row([big, side], sizes.cell * 0.6, 'end');
      }
    }
  })();
  if (body === null) {
    return null;
  }

  // A replica is the app's own view: no signature under it.
  const whole =
    layer.logo && !isAppReplica(block.design)
      ? column(
          [body, logoBox(LOGO_WIDTH)],
          LOGO_GAP,
          block.design === 'sport' && block.layout === 'list' ? 'start' : 'center',
        )
      : body;
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

/** The sport icons, parsed once. */
const iconPaths = new Map<SportIconId, SkPath>();

function iconPath(icon: SportIconId): SkPath {
  const cached = iconPaths.get(icon);
  if (cached !== undefined) {
    return cached;
  }
  const path = Skia.Path.MakeFromSVGString(SPORT_ICON_PATHS[icon]);
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
    case 'text':
    case 'messageTail':
    case 'rule':
    case 'dot':
    case 'logo':
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
      case 'hairline':
      case 'messageTail':
      case 'chevron':
      case 'ticks':
      case 'symbol':
      case 'disc':
        return [];
      case 'rule':
        return [
          <Line
            key={i}
            p1={{ x: piece.x1, y: piece.y1 }}
            p2={{ x: piece.x2, y: piece.y2 }}
            color={color}
            opacity={RULE_ALPHA}
            strokeWidth={RULE_WIDTH}
            strokeCap="round"
          />,
        ];
      case 'dot':
        return [
          <Circle
            key={i}
            c={{ x: piece.x, y: piece.y }}
            r={DOT_RADIUS}
            color={color}
            opacity={FADED_ALPHA}
          />,
        ];
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
        return [
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
                strokeWidth={ROUTE_STROKE}
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
        // Turned upwards about its top-left corner, then moved down by its length: the text
        // fills the box it measured, reading from the bottom.
        if (piece.stretch !== undefined) {
          return (
            <Group
              key={i}
              transform={[
                { translateX: piece.x },
                { translateY: piece.y },
                { scaleY: piece.stretch },
              ]}
            >
              <Paragraph paragraph={piece.paragraph} x={0} y={0} width={width} />
            </Group>
          );
        }
        return piece.turned === true ? (
          <Group
            key={i}
            transform={[
              { translateX: piece.x },
              { translateY: piece.y + width },
              { rotate: -Math.PI / 2 },
            ]}
          >
            <Paragraph paragraph={piece.paragraph} x={0} y={0} width={width} />
          </Group>
        ) : (
          <Paragraph key={i} paragraph={piece.paragraph} x={piece.x} y={piece.y} width={width} />
        );
      })}
    </Group>
  );
}
