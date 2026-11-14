import { Group, Paint, RoundedRect, type SkParagraph } from '@shopify/react-native-skia';

import { lineLevel, type LineScale } from '@/core/activity-charts';
import { castsShadow } from '@/core/layer-style';

import { DropShadow } from '../scene-text';
import { ParagraphPicture } from '../paragraph-picture';
import { AXIS_LABEL_SIZE, CHART_HEIGHT, CHART_WIDTH, DashedLine, LABEL_BAND } from './chart-frame';

/** Height of a period's bars, with or without their axis labels, and `top` pixels over them. */
export function barsHeight(labels: boolean, top: number): number {
  return top + CHART_HEIGHT + (labels ? LABEL_BAND : 0);
}

/** Room left between the texts over the bars and the chart. */
const BAR_TEXT_GAP = 10;
/** Share of a bar's slot its text may take across. */
const BAR_TEXT_ROOM = 0.9;
/** Turned texts must come out this much bigger than upright ones to be worth turning. */
const TURN_GAIN = 1.25;

/** Each bar's text, over the chart, at one size that fits every bar. */
interface BarTexts {
  /** One paragraph per bar, `null` for bars without a text (an empty day). */
  readonly paragraphs: readonly (SkParagraph | null)[];
  /** Written upwards, when that lets the texts be bigger (many narrow bars). */
  readonly turned: boolean;
  /** Room over the chart they take, gap included. */
  readonly band: number;
}

/**
 * Lays out a text over each bar, all at one size: the axis labels' size if they fit across their
 * bar, smaller if not, or turned to read upwards when that keeps them clearly bigger (a month of
 * days, a marathon's splits). `null` when no bar has a text. Time O(n) for n bars, each text laid
 * out at most twice.
 */
export function fitBarTexts(
  texts: readonly (string | null)[],
  build: (text: string, size: number) => SkParagraph,
): BarTexts | null {
  const measured = texts.map((text) => (text === null ? null : build(text, AXIS_LABEL_SIZE)));
  const present = measured.filter((paragraph) => paragraph !== null);
  if (present.length === 0) {
    return null;
  }
  const room = (CHART_WIDTH / texts.length) * BAR_TEXT_ROOM;
  const widest = Math.max(...present.map((paragraph) => paragraph.getLongestLine()));
  const tallest = Math.max(...present.map((paragraph) => paragraph.getHeight()));
  const upright = Math.min(1, room / widest);
  const turnedScale = Math.min(1, room / tallest);
  const turned = turnedScale > upright * TURN_GAIN;
  const scale = turned ? turnedScale : upright;
  const paragraphs =
    scale === 1
      ? measured
      : texts.map((text) => (text === null ? null : build(text, AXIS_LABEL_SIZE * scale)));
  const laidOut = paragraphs.filter((paragraph) => paragraph !== null);
  const band = Math.max(
    ...laidOut.map((paragraph) => (turned ? paragraph.getLongestLine() : paragraph.getHeight())),
  );
  return { paragraphs, turned, band: band + BAR_TEXT_GAP };
}

/** Most rows of splits drawn one under another; more are grouped (km 1–3…). */
export const MAX_SPLIT_ROWS = 20;
/** Height of a row of splits and thickness of its bar, before the layer's scale. */
const ROW_HEIGHT = 54;
const ROW_BAR = 32;
/** Size of the texts of a row of splits: the content itself, bigger than axis labels. */
export const ROW_TEXT_SIZE = 38;
/** Size of the column names over the rows ("KM", "PACE"), and the height of their line. */
export const COLUMN_NAME_SIZE = 30;
const COLUMN_NAMES_HEIGHT = 50;
/** Room between the columns of the splits, and around their bars. */
const COLUMN_GAP = 30;
/** Room between the columns after the bars, whose numbers are shorter. */
const TRAILING_GAP = 32;
/** Share of the room the slowest split's bar takes: the differences between splits show. */
const ROW_MIN_SHARE = 0.45;

/** Height of the splits as rows, under the names of their columns. */
export function rowsHeight(rows: number): number {
  return COLUMN_NAMES_HEIGHT + rows * ROW_HEIGHT;
}

/** One row of splits ready to draw; a text is `null` when its column is hidden. */
interface PreparedRow {
  readonly speed: number;
  readonly number: SkParagraph;
  readonly value: SkParagraph | null;
  readonly elevation: SkParagraph | null;
  readonly heartRate: SkParagraph | null;
}

/** The names of the columns of the splits ("KM", "PACE", "ELEV.", "HR"); `null` when hidden. */
interface SplitColumns {
  readonly number: SkParagraph;
  readonly value: SkParagraph | null;
  readonly elevation: SkParagraph | null;
  readonly heartRate: SkParagraph | null;
}

/**
 * Splits as a table, as Strava shows them: under the names of its columns, each row with its
 * number and its pace or speed (left-aligned), a bar as long as it was fast (the slowest still
 * takes {@link ROW_MIN_SHARE} of the room, so the differences show) on the `scale` of the pace
 * line beside it (`lineLevel`: a pace by its pace), and then its change in altitude and its heart
 * rate when shown, right-aligned so their digits line up.
 */
export function SplitRows({
  rows,
  columns,
  scale,
  color,
}: {
  readonly rows: readonly PreparedRow[];
  readonly columns: SplitColumns;
  readonly scale: LineScale;
  readonly color: string;
}) {
  const widthOf = (paragraph: SkParagraph) => Math.ceil(paragraph.getLongestLine()) + 1;
  /** Width of a column: its widest text, its name included; 0 when hidden. */
  const columnWidth = (
    name: SkParagraph | null,
    column: (row: PreparedRow) => SkParagraph | null,
  ) =>
    name === null
      ? 0
      : Math.max(
          widthOf(name),
          ...rows.map((row) => {
            const paragraph = column(row);
            return paragraph === null ? 0 : widthOf(paragraph);
          }),
        );
  const numberWidth = columnWidth(columns.number, (row) => row.number);
  const valueWidth = columnWidth(columns.value, (row) => row.value);
  const elevationWidth = columnWidth(columns.elevation, (row) => row.elevation);
  const heartRateWidth = columnWidth(columns.heartRate, (row) => row.heartRate);
  // Left of the bars: the number and the pace. Right of them: altitude, then heart rate.
  const valueX = numberWidth + COLUMN_GAP;
  const barStart = valueX + (valueWidth > 0 ? valueWidth + COLUMN_GAP : 0);
  const heartRateRight = CHART_WIDTH;
  const elevationRight = heartRateRight - (heartRateWidth > 0 ? heartRateWidth + TRAILING_GAP : 0);
  // Where the columns after the bars start, if any.
  const trailingStart =
    elevationWidth > 0
      ? elevationRight - elevationWidth
      : heartRateWidth > 0
        ? heartRateRight - heartRateWidth
        : null;
  const barEnd = trailingStart === null ? CHART_WIDTH : trailingStart - COLUMN_GAP;
  const room = barEnd - barStart;
  const speeds = rows.map((row) => row.speed);
  const slowest = Math.min(...speeds);
  const fastest = Math.max(...speeds);
  const lengthOf = (speed: number) =>
    fastest > slowest
      ? room *
        (ROW_MIN_SHARE +
          (1 - ROW_MIN_SHARE) * lineLevel(speed, { min: slowest, max: fastest }, scale, 0))
      : room;
  const shadow = castsShadow(color) ? (
    <Paint>
      <DropShadow />
    </Paint>
  ) : undefined;
  /** A text starting at `x`, centered on `middle`. */
  const fromLeft = (paragraph: SkParagraph, x: number, middle: number, key: string) => (
    <ParagraphPicture
      key={key}
      paragraph={paragraph}
      x={x}
      y={middle - paragraph.getHeight() / 2}
      width={widthOf(paragraph)}
    />
  );
  /** A text ending at `right`, centered on `middle`. */
  const fromRight = (paragraph: SkParagraph, right: number, middle: number, key: string) =>
    fromLeft(paragraph, right - widthOf(paragraph), middle, key);
  /** Middle of the line of row `i`, under the names of the columns. */
  const middleOf = (i: number) => COLUMN_NAMES_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2;
  /** The texts of a line: the column names' or a row's, each in its column. */
  const line = (texts: SplitColumns, middle: number, key: string) => (
    <Group key={key}>
      {fromLeft(texts.number, 0, middle, 'number')}
      {texts.value === null ? null : fromLeft(texts.value, valueX, middle, 'value')}
      {texts.elevation === null
        ? null
        : fromRight(texts.elevation, elevationRight, middle, 'elevation')}
      {texts.heartRate === null
        ? null
        : fromRight(texts.heartRate, heartRateRight, middle, 'heartRate')}
    </Group>
  );
  return (
    <Group>
      <Group layer={shadow}>
        {rows.map((row, i) => (
          <RoundedRect
            key={i}
            x={barStart}
            y={middleOf(i) - ROW_BAR / 2}
            width={lengthOf(row.speed)}
            height={ROW_BAR}
            r={ROW_BAR / 4}
            color={color}
          />
        ))}
      </Group>
      {line(columns, COLUMN_NAMES_HEIGHT / 2, 'columns')}
      {rows.map((row, i) => line(row, middleOf(i), `row-${i}`))}
    </Group>
  );
}

/** Share of its slot a bar takes across. */
const BAR_SHARE = 0.88;
/** How opaque bars are but the best one. */
const DIM_BAR_OPACITY = 0.4;

/**
 * A period's bars, drawn from their top-left corner: square and translucent, but the best one (the
 * first, on a tie) in full color, empty ones as a faint mark; each bar's value just over it when
 * shown, an optional dashed line at their average (empty bars count), and the axis labels under
 * them.
 */
export function BarsBody({
  values,
  color,
  labels,
  averageLine,
  texts,
}: {
  readonly values: readonly number[];
  readonly color: string;
  /** One paragraph per bar (`null` for unlabelled bars), or `null` for no axis labels. */
  readonly labels: readonly (SkParagraph | null)[] | null;
  readonly averageLine: boolean;
  /** Each bar's value, in a row over the chart; `null` for none. */
  readonly texts: BarTexts | null;
}) {
  if (values.length === 0) {
    return null;
  }
  const max = Math.max(...values);
  const best = max > 0 ? values.indexOf(max) : -1;
  const slot = CHART_WIDTH / values.length;
  const barWidth = slot * BAR_SHARE;
  // Empty days still get a small mark so the time axis stays readable.
  const minHeight = Math.min(8, barWidth);
  const top = texts?.band ?? 0;
  const heightOf = (value: number) => (max <= 0 ? 0 : (value / max) * CHART_HEIGHT);
  const barHeight = (value: number) => Math.max(minHeight, heightOf(value));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return (
    <Group transform={[{ translateY: top }]}>
      {/* One shadow for all the bars, drawn as a layer, instead of one blur per bar. */}
      <Group
        layer={
          castsShadow(color) ? (
            <Paint>
              <DropShadow />
            </Paint>
          ) : undefined
        }
      >
        {values.map((value, i) => {
          const height = barHeight(value);
          return (
            <RoundedRect
              key={i}
              x={i * slot + (slot - barWidth) / 2}
              y={CHART_HEIGHT - height}
              width={barWidth}
              height={height}
              r={Math.min(barWidth / 2, 3)}
              color={color}
              opacity={i === best ? 1 : DIM_BAR_OPACITY}
            />
          );
        })}
      </Group>
      {averageLine && max > 0 ? (
        <DashedLine y={CHART_HEIGHT - heightOf(average)} color={color} />
      ) : null}
      {texts?.paragraphs.map((paragraph, i) => {
        if (paragraph === null) {
          return null;
        }
        const width = Math.ceil(paragraph.getLongestLine()) + 1;
        const center = i * slot + slot / 2;
        // Just over its own bar (the band over the chart makes room for the highest one), upright
        // or reading upwards.
        const barTop = CHART_HEIGHT - barHeight(values[i]);
        return texts.turned ? (
          <Group
            key={`text-${i}`}
            transform={[
              { translateX: center },
              { translateY: barTop - BAR_TEXT_GAP },
              { rotate: -Math.PI / 2 },
            ]}
          >
            <ParagraphPicture
              paragraph={paragraph}
              x={0}
              y={-paragraph.getHeight() / 2}
              width={width}
            />
          </Group>
        ) : (
          <ParagraphPicture
            key={`text-${i}`}
            paragraph={paragraph}
            x={center - width / 2}
            y={barTop - BAR_TEXT_GAP - paragraph.getHeight()}
            width={width}
          />
        );
      })}
      {labels?.map((label, i) => {
        if (label === null) {
          return null;
        }
        const width = Math.ceil(label.getLongestLine()) + 1;
        return (
          <ParagraphPicture
            key={`label-${i}`}
            paragraph={label}
            x={i * slot + slot / 2 - width / 2}
            y={CHART_HEIGHT + (LABEL_BAND - label.getHeight()) / 2 + 4}
            width={width}
          />
        );
      })}
    </Group>
  );
}
