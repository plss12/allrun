import {
  BlurMask,
  Circle,
  DashPathEffect,
  FilterMode,
  FontWeight,
  Group,
  Line,
  Image,
  LinearGradient,
  MipmapMode,
  Paint,
  Paragraph,
  Path,
  Rect,
  RoundedRect,
  Skia,
  type SkImage,
  type SkParagraph,
  type SkPath,
  type SkTextStyle,
  type SkTypefaceFontProvider,
  TextAlign,
  type Transforms3d,
} from '@shopify/react-native-skia';
import type { ReactElement } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { activityChartSeries, type LineSeries, splitRows } from '@/core/activity-charts';
import { castsShadow, contrastingInk } from '@/core/layer-style';
import type { Activity } from '@/core/activity';
import { type HeartRateZones, timeInZones, zoneIndex, zoneRange } from '@/core/heart-rate-zones';
import type { HitHole, LayerTransform } from '@/core/layer-transform';
import type { PhotoPlacement, Size } from '@/core/photo-framing';
import { decodePolyline } from '@/core/polyline';
import { DEFAULT_PRIVACY_TRIM_METERS, trimRouteEnds } from '@/core/route-privacy';
import { type Point, projectRoutes } from '@/core/route-projection';
import {
  type ActivityChartSeries,
  CANVAS_FORMATS,
  type CanvasFormat,
  type Layer,
  type Template,
} from '@/core/template';
import { formatDuration } from '@/core/units';
import { formatBucketLabels } from '@/ui/format';

import {
  activityChartHeader,
  chartBuckets,
  type EditorData,
  type HeaderDatum,
  type LabelKey,
  layerText,
  type ParagraphContent,
  periodChartHeader,
  periodTotalsHeader,
  roundedChartValue,
  speedMeasure,
  splitRowTexts,
  type TextContext,
  textRuns,
  type TitledHeader,
} from './editor-data';
import { prepareActivityBlock } from './activity-blocks';
import { prepareSummaryBlock } from './summary-blocks';
import { watermarkLayout } from './brand/watermark-layout';
import { Watermark } from './brand/brand-art';
import { CAP_HEIGHTS, drawsBold, fontFamiliesOf } from './fonts';
import {
  addLeanRoom,
  DropShadow,
  LETTER_SPACING,
  slantOf,
  softBackdrop,
  textShadows,
} from './scene-text';

/**
 * A layer filled with data and measured, ready to draw. Its content is centered on (0, 0); the
 * layer's transform then positions, rotates and scales it. The editor uses the size to find the
 * layer under a finger and to frame the selected one.
 */
export interface PreparedLayer {
  readonly layer: Layer;
  /** Size of the content before the layer's scale, in canvas pixels. */
  readonly width: number;
  readonly height: number;
  readonly content: ReactElement;
  /** Its see-through part, which touches go through (see `HitHole`). */
  readonly hole?: HitHole;
}

/** What layers need to be filled in and measured. */
export interface LayerContext {
  readonly data: EditorData;
  readonly fonts: SkTypefaceFontProvider;
  readonly textContext: TextContext;
  /** Translates a label; `values` fill its placeholders, such as the chart title's unit. */
  readonly translate: (key: LabelKey, values?: Readonly<Record<string, string>>) => string;
}

/**
 * Fills in and measures every layer of `template`, bottom to top. Layers with nothing to show
 * for this data (a route-less activity, a value of the other mode) are left out.
 */
export function prepareLayers(template: Template, context: LayerContext): PreparedLayer[] {
  const canvas = CANVAS_FORMATS[template.format];
  return template.layers.flatMap((layer) => {
    const prepared = prepareLayer(layer, context, canvas);
    return prepared === null ? [] : [prepared];
  });
}

/**
 * Transform of a layer's group on a canvas, as Skia takes it. A worklet, so the editor can
 * apply it from a shared value while the layer is being moved.
 */
export function layerMatrix(transform: LayerTransform, canvas: Size): Transforms3d {
  'worklet';
  return [
    { translateX: transform.x * canvas.width },
    { translateY: transform.y * canvas.height },
    { rotate: transform.rotation },
    { scale: transform.scale },
  ];
}

/** Rectangle of a drawing, in the coordinates of its group. */
export interface DrawRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Group transform that places a photo: rotated around the canvas center (see `framePhoto`). */
export function photoMatrix(placement: PhotoPlacement, canvas: Size): Transforms3d {
  'worklet';
  return [
    { translateX: canvas.width / 2 },
    { translateY: canvas.height / 2 },
    { rotate: placement.rotation },
  ];
}

/** Where the photo goes inside its {@link photoMatrix} group. */
export function photoRect(placement: PhotoPlacement): DrawRect {
  'worklet';
  return { x: placement.x, y: placement.y, width: placement.width, height: placement.height };
}

/**
 * Draws prepared layers over the background at the export size (1080 px wide). The editor scales
 * it to the screen; exporting renders it off-screen at full size, so both always match.
 */
export interface TemplateSceneProps {
  readonly format: CanvasFormat;
  readonly layers: readonly PreparedLayer[];
  /**
   * What goes under the layers:
   * - `photo`: the photo, drawn in `rect` inside a group transformed by `matrix` (see
   *   {@link photoMatrix} and {@link photoRect}); the editor passes shared values so gestures move
   *   it without re-rendering the layers;
   * - `transparent`: no photo, shown as the usual checkerboard of transparency (dark, so white
   *   widgets stay readable): the image exports with nothing under the widgets;
   * - `none`: nothing, for the transparent sticker export.
   */
  readonly background:
    | {
        readonly kind: 'photo';
        readonly image: SkImage;
        readonly matrix: Transforms3d | SharedValue<Transforms3d>;
        readonly rect: DrawRect | SharedValue<DrawRect>;
      }
    | { readonly kind: 'transparent' }
    | { readonly kind: 'none' };
  /**
   * The layer being moved, drawn from a shared transform so gestures don't re-render, with a
   * shared opacity (it fades over the trash).
   */
  readonly live?: {
    readonly id: string;
    readonly matrix: SharedValue<Transforms3d>;
    readonly opacity: SharedValue<number>;
  } | null;
}

/** The two tones of the transparency checkerboard and the side of its squares (canvas pixels). */
const CHECKER_DARK = '#1C1C1E';
const CHECKER_LIGHT = '#2C2C2E';
const CHECKER_SQUARE = 40;

/** The light squares of the checkerboard of each format, built once. */
const checkerPaths = new Map<CanvasFormat, SkPath>();

function checkerPath(format: CanvasFormat): SkPath {
  const cached = checkerPaths.get(format);
  if (cached !== undefined) {
    return cached;
  }
  const { width, height } = CANVAS_FORMATS[format];
  const builder = Skia.PathBuilder.Make();
  for (let row = 0; row * CHECKER_SQUARE < height; row++) {
    for (let column = row % 2; column * CHECKER_SQUARE < width; column += 2) {
      builder.addRect(
        Skia.XYWHRect(
          column * CHECKER_SQUARE,
          row * CHECKER_SQUARE,
          CHECKER_SQUARE,
          CHECKER_SQUARE,
        ),
      );
    }
  }
  const path = builder.detach();
  checkerPaths.set(format, path);
  return path;
}

/**
 * Photos are usually much larger than the canvas; trilinear filtering (linear + mipmaps) keeps
 * them smooth when scaled down instead of aliased.
 */
const PHOTO_SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear } as const;

export function TemplateScene({ format, layers, background, live = null }: TemplateSceneProps) {
  const canvas = CANVAS_FORMATS[format];
  const { width, height } = canvas;
  return (
    <Group>
      {background.kind === 'transparent' ? (
        <Group clip={{ x: 0, y: 0, width, height }}>
          <Rect x={0} y={0} width={width} height={height} color={CHECKER_DARK} />
          <Path path={checkerPath(format)} color={CHECKER_LIGHT} />
        </Group>
      ) : background.kind === 'photo' ? (
        <Group clip={{ x: 0, y: 0, width, height }}>
          <Group transform={background.matrix}>
            <Image
              image={background.image}
              rect={background.rect}
              fit="fill"
              sampling={PHOTO_SAMPLING}
            />
          </Group>
        </Group>
      ) : null}
      {/* A layer's opacity fades it as a whole, drawn on its own Skia layer: a group's `opacity`
          only reaches shapes (paragraphs ignore it) and fades each shape and its shadow apart,
          letting the shadow show through. Opaque layers skip the extra layer. */}
      {layers.map(({ layer, content }) =>
        live !== null && live.id === layer.id ? (
          <Group key={layer.id} transform={live.matrix} layer={<Paint opacity={live.opacity} />}>
            {content}
          </Group>
        ) : (
          <Group
            key={layer.id}
            transform={layerMatrix(layer.transform, canvas)}
            layer={layer.opacity < 1 ? <Paint opacity={layer.opacity} /> : undefined}
          >
            {content}
          </Group>
        ),
      )}
    </Group>
  );
}

/** Fills in and measures one layer, or `null` when it has nothing to show for this data. */
function prepareLayer(
  layer: Layer,
  { data, fonts, textContext, translate }: LayerContext,
  canvas: Size,
): PreparedLayer | null {
  const canvasWidth = canvas.width;
  switch (layer.kind) {
    case 'metric':
    case 'summaryMetric':
    case 'info':
    case 'text': {
      const text = layerText(layer, data, textContext);
      if (text === null) {
        return null;
      }
      const isData = layer.kind === 'metric' || layer.kind === 'summaryMetric';
      const backdrop = layer.style.backdrop ?? 'none';
      // A backdrop already sets the text apart: no shadow. The text keeps its color.
      const style = backdrop === 'none' ? layer.style : { ...layer.style, shadow: false };
      const paragraph = buildFittedParagraph(
        fonts,
        style,
        {
          label: text.label === null ? null : translate(text.label),
          value: text.value,
          unit: text.unit === null ? null : textContext.unitLabel(text.unit),
          valueSize: isData ? VALUE_SIZE : layer.kind === 'info' ? INFO_SIZE : TEXT_SIZE,
        },
        // On a backdrop the box has to fit too: the text gets a little less room.
        layer.maxWidth === undefined
          ? null
          : layer.maxWidth * canvasWidth * (backdrop === 'none' ? 1 : BACKDROP_FIT),
      );
      return backdrop === 'none'
        ? preparedParagraph(layer, paragraph)
        : preparedBackdrop(
            layer,
            paragraph,
            backdrop === 'solid'
              ? contrastingInk(layer.style.color)
              : softBackdrop(layer.style.color),
          );
    }
    case 'route': {
      if (data.mode !== 'activity' || data.activity.routePolyline === null) {
        return null;
      }
      const routes = projectedRoutes([data.activity.routePolyline], ROUTE_BOX, ROUTE_BOX);
      return preparedRoutes(layer, routes, ROUTE_BOX, ROUTE_BOX);
    }
    case 'summaryRoutes': {
      if (data.mode !== 'summary') {
        return null;
      }
      const routes = projectedRoutes(data.summary.routes, ROUTES_WIDTH, ROUTES_HEIGHT);
      return preparedRoutes(layer, routes, ROUTES_WIDTH, ROUTES_HEIGHT);
    }
    case 'summaryChart': {
      if (data.mode !== 'summary') {
        return null;
      }
      const { size, buckets } = chartBuckets(layer, data);
      if (buckets.length === 0) {
        return null;
      }
      const values = buckets.map((bucket) =>
        layer.value === 'distance' ? bucket.distanceMeters : bucket.movingTimeSeconds,
      );
      // Axis labels are already initials and numbers: capitals only apply to the header.
      const chartText = {
        ...LABEL_STYLE,
        color: layer.color,
        font: layer.font,
        bold: layer.bold,
        italic: layer.italic,
      };
      const labels = layer.axisLabels
        ? formatBucketLabels(buckets, size, textContext.locale).map((label) =>
            label === ''
              ? null
              : buildParagraph(fonts, chartText, {
                  label: null,
                  value: label,
                  unit: null,
                  valueSize: AXIS_LABEL_SIZE,
                }),
          )
        : null;
      const headerStyle = { ...chartText, uppercase: layer.uppercase, align: layer.align };
      // Without its data, the chart says what it shows.
      const header =
        (layer.header ?? true)
          ? layer.totals !== undefined
            ? prepareTitledHeader(
                periodTotalsHeader(data, layer.value, layer.totals, textContext, translate),
                fonts,
                headerStyle,
                translate,
              )
            : prepareHeader(
                periodChartHeader(layer.value, size, values, textContext),
                fonts,
                headerStyle,
                translate,
              )
          : prepareCaption(
              translate(`chartCaptions.${layer.value}.${size}`, { unit: textContext.unit }),
              fonts,
              headerStyle,
            );
      const line = (text: string, size: number, opacity = 1) =>
        buildParagraph(
          fonts,
          chartText,
          { label: null, value: text, unit: null, valueSize: size },
          NO_WRAP_WIDTH,
          opacity,
        );
      if (layer.look === 'line') {
        const max = Math.max(...values);
        const withUnit = (value: number) =>
          roundedChartValue(layer.value, value, textContext, true);
        const body = preparePeriodLine({
          values,
          color: layer.color,
          labels,
          // Lines at the labelled bars, also when the labels aren't written.
          marks: formatBucketLabels(buckets, size, textContext.locale).map((label) => label !== ''),
          ticks: [max, max / 2, 0].map((tick) =>
            line(withUnit(tick), AXIS_LABEL_SIZE, SCALE_OPACITY),
          ),
          peak: max > 0 ? line(withUnit(max), AXIS_LABEL_SIZE * PEAK_TEXT_GAIN) : null,
        });
        return {
          layer,
          width: CHART_WIDTH,
          height: framedHeight(header, body.height),
          content: (
            <ChartFrame header={header} align={layer.align} bodyHeight={body.height}>
              {body.content}
            </ChartFrame>
          ),
        };
      }
      const texts =
        layer.barValues === true
          ? fitBarTexts(
              values.map((value) => roundedChartValue(layer.value, value, textContext, false)),
              (text, size) => line(text, size),
            )
          : null;
      const bodyHeight = barsHeight(labels !== null, texts?.band ?? 0);
      return {
        layer,
        width: CHART_WIDTH,
        height: framedHeight(header, bodyHeight),
        content: (
          <ChartFrame header={header} align={layer.align} bodyHeight={bodyHeight}>
            <BarsBody
              values={values}
              color={layer.color}
              labels={labels}
              averageLine={layer.averageLine ?? false}
              texts={texts}
            />
          </ChartFrame>
        ),
      };
    }
    case 'activityChart': {
      if (data.mode !== 'activity' || data.detail === null) {
        return null;
      }
      const series = activityChartSeries(data.detail, layer.series, textContext.unit);
      if (series === null) {
        return null;
      }
      // Numbers have no capitals: they only apply to the header and the names of columns.
      const chartText = {
        ...LABEL_STYLE,
        color: layer.color,
        font: layer.font,
        bold: layer.bold,
        italic: layer.italic,
      };
      const paragraph = (value: string, uppercase: boolean, size: number) =>
        buildParagraph(
          fonts,
          { ...chartText, uppercase },
          { label: null, value, unit: null, valueSize: size },
        );
      const headerStyle = { ...chartText, uppercase: layer.uppercase, align: layer.align };
      // Splits that write each pace need no header: their paces and column names say it all.
      // Without its two data, any other chart says what it shows.
      const header =
        series.kind === 'bars' && (layer.splitPace ?? true)
          ? null
          : (layer.header ?? true)
            ? prepareHeader(
                activityChartHeader(layer.series, data.activity, series, textContext),
                fonts,
                headerStyle,
                translate,
              )
            : prepareCaption(
                translate(`chartCaptions.activity.${layer.series}`, { unit: textContext.unit }),
                fonts,
                headerStyle,
              );
      const frame = (bodyHeight: number, body: ReactElement): PreparedLayer => ({
        layer,
        width: CHART_WIDTH,
        height: framedHeight(header, bodyHeight),
        content: (
          <ChartFrame header={header} align={layer.align} bodyHeight={bodyHeight}>
            {body}
          </ChartFrame>
        ),
      });
      // How fast the activity went is written as its sport does: pace, pace per 100 or speed.
      const speed = speedMeasure(data.activity.sportFamily);
      if (series.kind === 'bars') {
        // Splits read against each other: they have no average line (templates that ask for one
        // draw without it).
        const showPace = layer.splitPace ?? true;
        const showElevation = layer.splitElevation === true;
        const showHeartRate = layer.splitHeartRate === true;
        const rows = splitRows(series.splits, MAX_SPLIT_ROWS).map((row) => {
          const texts = splitRowTexts(row, speed, textContext);
          const text = (value: string) => paragraph(value, false, ROW_TEXT_SIZE);
          return {
            speed: row.speed,
            number: text(texts.number),
            value: showPace ? text(texts.value) : null,
            elevation: showElevation ? text(texts.elevation) : null,
            heartRate: showHeartRate ? text(texts.heartRate) : null,
          };
        });
        const name = (text: string) => paragraph(text, layer.uppercase, COLUMN_NAME_SIZE);
        return frame(
          rowsHeight(rows.length),
          <SplitRows
            rows={rows}
            columns={{
              number: name(textContext.unitLabel(textContext.unit)),
              value: showPace ? name(translate(`metrics.${speed}`)) : null,
              elevation: showElevation ? name(translate('splitHeaders.elevation')) : null,
              heartRate: showHeartRate ? name(translate('splitHeaders.heartRate')) : null,
            }}
            color={layer.color}
          />,
        );
      }
      // The zones need the athlete's zones and the heart rate along the way.
      const streams = data.detail.streams;
      const zones =
        layer.series === 'heartRate' &&
        layer.zones !== undefined &&
        data.zones !== null &&
        streams !== null &&
        streams.heartRate !== null
          ? {
              view: layer.zones,
              zones: data.zones,
              time: streams.time,
              heartRate: streams.heartRate,
            }
          : null;
      const table =
        zones === null || zones.view === 'line'
          ? null
          : timeInZones(zones.time, zones.heartRate, zones.zones).map((seconds, i) => ({
              seconds,
              // Each zone's name in its color.
              name: buildParagraph(
                fonts,
                { ...chartText, color: zoneColor(i) },
                { label: null, value: `Z${i + 1}`, unit: null, valueSize: ZONE_TEXT_SIZE },
              ),
              time: paragraph(formatDuration(seconds), false, ZONE_TEXT_SIZE),
              range: paragraph(zoneRange(i, zones.zones), false, ZONE_RANGE_SIZE),
            }));
      const line = zones === null || zones.view !== 'table';
      const lineHeight = line ? CHART_HEIGHT : 0;
      const tableTop = line && table !== null ? lineHeight + ZONE_TABLE_GAP : lineHeight;
      return frame(
        table === null ? lineHeight : tableTop + table.length * ZONE_ROW_HEIGHT,
        <Group>
          {line ? (
            <LineBody
              series={series}
              color={layer.color}
              average={
                layer.averageLine === true
                  ? lineAverage(layer.series, data.activity, series.average)
                  : null
              }
              zones={zones === null ? null : zones.zones}
            />
          ) : null}
          {table === null ? null : (
            <Group transform={[{ translateY: tableTop }]}>
              <ZonesTable rows={table} color={layer.color} />
            </Group>
          )}
        </Group>,
      );
    }
    case 'activityBlock': {
      if (data.mode !== 'activity') {
        return null;
      }
      const block = prepareActivityBlock(layer, data, { fonts, textContext, translate, canvas });
      return block === null ? null : { layer, ...block };
    }
    case 'summaryBlock': {
      if (data.mode !== 'summary') {
        return null;
      }
      const block = prepareSummaryBlock(layer, data, { fonts, textContext, translate });
      return block === null ? null : { layer, ...block };
    }
    case 'logo': {
      const { width, height } = watermarkLayout(layer.variant);
      return {
        layer,
        width,
        height,
        content: <Watermark variant={layer.variant} tone={layer.tone} />,
      };
    }
  }
}

function preparedParagraph(layer: Layer, paragraph: SkParagraph): PreparedLayer {
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
function preparedBackdrop(layer: Layer, paragraph: SkParagraph, color: string): PreparedLayer {
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
const BACKDROP_FIT = 0.85;

/**
 * Routes projected into a `box` × `boxHeight` box. They are centered in it, so their own extent
 * (plus the stroke) is what a finger can grab, not the whole box. `null` without any point.
 */
function preparedRoutes(
  layer: Extract<Layer, { kind: 'route' | 'summaryRoutes' }>,
  routes: readonly Point[][],
  box: number,
  boxHeight: number,
): PreparedLayer | null {
  const points = routes.flat();
  if (points.length === 0) {
    return null;
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    layer,
    width: Math.max(...xs) - Math.min(...xs) + layer.stroke.width,
    height: Math.max(...ys) - Math.min(...ys) + layer.stroke.width,
    content: <RouteLines routes={routes} box={box} boxHeight={boxHeight} stroke={layer.stroke} />,
  };
}

// Base sizes in canvas pixels (1080 px wide); each layer's `scale` multiplies them.
const VALUE_SIZE = 96;
const INFO_SIZE = 52;
/** Base size of free text, in canvas pixels; the layer's scale multiplies it. */
export const TEXT_SIZE = 60;
const AXIS_LABEL_SIZE = 34;
const ROUTE_BOX = 640;
const ROUTES_WIDTH = 800;
const ROUTES_HEIGHT = 560;
const CHART_WIDTH = 880;
const CHART_HEIGHT = 240;
/** Room under the bars for their axis labels. */
const LABEL_BAND = 54;

/** Left edge of a block of `width` aligned within `span`, both starting at 0. */
function alignedX(align: 'left' | 'center' | 'right', width: number, span: number): number {
  return align === 'left' ? 0 : align === 'right' ? span - width : (span - width) / 2;
}

/** Height of a period's bars, with or without their axis labels, and `top` pixels over them. */
function barsHeight(labels: boolean, top: number): number {
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
function fitBarTexts(
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
const MAX_SPLIT_ROWS = 20;
/** Height of a row of splits and thickness of its bar, before the layer's scale. */
const ROW_HEIGHT = 54;
const ROW_BAR = 32;
/** Size of the texts of a row of splits: the content itself, bigger than axis labels. */
const ROW_TEXT_SIZE = 38;
/** Size of the column names over the rows ("KM", "PACE"), and the height of their line. */
const COLUMN_NAME_SIZE = 30;
const COLUMN_NAMES_HEIGHT = 50;
/** Room between the columns of the splits, and around their bars. */
const COLUMN_GAP = 30;
/** Room between the columns after the bars, whose numbers are shorter. */
const TRAILING_GAP = 32;
/** Share of the room the slowest split's bar takes: the differences between splits show. */
const ROW_MIN_SHARE = 0.45;

/** Height of the splits as rows, under the names of their columns. */
function rowsHeight(rows: number): number {
  return COLUMN_NAMES_HEIGHT + rows * ROW_HEIGHT;
}
const MAX_TEXT_WIDTH = 1000;
/** A layout width no text reaches: lines only break where the text does. */
const NO_WRAP_WIDTH = 1_000_000;

type TextStyle = Extract<Layer, { kind: 'text' }>['style'];

const LABEL_STYLE: TextStyle = {
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
function buildParagraph(
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
  const paragraph = builder.build();
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
function buildFittedParagraph(
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
    <Paragraph paragraph={paragraph} x={-width / 2} y={-paragraph.getHeight() / 2} width={width} />
  );
}

/** Decodes, trims the private ends of and projects routes into a box. */
function projectedRoutes(polylines: readonly string[], width: number, height: number): Point[][] {
  const routes = polylines.map((polyline) =>
    trimRouteEnds(decodePolyline(polyline), DEFAULT_PRIVACY_TRIM_METERS),
  );
  return projectRoutes(routes, width, height);
}

interface RouteLinesProps {
  readonly routes: readonly Point[][];
  readonly box: number;
  readonly boxHeight: number;
  readonly stroke: Extract<Layer, { kind: 'route' }>['stroke'];
}

/**
 * Dash and gap lengths of each line style, in line widths. Dots are dashes of no length: the
 * round caps draw them as circles.
 */
const LINE_DASHES = { dashed: [2.5, 2], dotted: [0, 2] } as const;

function RouteLines({ routes, box, boxHeight, stroke }: RouteLinesProps) {
  const builder = Skia.PathBuilder.Make();
  const at = (point: Point) => ({ x: point.x - box / 2, y: point.y - boxHeight / 2 });
  for (const route of routes) {
    route.forEach((point, i) => {
      const { x, y } = at(point);
      if (i === 0) {
        builder.moveTo(x, y);
      } else {
        builder.lineTo(x, y);
      }
    });
  }
  const path = builder.detach();
  const { color, width } = stroke;
  const line = stroke.line ?? 'solid';
  const shadow = castsShadow(color) ? <DropShadow /> : null;
  return (
    <Group>
      {stroke.glow ? (
        // A wider, blurred copy of the line under it.
        <Path
          path={path}
          style="stroke"
          strokeWidth={width * 2.5}
          strokeCap="round"
          strokeJoin="round"
          color={color}
          opacity={0.6}
        >
          <BlurMask blur={width * 1.5} style="normal" />
        </Path>
      ) : null}
      <Path
        path={path}
        style="stroke"
        strokeWidth={width}
        strokeCap="round"
        strokeJoin="round"
        color={color}
      >
        {line === 'solid' ? null : (
          <DashPathEffect intervals={LINE_DASHES[line].map((length) => length * width + 0.01)} />
        )}
        {shadow}
      </Path>
    </Group>
  );
}

/** Room left under the lowest point of a line, as a share of its range: the area never vanishes. */
const LINE_FLOOR = 0.15;
/** Width of a chart's line, in canvas pixels before the layer's scale. */
const LINE_WIDTH = 6;
/** How opaque the area under a line is at its top; it fades out to nothing at the bottom. */
const AREA_OPACITY = 0.55;
/** Width of a chart's average line, in canvas pixels before the layer's scale. */
const AVERAGE_LINE_WIDTH = 4;

/** `color` with its opacity set to `alpha`, as Skia takes it. */
function withAlpha(color: string, alpha: number) {
  const value = Skia.Color(color);
  value[3] = alpha;
  return value;
}

/** A dashed line across a chart's whole width at height `y`. */
function DashedLine({ y, color }: { readonly y: number; readonly color: string }) {
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
 * Colors of the heart rate zones, Z1 to Z5, as sports apps paint them: grey, blue, green, orange
 * and red. Zones past the fifth take the red.
 */
const ZONE_COLORS = ['#A1A1A6', '#3D8BFD', '#34C759', '#FF9F0A', '#FF453A'] as const;

const zoneColor = (index: number): string => ZONE_COLORS[Math.min(index, ZONE_COLORS.length - 1)];

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
function prepareHeader(
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
function prepareTitledHeader(
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
const widthOf = (paragraph: SkParagraph): number => Math.ceil(paragraph.getLongestLine()) + 1;

/** Size of a chart's name, written over it in place of its header. */
const CAPTION_SIZE = 34;

/** A chart's name ("ELEVATION") as its header, spaced out, shrunk to the chart's width if longer. */
function prepareCaption(
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
function framedHeight(header: PreparedHeader | null, bodyHeight: number): number {
  return (header === null ? 0 : header.height + HEADER_GAP) + bodyHeight;
}

/**
 * A chart centered on (0, 0): its header on top, aligned as the layer asks, and its body (drawn
 * from its top-left corner, {@link CHART_WIDTH} wide and `bodyHeight` tall) under it.
 */
function ChartFrame({
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
        <Paragraph
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
              <Paragraph
                paragraph={cell.label}
                x={at(cell.label)}
                y={header.cellsTop}
                width={widthOf(cell.label)}
              />
            )}
            <Paragraph
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

/**
 * A line over an area that fades out downwards, the shape of an activity's elevation, pace, heart
 * rate or power along the way, between the lowest and the highest values (with some room below
 * the lowest, so the area keeps some body). Optionally, a dashed line at the `average`, and the
 * line colored by heart rate `zones`.
 */
function LineBody({
  series,
  color,
  average,
  zones,
}: {
  readonly series: LineSeries;
  readonly color: string;
  /** Where the dashed average line goes, in the series' units; `null` for none. */
  readonly average: number | null;
  /** The athlete's zones, to paint each stretch of the line in its zone's color. */
  readonly zones: HeartRateZones | null;
}) {
  const range = series.max - series.min;
  const floor = series.min - range * LINE_FLOOR;
  const span = range * (1 + LINE_FLOOR);
  // A flat line sits halfway up.
  const yOf = (value: number) =>
    span > 0 ? CHART_HEIGHT - ((value - floor) / span) * CHART_HEIGHT : CHART_HEIGHT / 2;
  const points = series.points.map((point) => ({ x: point.x * CHART_WIDTH, y: yOf(point.y) }));
  const pathOf = (stretch: readonly Point[]) => {
    const builder = Skia.PathBuilder.Make();
    stretch.forEach((point, i) =>
      i === 0 ? builder.moveTo(point.x, point.y) : builder.lineTo(point.x, point.y),
    );
    return builder;
  };
  const area = pathOf(points);
  area.lineTo(points[points.length - 1].x, CHART_HEIGHT);
  area.lineTo(points[0].x, CHART_HEIGHT);
  area.close();
  const top = Math.min(...points.map((point) => point.y));
  // The activity's own average may fall outside the line's range: it stays within the chart.
  const averageY = average === null ? null : Math.min(CHART_HEIGHT, Math.max(0, yOf(average)));
  const stroke = {
    style: 'stroke',
    strokeWidth: LINE_WIDTH,
    strokeCap: 'round',
    strokeJoin: 'round',
  } as const;
  return (
    <Group>
      <Path path={area.detach()}>
        <LinearGradient
          start={{ x: 0, y: top }}
          end={{ x: 0, y: CHART_HEIGHT }}
          colors={[withAlpha(color, AREA_OPACITY), withAlpha(color, 0)]}
        />
      </Path>
      <Group
        layer={
          castsShadow(color) || zones !== null ? (
            <Paint>
              <DropShadow />
            </Paint>
          ) : undefined
        }
      >
        {zones === null ? (
          <Path path={pathOf(points).detach()} color={color} {...stroke} />
        ) : (
          zoneStretches(series.points, zones).map(({ zone, from, to }) => (
            <Path
              key={from}
              path={pathOf(points.slice(from, to + 1)).detach()}
              color={zoneColor(zone)}
              {...stroke}
            />
          ))
        )}
      </Group>
      {averageY === null ? null : <DashedLine y={averageY} color={color} />}
    </Group>
  );
}

/**
 * The stretches of a heart rate line in one zone: from point `from` to point `to`, both included,
 * so they join. Each step between two points takes the zone of its middle. Time O(n · z) for n
 * points and z zones.
 */
function zoneStretches(
  points: readonly Point[],
  zones: HeartRateZones,
): { readonly zone: number; readonly from: number; readonly to: number }[] {
  const stretches: { zone: number; from: number; to: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const zone = zoneIndex((points[i - 1].y + points[i].y) / 2, zones);
    const last = stretches[stretches.length - 1];
    if (last !== undefined && last.zone === zone) {
      last.to = i;
    } else {
      stretches.push({ zone, from: i - 1, to: i });
    }
  }
  return stretches;
}

/** Sizes of the texts of the zones table, its rows, its bars and the room around it. */
const ZONE_TEXT_SIZE = 32;
const ZONE_RANGE_SIZE = 26;
const ZONE_ROW_HEIGHT = 48;
const ZONE_BAR = 10;
const ZONE_GAP = 24;
const ZONE_TABLE_GAP = 30;

/** One zone of the table: its time and its texts, laid out. */
interface ZoneRow {
  readonly seconds: number;
  /** "Z1"… in the zone's color. */
  readonly name: SkParagraph;
  readonly time: SkParagraph;
  /** The beats per minute it spans: "<112", "112–130", "168+". */
  readonly range: SkParagraph;
}

/**
 * The time spent in each heart rate zone, a row per zone: its name in its color, a bar as long as
 * its share of the most time spent in one zone (over a faint track), the time and the range of
 * the zone, both right-aligned so their digits line up.
 */
function ZonesTable({
  rows,
  color,
}: {
  readonly rows: readonly ZoneRow[];
  readonly color: string;
}) {
  const widthOf = (paragraph: SkParagraph) => Math.ceil(paragraph.getLongestLine()) + 1;
  const nameWidth = Math.max(...rows.map((row) => widthOf(row.name)));
  const timeWidth = Math.max(...rows.map((row) => widthOf(row.time)));
  const rangeWidth = Math.max(...rows.map((row) => widthOf(row.range)));
  const trackStart = nameWidth + ZONE_GAP;
  const rangeRight = CHART_WIDTH;
  const timeRight = rangeRight - rangeWidth - ZONE_GAP;
  const trackWidth = timeRight - timeWidth - ZONE_GAP - trackStart;
  const most = Math.max(...rows.map((row) => row.seconds));
  const middleOf = (i: number) => i * ZONE_ROW_HEIGHT + ZONE_ROW_HEIGHT / 2;
  const at = (paragraph: SkParagraph, x: number, i: number) => (
    <Paragraph
      paragraph={paragraph}
      x={x}
      y={middleOf(i) - paragraph.getHeight() / 2}
      width={widthOf(paragraph)}
    />
  );
  return (
    <Group>
      {rows.map((row, i) => (
        <Group key={i}>
          {at(row.name, 0, i)}
          <RoundedRect
            x={trackStart}
            y={middleOf(i) - ZONE_BAR / 2}
            width={trackWidth}
            height={ZONE_BAR}
            r={ZONE_BAR / 2}
            color={withAlpha(color, 0.2)}
          />
          {most > 0 && row.seconds > 0 ? (
            <RoundedRect
              x={trackStart}
              y={middleOf(i) - ZONE_BAR / 2}
              width={Math.max(ZONE_BAR, (trackWidth * row.seconds) / most)}
              height={ZONE_BAR}
              r={ZONE_BAR / 2}
              color={zoneColor(i)}
            />
          ) : null}
          {at(row.time, timeRight - widthOf(row.time), i)}
          <Group layer={<Paint opacity={0.7} />}>
            {at(row.range, rangeRight - widthOf(row.range), i)}
          </Group>
        </Group>
      ))}
    </Group>
  );
}

/**
 * The average an activity's line chart marks: the activity's own (its average pace, heart rate or
 * power, as its data widgets write it) when it has one, or else the line's.
 */
function lineAverage(series: ActivityChartSeries, activity: Activity, ofLine: number): number {
  const own =
    series === 'pace'
      ? activity.averageSpeed
      : series === 'heartRate'
        ? activity.averageHeartRate
        : series === 'power'
          ? activity.averagePowerWatts
          : null;
  return own !== null && own > 0 ? own : ofLine;
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
 * takes {@link ROW_MIN_SHARE} of the room, so the differences show), and then its change in
 * altitude and its heart rate when shown, right-aligned so their digits line up.
 */
function SplitRows({
  rows,
  columns,
  color,
}: {
  readonly rows: readonly PreparedRow[];
  readonly columns: SplitColumns;
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
      ? room * (ROW_MIN_SHARE + ((1 - ROW_MIN_SHARE) * (speed - slowest)) / (fastest - slowest))
      : room;
  const shadow = castsShadow(color) ? (
    <Paint>
      <DropShadow />
    </Paint>
  ) : undefined;
  /** A text starting at `x`, centered on `middle`. */
  const fromLeft = (paragraph: SkParagraph, x: number, middle: number, key: string) => (
    <Paragraph
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

/** How opaque the values of a line's scale are, and its grid. */
const SCALE_OPACITY = 0.65;
const GRID_OPACITY = 0.3;
const GRID_WIDTH = 2;
/** The highest point's value is this much bigger than the scale's. */
const PEAK_TEXT_GAIN = 1.2;
/** Room between the scale's values and the grid, and between texts and the dots. */
const SCALE_GAP = 18;
/** Radius of a line's dots, few or many (a month of days), and of the highest one's halo. */
const DOT = { few: 9, many: 5, halo: 2.4 } as const;
/** Most points drawn with big dots. */
const FEW_POINTS = 16;

/** A chart's body laid out: what it draws from its top-left corner, and how tall it is. */
interface PreparedBody {
  readonly height: number;
  readonly content: ReactElement;
}

/**
 * A period's bars as a line (as the summaries of the home screen draw it): a dot per bar joined
 * over an area that fades out downwards, on a grid with its scale on the left (the highest
 * value, its half and zero) and a line at each marked bar; the highest dot with a halo and its
 * value over it, and the axis labels under the line. It spans {@link CHART_WIDTH}; the scale's
 * width depends on its values. Time O(n) for n bars.
 */
function preparePeriodLine({
  values,
  color,
  labels,
  marks,
  ticks,
  peak,
}: {
  readonly values: readonly number[];
  readonly color: string;
  /** One paragraph per bar (`null` for unlabelled bars), or `null` for no axis labels. */
  readonly labels: readonly (SkParagraph | null)[] | null;
  /** The bars with a line of the grid across them. */
  readonly marks: readonly boolean[];
  /** The scale's values: the highest, its half and zero, top to bottom. */
  readonly ticks: readonly SkParagraph[];
  /** The highest value, over its dot; `null` when every bar is empty. */
  readonly peak: SkParagraph | null;
}): PreparedBody {
  const radius = values.length <= FEW_POINTS ? DOT.few : DOT.many;
  const halo = radius * DOT.halo;
  const gridLeft = Math.max(...ticks.map(widthOf)) + SCALE_GAP;
  const left = gridLeft + radius;
  const right = CHART_WIDTH - halo;
  const top = (peak === null ? 0 : peak.getHeight() + SCALE_GAP) + halo;
  const bottom = top + CHART_HEIGHT;
  const max = Math.max(...values);
  const best = max > 0 ? values.indexOf(max) : -1;
  const points = values.map((value, i) => ({
    x: values.length > 1 ? left + (i * (right - left)) / (values.length - 1) : (left + right) / 2,
    y: bottom - (max > 0 ? (value / max) * CHART_HEIGHT : 0),
  }));
  const labelsTop = bottom + radius + SCALE_GAP / 2;
  const labelsHeight = Math.max(0, ...(labels ?? []).map((label) => label?.getHeight() ?? 0));
  const height = labels === null ? bottom + radius : labelsTop + labelsHeight;
  const linePath = Skia.PathBuilder.Make();
  points.forEach(({ x, y }, i) => (i === 0 ? linePath.moveTo(x, y) : linePath.lineTo(x, y)));
  const area = Skia.PathBuilder.Make();
  area.moveTo(points[0].x, bottom);
  points.forEach(({ x, y }) => area.lineTo(x, y));
  area.lineTo(points[points.length - 1].x, bottom);
  area.close();
  const grid = withAlpha(color, GRID_OPACITY);
  const peakAt = best < 0 ? null : points[best];
  const content = (
    <Group>
      {ticks.map((tick, i) => {
        const y = top + (i * CHART_HEIGHT) / (ticks.length - 1);
        return (
          <Group key={`tick-${i}`}>
            <Line
              p1={{ x: gridLeft, y }}
              p2={{ x: CHART_WIDTH, y }}
              color={grid}
              strokeWidth={GRID_WIDTH}
            />
            <Paragraph
              paragraph={tick}
              x={gridLeft - SCALE_GAP - widthOf(tick)}
              y={y - tick.getHeight() / 2}
              width={widthOf(tick)}
            />
          </Group>
        );
      })}
      {points.map(({ x }, i) =>
        marks[i] ? (
          <Line
            key={`mark-${i}`}
            p1={{ x, y: top }}
            p2={{ x, y: bottom }}
            color={grid}
            strokeWidth={GRID_WIDTH}
          />
        ) : null,
      )}
      <Path path={area.detach()}>
        <LinearGradient
          start={{ x: 0, y: top }}
          end={{ x: 0, y: bottom }}
          colors={[withAlpha(color, AREA_OPACITY), withAlpha(color, 0)]}
        />
      </Path>
      {/* One shadow for the line and its dots, drawn as a layer. */}
      <Group
        layer={
          castsShadow(color) ? (
            <Paint>
              <DropShadow />
            </Paint>
          ) : undefined
        }
      >
        <Path
          path={linePath.detach()}
          style="stroke"
          strokeWidth={LINE_WIDTH}
          strokeJoin="round"
          strokeCap="round"
          color={color}
        />
        {points.map(({ x, y }, i) => (
          <Circle key={`dot-${i}`} cx={x} cy={y} r={radius} color={color} />
        ))}
      </Group>
      {peakAt === null ? null : (
        <Circle cx={peakAt.x} cy={peakAt.y} r={halo} color={withAlpha(color, GRID_OPACITY)} />
      )}
      {peak === null || peakAt === null ? null : (
        <Paragraph
          paragraph={peak}
          // Centered over its dot, but never past the chart's ends.
          x={Math.min(Math.max(peakAt.x - widthOf(peak) / 2, 0), CHART_WIDTH - widthOf(peak))}
          y={peakAt.y - halo - SCALE_GAP / 2 - peak.getHeight()}
          width={widthOf(peak)}
        />
      )}
      {labels?.map((label, i) => {
        if (label === null) {
          return null;
        }
        const width = widthOf(label);
        return (
          <Paragraph
            key={`label-${i}`}
            paragraph={label}
            x={points[i].x - width / 2}
            y={labelsTop}
            width={width}
          />
        );
      })}
    </Group>
  );
  return { height, content };
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
function BarsBody({
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
            <Paragraph paragraph={paragraph} x={0} y={-paragraph.getHeight() / 2} width={width} />
          </Group>
        ) : (
          <Paragraph
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
          <Paragraph
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
