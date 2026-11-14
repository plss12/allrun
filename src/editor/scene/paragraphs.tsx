import {
  FontWeight,
  Group,
  RoundedRect,
  Skia,
  type SkParagraph,
  type SkTextStyle,
  type SkTypefaceFontProvider,
  TextAlign,
} from '@shopify/react-native-skia';

import type { HitLine } from '@/core/layer-transform';
import type { Point } from '@/core/route-projection';
import type { Layer } from '@/core/template';

import { type ParagraphContent, textRuns } from '../editor-data';
import { drawsBold, fontFamiliesOf } from '../fonts';
import { addLeanRoom, LETTER_SPACING, slantOf, textShadows } from '../scene-text';
import type { CaptionText } from '../instant-caption';
import { discardParagraph, finishParagraph } from '../paragraph-arena';
import { ParagraphPicture } from '../paragraph-picture';
import type { DrawRect, PreparedLayer } from '../template-scene';

/** A paragraph and where it goes. */
export interface PlacedParagraph {
  readonly paragraph: SkParagraph;
  readonly x: number;
  readonly y: number;
}

/**
 * How an instant photo's caption is written, by hand: its letters' size and line height, the room
 * between its columns (a share of the size), how much of the band its lines may take, and the
 * least a centered line shrinks to before its shorter version is written instead.
 */
const CAPTION = {
  size: 50,
  lineHeight: 1.05,
  gap: 1,
  width: 0.94,
  height: 0.8,
  minFit: 0.7,
} as const;

/**
 * An instant photo's caption laid out in the band `band` under its picture, in Permanent Marker
 * capitals and `color`, as on a Polaroid written by hand. One column is centered, each line
 * shrinking on its own when it doesn't fit (a long place, not its distance), the first written
 * shorter instead (see `CaptionText`) when it would shrink below `CAPTION.minFit`. Two columns go
 * at the sides, the first left-aligned and the second right-aligned, and shrink together. Time
 * O(l) for l lines, each laid out at most three times.
 */
export function captionParagraphs(
  fonts: SkTypefaceFontProvider,
  caption: CaptionText,
  band: DrawRect,
  color: string,
  locale: string,
): PlacedParagraph[] {
  const layOut = (lines: readonly string[], align: 'left' | 'center' | 'right', size: number) => {
    const builder = Skia.ParagraphBuilder.Make({ textAlign: ALIGN[align] }, fonts);
    builder.pushStyle({
      color: Skia.Color(color),
      fontFamilies: fontFamiliesOf('permanentMarker'),
      fontSize: size,
      heightMultiplier: CAPTION.lineHeight,
    });
    builder.addText(lines.map((line) => line.toLocaleUpperCase(locale)).join('\n'));
    builder.pop();
    const paragraph = finishParagraph(builder);
    paragraph.layout(NO_WRAP_WIDTH);
    paragraph.layout(Math.ceil(paragraph.getLongestLine()) + 1);
    return paragraph;
  };
  const maxWidth = band.width * CAPTION.width;
  const maxHeight = band.height * CAPTION.height;
  const placeAt = (paragraphs: readonly SkParagraph[], x: (width: number, i: number) => number) => {
    const height = paragraphs.reduce((sum, paragraph) => sum + paragraph.getHeight(), 0);
    let y = band.y + (band.height - height) / 2;
    return paragraphs.map((paragraph, i) => {
      const placed = { paragraph, x: x(Math.ceil(paragraph.getLongestLine()) + 1, i), y };
      y += paragraph.getHeight();
      return placed;
    });
  };
  const { columns, shorterFirst } = caption;
  if (columns.length === 1) {
    /** A line as big as it fits, up to `size`; `null` when it would shrink below `minFit`. */
    const fitted = (text: string, size: number, shorten: boolean): SkParagraph | null => {
      const paragraph = layOut([text], 'center', size);
      const fit = maxWidth / paragraph.getLongestLine();
      if (fit >= 1) {
        return paragraph;
      }
      discardParagraph(paragraph);
      return shorten && fit < CAPTION.minFit ? null : layOut([text], 'center', size * fit);
    };
    // A line is `lineHeight` times its size tall: all of them fit the band's height.
    const lineSize = Math.min(CAPTION.size, maxHeight / (columns[0].length * CAPTION.lineHeight));
    const lines = columns[0].map(
      (text, i) =>
        (i === 0 && shorterFirst !== undefined ? fitted(text, lineSize, true) : null) ??
        fitted(i === 0 && shorterFirst !== undefined ? shorterFirst : text, lineSize, false) ??
        layOut([text], 'center', lineSize),
    );
    return placeAt(lines, (width) => -width / 2);
  }
  const room = (paragraphs: readonly SkParagraph[], size: number) => ({
    width:
      paragraphs.reduce((sum, paragraph) => sum + paragraph.getLongestLine(), 0) +
      size * CAPTION.gap * (paragraphs.length - 1),
    height: Math.max(...paragraphs.map((paragraph) => paragraph.getHeight())),
  });
  const aligned = (size: number) =>
    columns.map((lines, i) => layOut(lines, i === 0 ? 'left' : 'right', size));
  let size: number = CAPTION.size;
  let paragraphs = aligned(size);
  const taken = room(paragraphs, size);
  const fit = Math.min(1, maxWidth / taken.width, maxHeight / taken.height);
  if (fit < 1) {
    paragraphs.forEach(discardParagraph);
    size *= fit;
    paragraphs = aligned(size);
  }
  const inset = (band.width - maxWidth) / 2;
  return paragraphs.map((paragraph, i) => {
    const width = Math.ceil(paragraph.getLongestLine()) + 1;
    const x = i === 0 ? band.x + inset : band.x + band.width - inset - width;
    return { paragraph, x, y: band.y + (band.height - paragraph.getHeight()) / 2 };
  });
}

export function preparedParagraph(layer: Layer, paragraph: SkParagraph): PreparedLayer {
  return {
    layer,
    width: Math.ceil(paragraph.getLongestLine()) + 1,
    height: paragraph.getHeight(),
    content: <CenteredParagraph paragraph={paragraph} />,
  };
}

/**
 * A text on a rounded box of `color`, padded in proportion to the text so it looks the same at
 * any size. The box is part of the widget: a finger can grab it and it fits within the canvas.
 */
export function preparedBackdrop(
  layer: Layer,
  paragraph: SkParagraph,
  color: string,
): PreparedLayer {
  const textWidth = Math.ceil(paragraph.getLongestLine()) + 1;
  const textHeight = paragraph.getHeight();
  const padY = Math.max(6, textHeight * BACKDROP_PADDING);
  const padX = padY * 1.6;
  const width = textWidth + 2 * padX;
  const height = textHeight + 2 * padY;
  return {
    layer,
    width,
    height,
    content: (
      <Group>
        <RoundedRect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          r={Math.min(padY * 1.4, height / 2)}
          color={color}
        />
        <CenteredParagraph paragraph={paragraph} />
      </Group>
    ),
  };
}

/** Room around a text on a backdrop, above and below, as a fraction of the text's height. */
const BACKDROP_PADDING = 0.16;
/** Share of a widget's maximum width its text may take on a backdrop, leaving room for the box. */
export const BACKDROP_FIT = 0.85;

/**
 * Least room between the points a route's hit line keeps, in canvas pixels: far below a finger's
 * reach, and few enough points to hand to the gestures on every render.
 */
const HIT_STEP = 4;

/**
 * A route's lines for the hit test, from the layer's center as `RouteLines` draws them, thinned
 * to points `HIT_STEP` apart (and each route's last one). Time and space O(n) for n points.
 */
export function hitLine(
  routes: readonly Point[][],
  box: number,
  boxHeight: number,
  strokeWidth: number,
): HitLine {
  return {
    routes: routes.map((route) => {
      const kept: number[] = [];
      route.forEach((point, i) => {
        const x = point.x - box / 2;
        const y = point.y - boxHeight / 2;
        const last = kept.length - 2;
        if (
          kept.length === 0 ||
          i === route.length - 1 ||
          Math.hypot(x - kept[last], y - kept[last + 1]) >= HIT_STEP
        ) {
          kept.push(x, y);
        }
      });
      return kept;
    }),
    halfWidth: strokeWidth / 2,
  };
}

// Base sizes in canvas pixels (1080 px wide); each layer's `scale` multiplies them.
export const VALUE_SIZE = 96;
export const INFO_SIZE = 52;
/** Base size of free text, in canvas pixels; the layer's scale multiplies it. */
export const TEXT_SIZE = 60;
const MAX_TEXT_WIDTH = 1000;
/** A layout width no text reaches: lines only break where the text does. */
export const NO_WRAP_WIDTH = 1_000_000;

export type TextStyle = Extract<Layer, { kind: 'text' }>['style'];

export const LABEL_STYLE: TextStyle = {
  font: 'inter',
  color: '#FFFFFF',
  bold: true,
  uppercase: false,
  align: 'center',
  shadow: true,
};

const ALIGN = { left: TextAlign.Left, center: TextAlign.Center, right: TextAlign.Right } as const;

/**
 * Lays out a text widget, wrapping lines longer than `wrapWidth` (line breaks in the text always
 * apply), then shrinks the paragraph to its longest line so it centers on (0, 0). Its letters are
 * `opacity` times as opaque as its color.
 */
export function buildParagraph(
  fonts: SkTypefaceFontProvider,
  style: TextStyle,
  content: ParagraphContent,
  wrapWidth = MAX_TEXT_WIDTH,
  opacity = 1,
): SkParagraph {
  const color = Skia.Color(style.color);
  color[3] *= opacity;
  const textStyle = (fontSize: number, bold: boolean): SkTextStyle => ({
    color,
    fontFamilies: fontFamiliesOf(style.font),
    fontSize,
    fontStyle: {
      weight: drawsBold(style.font, bold) ? FontWeight.Bold : FontWeight.Normal,
      slant: slantOf(style.italic),
    },
    letterSpacing: fontSize * LETTER_SPACING[style.letterSpacing ?? 'normal'],
    shadows: style.shadow ? textShadows(style.color) : [],
  });
  const builder = Skia.ParagraphBuilder.Make({ textAlign: ALIGN[style.align] }, fonts);
  const runs = textRuns(style, content);
  for (const run of runs) {
    builder.pushStyle(textStyle(run.fontSize, run.bold));
    if (style.italic === true) {
      // Room for the lean at the end of each line the text breaks (soft wraps can't be known
      // before the layout) and of the last one.
      run.text.split('\n').forEach((line, i, lines) => {
        builder.addText(line);
        if (i < lines.length - 1) {
          addLeanRoom(builder, run.fontSize);
          builder.addText('\n');
        }
      });
    } else {
      builder.addText(run.text);
    }
    builder.pop();
  }
  if (style.italic === true && runs.length > 0) {
    addLeanRoom(builder, runs[runs.length - 1].fontSize);
  }
  const paragraph = finishParagraph(builder);
  // Lay out once to measure, then shrink to the longest line so the block centers on (0, 0).
  paragraph.layout(wrapWidth);
  paragraph.layout(Math.ceil(paragraph.getLongestLine()) + 1);
  return paragraph;
}

/**
 * Like {@link buildParagraph}, but a text with a `maxWidth` doesn't wrap: when it is wider, it is
 * rebuilt with all its font sizes reduced in proportion, so long values ("4178,08 km") and names
 * never overlap neighbours. Wrapping first would break the proportion: the smaller text would
 * flow back into fewer, longer lines, wider than `maxWidth`, and the extra lines would run into
 * the widget below.
 */
export function buildFittedParagraph(
  fonts: SkTypefaceFontProvider,
  style: TextStyle,
  content: ParagraphContent,
  maxWidth: number | null,
): SkParagraph {
  if (maxWidth === null) {
    return buildParagraph(fonts, style, content);
  }
  const paragraph = buildParagraph(fonts, style, content, NO_WRAP_WIDTH);
  const width = paragraph.getLongestLine();
  if (width <= maxWidth) {
    return paragraph;
  }
  return buildParagraph(
    fonts,
    style,
    { ...content, valueSize: content.valueSize * (maxWidth / width) },
    NO_WRAP_WIDTH,
  );
}

function CenteredParagraph({ paragraph }: { readonly paragraph: SkParagraph }) {
  const width = Math.ceil(paragraph.getLongestLine()) + 1;
  return (
    <ParagraphPicture
      paragraph={paragraph}
      x={-width / 2}
      y={-paragraph.getHeight() / 2}
      width={width}
    />
  );
}
