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
import type { FontId, Layer } from '@/core/template';
import { formatActivityDate } from '@/ui/format';

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
import { DropShadow, textShadows } from './scene-text';

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
}

/** A block laid out: its size before the layer's scale, in canvas pixels, and its drawing. */
export interface PreparedBlock {
  readonly width: number;
  readonly height: number;
  readonly content: ReactElement;
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
  | { readonly kind: 'logo'; readonly x: number; readonly y: number; readonly width: number }
  | { readonly kind: 'route'; readonly points: readonly Point[] };

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
 * shrunk to its own extent plus the stroke, or `null` when nothing is left to draw.
 */
function routeBox(polyline: string, width: number, height: number): Box | null {
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
    width: spanX + ROUTE_STROKE,
    height: spanY + ROUTE_STROKE,
    place: (x, y) => [
      {
        kind: 'route',
        points: points.map((point) => ({
          x: x + ROUTE_STROKE / 2 + point.x - minX,
          y: y + ROUTE_STROKE / 2 + point.y - minY,
        })),
      },
    ],
  };
}

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
 * shadow of its color unless `shadow` is off (a text on a bubble needs none).
 */
function paragraph(
  runs: readonly Run[],
  fonts: SkTypefaceFontProvider,
  style: BlockStyle,
  shadow = true,
) {
  const builder = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Left }, fonts);
  const tightening = TIGHT_FONTS[style.font] ?? 0;
  const shadows = shadow ? textShadows(style.color) : [];
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
        fontStyle: { weight: run.bold ? FontWeight.Bold : FontWeight.Normal },
        letterSpacing: run.size * ((run.spacing ?? 0) + tightening),
        shadows,
      })
      .addText(style.uppercase ? run.text.toLocaleUpperCase() : run.text)
      .pop();
  }
  const built = builder.build();
  built.layout(NO_WRAP_WIDTH);
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
  { fonts, textContext, translate }: BlockContext,
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
  /** A replica's text: in the system-like font of the apps, in `color`, without a shadow. */
  const appText = (runs: readonly Run[], color: string) =>
    textBox(paragraph(runs, fonts, { font: 'inter', color, bold: false, uppercase: false }, false));
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
      case 'message': {
        // Two data as a sent chat message; the sport and start time where its time goes.
        const colors = MESSAGE_COLORS[block.layout];
        const sizes = SIZES.message;
        const message = appText(
          metrics.map((metric, i) => {
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
                    time: formatActivityDate(activity.startLocal, textContext.locale, 'time'),
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
      case 'messageTail':
      case 'chevron':
      case 'ticks':
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
        return [
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
          piece.kind === 'panel' ? (
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
      {pieces.map((piece, i) =>
        piece.kind === 'chevron' || piece.kind === 'ticks' ? (
          <Path
            key={i}
            path={piece.kind === 'chevron' ? chevronPath(piece) : ticksPath(piece)}
            style="stroke"
            strokeWidth={piece.size * 0.12}
            strokeCap="round"
            strokeJoin="round"
            color={piece.color}
          />
        ) : piece.kind === 'icon' && piece.color !== undefined ? (
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
        ) : null,
      )}
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
