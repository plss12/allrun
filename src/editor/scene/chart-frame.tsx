import {
  DashPathEffect,
  Group,
  Line,
  Skia,
  type SkParagraph,
  type SkTypefaceFontProvider,
} from '@shopify/react-native-skia';
import type { ReactElement } from 'react';

import type { HeaderDatum, LabelKey, TitledHeader } from '../editor-data';
import { CAP_HEIGHTS } from '../fonts';
import { ParagraphPicture } from '../paragraph-picture';
import { buildFittedParagraph, buildParagraph, NO_WRAP_WIDTH, type TextStyle } from './paragraphs';

export const AXIS_LABEL_SIZE = 34;
export const CHART_WIDTH = 880;
export const CHART_HEIGHT = 240;
/** Room under the bars for their axis labels. */
export const LABEL_BAND = 54;

/** Left edge of a block of `width` aligned within `span`, both starting at 0. */
function alignedX(align: 'left' | 'center' | 'right', width: number, span: number): number {
  return align === 'left' ? 0 : align === 'right' ? span - width : (span - width) / 2;
}

/** Room left under the lowest point of a line, as a share of its range: the area never vanishes. */
export const LINE_FLOOR = 0.15;
/** Width of a chart's line, in canvas pixels before the layer's scale. */
export const LINE_WIDTH = 6;
/** How opaque the area under a line is at its top; it fades out to nothing at the bottom. */
export const AREA_OPACITY = 0.55;
/** Width of a chart's average line, in canvas pixels before the layer's scale. */
const AVERAGE_LINE_WIDTH = 4;

/** `color` with its opacity set to `alpha`, as Skia takes it. */
export function withAlpha(color: string, alpha: number) {
  const value = Skia.Color(color);
  value[3] = alpha;
  return value;
}

/** A dashed line across a chart's whole width at height `y`. */
export function DashedLine({ y, color }: { readonly y: number; readonly color: string }) {
  return (
    <Line
      p1={{ x: 0, y }}
      p2={{ x: CHART_WIDTH, y }}
      color={color}
      strokeWidth={AVERAGE_LINE_WIDTH}
      strokeCap="round"
    >
      <DashPathEffect intervals={[3 * AVERAGE_LINE_WIDTH, 2.5 * AVERAGE_LINE_WIDTH]} />
    </Line>
  );
}

/**
 * A datum of a chart's header laid out: its name (none for a chart's name alone) over its value,
 * `valueY` down, both aligned within `width` as the header is.
 */
interface HeaderCell {
  readonly label: SkParagraph | null;
  readonly value: SkParagraph;
  readonly valueY: number;
  readonly width: number;
}

/** A chart's header laid out: its data side by side, under a title when it has one. */
interface PreparedHeader {
  readonly title: SkParagraph | null;
  /** How far down the data start, under the title. */
  readonly cellsTop: number;
  readonly cells: readonly HeaderCell[];
  /** Width of the data side by side. */
  readonly width: number;
  readonly height: number;
}

/**
 * Size of a header's values, their units as big; the room between the two data. Their names are
 * smaller, fainter as the chart's area fades, and close over them, the room between a name's
 * baseline and its value's capitals a share of the value's size: the value stands out.
 */
const HEADER_VALUE_SIZE = 100;
const HEADER_CELL_GAP = 64;
const HEADER_LABEL = { size: 0.4, opacity: 0.65, gap: 0.14 } as const;
/** Room between the header and the chart under it. */
const HEADER_GAP = 34;

/**
 * Lays out a chart's header in `style`, each datum's name over its value aligned as the chart's
 * header is, smaller when the two data don't fit the chart's width side by side.
 */
export function prepareHeader(
  data: readonly HeaderDatum[],
  fonts: SkTypefaceFontProvider,
  style: TextStyle,
  translate: (key: LabelKey) => string,
): PreparedHeader {
  const line = (text: string, size: number, opacity = 1) =>
    buildParagraph(
      fonts,
      style,
      { label: null, value: text, unit: null, valueSize: size },
      NO_WRAP_WIDTH,
      opacity,
    );
  const build = (size: number): HeaderCell[] =>
    data.map((datum) => {
      const label = line(translate(datum.label), size * HEADER_LABEL.size, HEADER_LABEL.opacity);
      const value = line(datum.unit === null ? datum.value : `${datum.value} ${datum.unit}`, size);
      const baseline = (paragraph: SkParagraph) =>
        paragraph.getLineMetrics()[0]?.baseline ?? paragraph.getHeight();
      // The value's capitals start just under the name's baseline.
      const capitalsTop = baseline(value) - CAP_HEIGHTS[style.font] * size;
      return {
        label,
        value,
        valueY: baseline(label) + HEADER_LABEL.gap * size - capitalsTop,
        width: Math.max(widthOf(label), widthOf(value)),
      };
    });
  const cellsWidth = (cells: readonly HeaderCell[]) =>
    cells.reduce((sum, cell) => sum + cell.width, 0);
  const gaps = HEADER_CELL_GAP * (data.length - 1);
  const natural = build(HEADER_VALUE_SIZE);
  const cells =
    cellsWidth(natural) + gaps <= CHART_WIDTH
      ? natural
      : build((HEADER_VALUE_SIZE * (CHART_WIDTH - gaps)) / cellsWidth(natural));
  return {
    title: null,
    cellsTop: 0,
    cells,
    width: cellsWidth(cells) + gaps,
    height: Math.max(...cells.map((cell) => cell.valueY + cell.value.getHeight())),
  };
}

/**
 * Size of a header's title as a share of its values' natural size, and the room under it as a
 * share of the title's size.
 */
const HEADER_TITLE = { size: 0.46, gap: 0.5 } as const;

/**
 * Lays out a header with a title (a period's name) over its data, both aligned as the chart's
 * header is; the title shrinks to the chart's width when longer.
 */
export function prepareTitledHeader(
  { title, data }: TitledHeader,
  fonts: SkTypefaceFontProvider,
  style: TextStyle,
  translate: (key: LabelKey) => string,
): PreparedHeader {
  const size = HEADER_VALUE_SIZE * HEADER_TITLE.size;
  const titleParagraph = buildFittedParagraph(
    fonts,
    style,
    { label: null, value: title, unit: null, valueSize: size },
    CHART_WIDTH,
  );
  const cells = prepareHeader(data, fonts, style, translate);
  const cellsTop = titleParagraph.getHeight() + size * HEADER_TITLE.gap;
  return {
    ...cells,
    title: titleParagraph,
    cellsTop,
    height: cellsTop + cells.height,
  };
}

/** Width a paragraph takes on the canvas: its longest line, to the next pixel and one more. */
export const widthOf = (paragraph: SkParagraph): number =>
  Math.ceil(paragraph.getLongestLine()) + 1;

/** Size of a chart's name, written over it in place of its header. */
const CAPTION_SIZE = 34;

/** A chart's name ("ELEVATION") as its header, spaced out, shrunk to the chart's width if longer. */
export function prepareCaption(
  text: string,
  fonts: SkTypefaceFontProvider,
  style: TextStyle,
): PreparedHeader {
  const caption = buildFittedParagraph(
    fonts,
    { ...style, letterSpacing: 'wide' },
    { label: null, value: text, unit: null, valueSize: CAPTION_SIZE },
    CHART_WIDTH,
  );
  const width = widthOf(caption);
  return {
    title: null,
    cellsTop: 0,
    cells: [{ label: null, value: caption, valueY: 0, width }],
    width,
    height: caption.getHeight(),
  };
}

/** Height of a chart: its header, when it has one, over its body. */
export function framedHeight(header: PreparedHeader | null, bodyHeight: number): number {
  return (header === null ? 0 : header.height + HEADER_GAP) + bodyHeight;
}

/**
 * A chart centered on (0, 0): its header on top, aligned as the layer asks, and its body (drawn
 * from its top-left corner, {@link CHART_WIDTH} wide and `bodyHeight` tall) under it.
 */
export function ChartFrame({
  header,
  align,
  bodyHeight,
  children,
}: {
  readonly header: PreparedHeader | null;
  readonly align: 'left' | 'center' | 'right';
  readonly bodyHeight: number;
  readonly children: ReactElement;
}) {
  const top = header === null ? 0 : header.height + HEADER_GAP;
  const totalHeight = framedHeight(header, bodyHeight);
  let left = header === null ? 0 : alignedX(align, header.width, CHART_WIDTH);
  return (
    <Group transform={[{ translateX: -CHART_WIDTH / 2 }, { translateY: -totalHeight / 2 }]}>
      {header === null || header.title === null ? null : (
        <ParagraphPicture
          paragraph={header.title}
          x={alignedX(align, widthOf(header.title), CHART_WIDTH)}
          y={0}
          width={widthOf(header.title)}
        />
      )}
      {header?.cells.map((cell, i) => {
        const x = left;
        left += cell.width + HEADER_CELL_GAP;
        const at = (paragraph: SkParagraph) => x + alignedX(align, widthOf(paragraph), cell.width);
        return (
          <Group key={i}>
            {cell.label === null ? null : (
              <ParagraphPicture
                paragraph={cell.label}
                x={at(cell.label)}
                y={header.cellsTop}
                width={widthOf(cell.label)}
              />
            )}
            <ParagraphPicture
              paragraph={cell.value}
              x={at(cell.value)}
              y={header.cellsTop + cell.valueY}
              width={widthOf(cell.value)}
            />
          </Group>
        );
      })}
      <Group transform={[{ translateY: top }]}>{children}</Group>
    </Group>
  );
}
