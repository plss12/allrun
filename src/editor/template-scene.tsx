import {
  FilterMode,
  FontWeight,
  Group,
  Image,
  MipmapMode,
  Paragraph,
  Path,
  Rect,
  RoundedRect,
  Skia,
  type SkImage,
  type SkParagraph,
  type SkTextStyle,
  type SkTypefaceFontProvider,
  TextAlign,
} from '@shopify/react-native-skia';

import { decodePolyline } from '@/core/polyline';
import { DEFAULT_PRIVACY_TRIM_METERS, trimRouteEnds } from '@/core/route-privacy';
import { type Point, projectRoutes } from '@/core/route-projection';
import { CANVAS_FORMATS, type Layer, type Template } from '@/core/template';
import { formatBucketLabels } from '@/ui/format';

import { type EditorData, type LabelKey, layerText, type TextContext } from './editor-data';
import { Watermark } from './brand/brand-art';
import { FONT_FAMILIES } from './fonts';

/**
 * Draws a template filled with data at its export size (1080 px wide). The editor scales it to
 * the screen; exporting renders it off-screen at full size, so both always match.
 */
export interface TemplateSceneProps {
  readonly template: Template;
  readonly data: EditorData;
  /** Background photo; `null` draws the placeholder (editor) or nothing (`transparent`). */
  readonly photo: SkImage | null;
  /** `true` for the sticker export: no photo and no placeholder. */
  readonly transparent?: boolean;
  readonly fonts: SkTypefaceFontProvider;
  readonly textContext: TextContext;
  readonly translate: (key: LabelKey) => string;
}

const PLACEHOLDER_COLOR = '#1C1C1E';

/**
 * Photos are usually much larger than the canvas; trilinear filtering (linear + mipmaps) keeps
 * them smooth when scaled down instead of aliased.
 */
const PHOTO_SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear } as const;

export function TemplateScene({
  template,
  data,
  photo,
  transparent = false,
  fonts,
  textContext,
  translate,
}: TemplateSceneProps) {
  const { width, height } = CANVAS_FORMATS[template.format];
  return (
    <Group>
      {transparent ? null : photo === null ? (
        <Rect x={0} y={0} width={width} height={height} color={PLACEHOLDER_COLOR} />
      ) : (
        <Image
          image={photo}
          x={0}
          y={0}
          width={width}
          height={height}
          fit="cover"
          sampling={PHOTO_SAMPLING}
        />
      )}
      {template.layers.map((layer) => {
        const { x, y, scale, rotation } = layer.transform;
        return (
          <Group
            key={layer.id}
            transform={[
              { translateX: x * width },
              { translateY: y * height },
              { rotate: rotation },
              { scale },
            ]}
            opacity={layer.opacity}
          >
            <LayerContent
              layer={layer}
              data={data}
              canvasWidth={width}
              fonts={fonts}
              textContext={textContext}
              translate={translate}
            />
          </Group>
        );
      })}
    </Group>
  );
}

interface LayerContentProps {
  readonly layer: Layer;
  readonly data: EditorData;
  readonly canvasWidth: number;
  readonly fonts: SkTypefaceFontProvider;
  readonly textContext: TextContext;
  readonly translate: (key: LabelKey) => string;
}

/** Draws one layer centered on (0, 0); the parent group positions, rotates and scales it. */
function LayerContent({
  layer,
  data,
  canvasWidth,
  fonts,
  textContext,
  translate,
}: LayerContentProps) {
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
      return <CenteredParagraph paragraph={paragraph} />;
    }
    case 'route': {
      if (data.mode !== 'activity' || data.activity.routePolyline === null) {
        return null;
      }
      const [route] = projectedRoutes([data.activity.routePolyline], ROUTE_BOX, ROUTE_BOX);
      return (
        <RouteLines routes={[route]} box={ROUTE_BOX} boxHeight={ROUTE_BOX} stroke={layer.stroke} />
      );
    }
    case 'summaryRoutes': {
      if (data.mode !== 'summary') {
        return null;
      }
      const routes = projectedRoutes(data.summary.routes, ROUTES_WIDTH, ROUTES_HEIGHT);
      return (
        <RouteLines
          routes={routes}
          box={ROUTES_WIDTH}
          boxHeight={ROUTES_HEIGHT}
          stroke={layer.stroke}
        />
      );
    }
    case 'summaryChart': {
      if (data.mode !== 'summary') {
        return null;
      }
      const values = data.buckets.map((bucket) =>
        layer.value === 'distance' ? bucket.distanceMeters : bucket.movingTimeSeconds,
      );
      const labels = layer.axisLabels
        ? formatBucketLabels(data.buckets, data.bucketSize, textContext.locale).map((label) =>
            label === ''
              ? null
              : buildParagraph(
                  fonts,
                  { ...LABEL_STYLE, color: layer.color },
                  { label: null, value: label, unit: null, valueSize: AXIS_LABEL_SIZE },
                ),
          )
        : null;
      return <BarChart values={values} color={layer.color} labels={labels} />;
    }
    case 'logo': {
      if (layer.brand === 'allrun') {
        return <Watermark variant={layer.variant} tone={layer.tone} />;
      }
      // Placeholder until the official Strava artwork lands; its guidelines allow this exact text.
      const paragraph = buildParagraph(
        fonts,
        {
          ...LABEL_STYLE,
          color: layer.tone === 'light' ? '#FFFFFF' : layer.tone === 'dark' ? '#000000' : '#141B2D',
          shadow: layer.tone === 'light',
        },
        { label: null, value: 'Powered by Strava', unit: null, valueSize: 30 },
      );
      return <CenteredParagraph paragraph={paragraph} />;
    }
  }
}

// Base sizes in canvas pixels (1080 px wide); each layer's `scale` multiplies them.
const VALUE_SIZE = 96;
const INFO_SIZE = 52;
const TEXT_SIZE = 60;
const AXIS_LABEL_SIZE = 26;
const ROUTE_BOX = 640;
const ROUTES_WIDTH = 800;
const ROUTES_HEIGHT = 560;
const CHART_WIDTH = 880;
const CHART_HEIGHT = 240;
/** Room under the bars for the axis labels. */
const LABEL_BAND = 44;
const MAX_TEXT_WIDTH = 1000;

type TextStyle = Extract<Layer, { kind: 'text' }>['style'];

const LABEL_STYLE: TextStyle = {
  font: 'inter',
  color: '#FFFFFF',
  bold: true,
  uppercase: false,
  align: 'center',
  shadow: true,
};

interface ParagraphContent {
  readonly label: string | null;
  readonly value: string;
  readonly unit: string | null;
  readonly valueSize: number;
}

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
    shadows: style.shadow
      ? [{ color: Skia.Color('rgba(0, 0, 0, 0.45)'), offset: { x: 0, y: 3 }, blurRadius: 10 }]
      : [],
  });
  const caseOf = (text: string) => (style.uppercase ? text.toLocaleUpperCase() : text);

  const builder = Skia.ParagraphBuilder.Make({ textAlign: ALIGN[style.align] }, fonts);
  if (content.label !== null) {
    builder
      .pushStyle(textStyle(content.valueSize * 0.34, false))
      .addText(`${caseOf(content.label)}\n`)
      .pop();
  }
  builder.pushStyle(textStyle(content.valueSize, style.bold)).addText(caseOf(content.value)).pop();
  if (content.unit !== null) {
    builder
      .pushStyle(textStyle(content.valueSize * 0.45, false))
      .addText(` ${content.unit}`)
      .pop();
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
    />
  );
}

function BarChart({
  values,
  color,
  labels,
}: {
  readonly values: readonly number[];
  readonly color: string;
  /** One paragraph per bar (`null` for unlabelled bars), or `null` for no axis labels. */
  readonly labels: readonly (SkParagraph | null)[] | null;
}) {
  if (values.length === 0) {
    return null;
  }
  const max = Math.max(...values);
  const slot = CHART_WIDTH / values.length;
  const barWidth = slot * 0.7;
  // Empty days still get a small mark so the time axis stays readable.
  const minHeight = Math.min(8, barWidth);
  const totalHeight = CHART_HEIGHT + (labels === null ? 0 : LABEL_BAND);
  return (
    <Group transform={[{ translateX: -CHART_WIDTH / 2 }, { translateY: -totalHeight / 2 }]}>
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
