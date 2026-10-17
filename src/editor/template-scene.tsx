import {
  FilterMode,
  FontWeight,
  Group,
  Image,
  MipmapMode,
  Paint,
  Paragraph,
  Path,
  Rect,
  RoundedRect,
  Shadow,
  Skia,
  type SkImage,
  type SkParagraph,
  type SkTextStyle,
  type SkTypefaceFontProvider,
  TextAlign,
  type Transforms3d,
} from '@shopify/react-native-skia';
import type { ReactElement } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { castsShadow } from '@/core/layer-style';
import type { LayerTransform } from '@/core/layer-transform';
import type { PhotoPlacement, Size } from '@/core/photo-framing';
import { decodePolyline } from '@/core/polyline';
import { DEFAULT_PRIVACY_TRIM_METERS, trimRouteEnds } from '@/core/route-privacy';
import { type Point, projectRoutes } from '@/core/route-projection';
import { CANVAS_FORMATS, type CanvasFormat, type Layer, type Template } from '@/core/template';
import { formatBucketLabels } from '@/ui/format';

import {
  chartBuckets,
  chartTitleKey,
  type EditorData,
  type LabelKey,
  layerText,
  type ParagraphContent,
  type TextContext,
  textRuns,
} from './editor-data';
import { watermarkLayout } from './brand/watermark-layout';
import { Watermark } from './brand/brand-art';
import { FONT_FAMILIES } from './fonts';

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
  const canvasWidth = CANVAS_FORMATS[template.format].width;
  return template.layers.flatMap((layer) => {
    const prepared = prepareLayer(layer, context, canvasWidth);
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
   * - `placeholder`: a dark fill, while no photo is chosen;
   * - `none`: nothing, for the transparent sticker export.
   */
  readonly background:
    | {
        readonly kind: 'photo';
        readonly image: SkImage;
        readonly matrix: Transforms3d | SharedValue<Transforms3d>;
        readonly rect: DrawRect | SharedValue<DrawRect>;
      }
    | { readonly kind: 'placeholder' }
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

const PLACEHOLDER_COLOR = '#1C1C1E';

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
      {background.kind === 'placeholder' ? (
        <Rect x={0} y={0} width={width} height={height} color={PLACEHOLDER_COLOR} />
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
  canvasWidth: number,
): PreparedLayer | null {
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
      const paragraph = buildFittedParagraph(
        fonts,
        layer.style,
        {
          label: text.label === null ? null : translate(text.label),
          value: text.value,
          unit: text.unit,
          valueSize: isData ? VALUE_SIZE : layer.kind === 'info' ? INFO_SIZE : TEXT_SIZE,
        },
        layer.maxWidth === undefined ? null : layer.maxWidth * canvasWidth,
      );
      return preparedParagraph(layer, paragraph);
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
      // Axis labels are already initials and numbers: capitals only apply to the title.
      const chartText = {
        ...LABEL_STYLE,
        color: layer.color,
        font: layer.font,
        bold: layer.bold,
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
      const title = layer.title
        ? buildParagraph(
            fonts,
            { ...chartText, uppercase: layer.uppercase },
            {
              label: null,
              value: translate(chartTitleKey(layer.value, size), { unit: textContext.unit }),
              unit: null,
              valueSize: AXIS_LABEL_SIZE,
            },
          )
        : null;
      return {
        layer,
        width: CHART_WIDTH,
        height: chartHeight(labels !== null, title !== null),
        content: (
          <BarChart
            values={values}
            color={layer.color}
            labels={labels}
            title={title}
            titleAlign={layer.align}
          />
        ),
      };
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
const AXIS_LABEL_SIZE = 26;
const ROUTE_BOX = 640;
const ROUTES_WIDTH = 800;
const ROUTES_HEIGHT = 560;
const CHART_WIDTH = 880;
const CHART_HEIGHT = 240;
/** Room under the bars for the axis labels, and under those for the title. */
const LABEL_BAND = 44;
const TITLE_BAND = 48;

/** Left edge of a block of `width` aligned within `span`, both starting at 0. */
function alignedX(align: 'left' | 'center' | 'right', width: number, span: number): number {
  return align === 'left' ? 0 : align === 'right' ? span - width : (span - width) / 2;
}

/** Height of a chart with or without its axis labels and title. */
function chartHeight(labels: boolean, title: boolean): number {
  return CHART_HEIGHT + (labels ? LABEL_BAND : 0) + (title ? TITLE_BAND : 0);
}
const MAX_TEXT_WIDTH = 1000;

type TextStyle = Extract<Layer, { kind: 'text' }>['style'];

/**
 * The soft shadow under texts, routes and bars. It keeps white widgets readable on bright
 * photos and lifts the top one off the layers below it: without it, a white route over white
 * text would merge with it. It has no setting: only light and bright colors cast it (see
 * `castsShadow`), since under black it would just blur the edges.
 */
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.45)';
const SHADOW_OFFSET_Y = 3;
const SHADOW_BLUR_RADIUS = 10;
/** Paragraph shadows take a blur radius, image filters a sigma; this is Skia's conversion. */
const SHADOW_SIGMA = 0.57735 * SHADOW_BLUR_RADIUS + 0.5;

function DropShadow() {
  return <Shadow dx={0} dy={SHADOW_OFFSET_Y} blur={SHADOW_SIGMA} color={SHADOW_COLOR} />;
}

const LABEL_STYLE: TextStyle = {
  font: 'inter',
  color: '#FFFFFF',
  bold: true,
  uppercase: false,
  align: 'center',
  shadow: true,
};

const ALIGN = { left: TextAlign.Left, center: TextAlign.Center, right: TextAlign.Right } as const;

function buildParagraph(
  fonts: SkTypefaceFontProvider,
  style: TextStyle,
  content: ParagraphContent,
): SkParagraph {
  const textStyle = (fontSize: number, bold: boolean): SkTextStyle => ({
    color: Skia.Color(style.color),
    fontFamilies: [FONT_FAMILIES[style.font]],
    fontSize,
    fontStyle: { weight: bold ? FontWeight.Bold : FontWeight.Normal },
    shadows:
      style.shadow && castsShadow(style.color)
        ? [
            {
              color: Skia.Color(SHADOW_COLOR),
              offset: { x: 0, y: SHADOW_OFFSET_Y },
              blurRadius: SHADOW_BLUR_RADIUS,
            },
          ]
        : [],
  });
  const builder = Skia.ParagraphBuilder.Make({ textAlign: ALIGN[style.align] }, fonts);
  for (const run of textRuns(style, content)) {
    builder.pushStyle(textStyle(run.fontSize, run.bold)).addText(run.text).pop();
  }
  const paragraph = builder.build();
  // Lay out once to measure, then shrink to the longest line so the block centers on (0, 0).
  paragraph.layout(MAX_TEXT_WIDTH);
  paragraph.layout(Math.ceil(paragraph.getLongestLine()) + 1);
  return paragraph;
}

/**
 * Like {@link buildParagraph}, but when the text is wider than `maxWidth` it is rebuilt with all
 * its font sizes reduced in proportion, so long values ("4178,08 km") never overlap neighbours.
 */
function buildFittedParagraph(
  fonts: SkTypefaceFontProvider,
  style: TextStyle,
  content: ParagraphContent,
  maxWidth: number | null,
): SkParagraph {
  const paragraph = buildParagraph(fonts, style, content);
  const width = paragraph.getLongestLine();
  if (maxWidth === null || width <= maxWidth) {
    return paragraph;
  }
  return buildParagraph(fonts, style, {
    ...content,
    valueSize: content.valueSize * (maxWidth / width),
  });
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
  readonly stroke: { readonly color: string; readonly width: number };
}

function RouteLines({ routes, box, boxHeight, stroke }: RouteLinesProps) {
  const path = Skia.Path.Make();
  for (const route of routes) {
    route.forEach((point, i) => {
      const x = point.x - box / 2;
      const y = point.y - boxHeight / 2;
      if (i === 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    });
  }
  return (
    <Path
      path={path}
      style="stroke"
      strokeWidth={stroke.width}
      strokeCap="round"
      strokeJoin="round"
      color={stroke.color}
    >
      {castsShadow(stroke.color) ? <DropShadow /> : null}
    </Path>
  );
}

function BarChart({
  values,
  color,
  labels,
  title,
  titleAlign,
}: {
  readonly values: readonly number[];
  readonly color: string;
  /** One paragraph per bar (`null` for unlabelled bars), or `null` for no axis labels. */
  readonly labels: readonly (SkParagraph | null)[] | null;
  /** What the bars measure, under them, or `null` for no title. */
  readonly title: SkParagraph | null;
  /** Where the title sits: under the first bar, centered, or under the last bar. */
  readonly titleAlign: 'left' | 'center' | 'right';
}) {
  if (values.length === 0) {
    return null;
  }
  const max = Math.max(...values);
  const slot = CHART_WIDTH / values.length;
  const barWidth = slot * 0.7;
  // Empty days still get a small mark so the time axis stays readable.
  const minHeight = Math.min(8, barWidth);
  const totalHeight = chartHeight(labels !== null, title !== null);
  const titleTop = CHART_HEIGHT + (labels === null ? 0 : LABEL_BAND);
  return (
    <Group transform={[{ translateX: -CHART_WIDTH / 2 }, { translateY: -totalHeight / 2 }]}>
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
          const height = max > 0 ? Math.max(minHeight, (value / max) * CHART_HEIGHT) : minHeight;
          return (
            <RoundedRect
              key={i}
              x={i * slot + (slot - barWidth) / 2}
              y={CHART_HEIGHT - height}
              width={barWidth}
              height={height}
              r={Math.min(barWidth / 2, 12)}
              color={color}
              opacity={value > 0 ? 1 : 0.4}
            />
          );
        })}
      </Group>
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
      {title === null ? null : (
        <Paragraph
          paragraph={title}
          x={alignedX(titleAlign, Math.ceil(title.getLongestLine()) + 1, CHART_WIDTH)}
          y={titleTop + (TITLE_BAND - title.getHeight()) / 2 + 4}
          width={Math.ceil(title.getLongestLine()) + 1}
        />
      )}
    </Group>
  );
}
