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
import { createContext, type ReactElement, use } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { activityChartSeries, type LineSeries, splitRows } from '@/core/activity-charts';
import { castsShadow, contrastingInk } from '@/core/layer-style';
import type { Activity } from '@/core/activity';
import { type HeartRateZones, timeInZones, zoneIndex, zoneRange } from '@/core/heart-rate-zones';
import {
  CAPTION_INK,
  type CropFrame,
  cropFrame,
  layerPictures,
  type BoothBox,
  boothBox,
  type CalendarBox,
  calendarBox,
  type ChatBox,
  chatBox,
  type MarginsBox,
  marginsBox,
  type SlidesBox,
  slidesBox,
  FRAME_COLORS,
  INSTANT_COLORS,
  type ImageBox,
  imageBox,
  type InstantBox,
  instantBox,
  instantFrame,
  isPhotoSlot,
  type MountBox,
  mountBox,
  PICTURE_RADIUS,
  SAMPLE_IMAGE,
  SAMPLE_PICTURE,
  SLOT_PICTURE,
  slotBox,
  STRIP_TEXT_INSET,
} from '@/core/image-layer';
import type { HitHole, HitLine, LayerTransform } from '@/core/layer-transform';
import type { PhotoDrawing, Size } from '@/core/photo-placement';
import type { Phrase } from '@/core/phrases';
import { decodePolyline } from '@/core/polyline';
import { DEFAULT_PRIVACY_TRIM_METERS, trimRouteEnds } from '@/core/route-privacy';
import { type Point, projectRoutes } from '@/core/route-projection';
import {
  type ActivityChartSeries,
  CANVAS_FORMATS,
  type CanvasFormat,
  type FontId,
  type Layer,
  type Template,
} from '@/core/template';
import { formatDuration } from '@/core/units';
import { formatActivityDate, formatBucketLabels } from '@/ui/format';

import {
  activityChartHeader,
  chartBuckets,
  type EditorData,
  type HeaderDatum,
  type LabelKey,
  layerText,
  type ParagraphContent,
  periodChartHeader,
  periodName,
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
import { type CaptionText, instantCaption } from './instant-caption';
import {
  boothCaption,
  calendarCaption,
  type CalendarText,
  marginsCaption,
  type MarginsText,
  type BoothText,
  cropCaption,
  slidesCaption,
  type LetteredMount,
  MOUNT_ARROW as MOUNT_ARROW_MARK,
  mountCaption,
  type MountMarks,
  type MountSide,
  type MountStrip,
} from './mount-caption';
import { discardParagraph, finishParagraph } from './paragraph-arena';
import { ParagraphPicture } from './paragraph-picture';

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
  /** The lines that alone take touches, for a layer of lines such as a route (see `HitLine`). */
  readonly line?: HitLine;
  /** The size of its words, in a widget whose words are chosen from a list. */
  readonly wordsSize?: number;
}

/**
 * A picture of the user's, by its key (see `image-layer.ts`): its size, known when it is picked,
 * and the picture once decoded (`null` while it loads).
 */
export interface LayerImage {
  readonly size: Size;
  readonly image: SkImage | null;
}

/** What layers need to be filled in and measured. */
export interface LayerContext {
  readonly data: EditorData;
  /** The user's pictures, by key; none in the gallery, which shows a sample instead. */
  readonly images?: ReadonlyMap<string, LayerImage>;
  /**
   * What a design's slot with no picture shows: the sign to fill it (`hint`, on the canvas) or
   * nothing (`blank`, in the image). Absent, the pictures of `images`, for a thumbnail.
   */
  readonly emptySlots?: 'hint' | 'blank';
  readonly fonts: SkTypefaceFontProvider;
  readonly textContext: TextContext;
  /** Translates a label; `values` fill its placeholders, such as the chart title's unit. */
  readonly translate: (key: LabelKey, values?: Readonly<Record<string, string>>) => string;
  /** The verses, quotes and chat phrases, as the phone has them; by default, the built-in. */
  readonly phrases?: readonly Phrase[];
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

/** Group transform that places a photo: at its center, turned around it (see `drawPhoto`). */
export function photoMatrix(drawing: PhotoDrawing): Transforms3d {
  'worklet';
  return [{ translateX: drawing.x }, { translateY: drawing.y }, { rotate: drawing.rotation }];
}

/** Where the photo goes inside its {@link photoMatrix} group: centered on it. */
export function photoRect(drawing: PhotoDrawing): DrawRect {
  'worklet';
  return {
    x: -drawing.width / 2,
    y: -drawing.height / 2,
    width: drawing.width,
    height: drawing.height,
  };
}

/** The photo of a scene: drawn in `rect` inside a group transformed by `matrix`. */
export interface ScenePhoto {
  readonly image: SkImage;
  readonly matrix: Transforms3d | SharedValue<Transforms3d>;
  readonly rect: DrawRect | SharedValue<DrawRect>;
}

/** A cell of a collage in a scene: its photo clipped to it, loading, or empty. */
export type SceneCell =
  | { readonly kind: 'photo'; readonly clip: DrawRect; readonly photo: ScenePhoto }
  | { readonly kind: 'loading'; readonly clip: DrawRect }
  /** Without a photo: nothing in the image, a sign to fill it on the canvas when `hint`. */
  | { readonly kind: 'empty'; readonly clip: DrawRect; readonly hint: boolean };

/** The photos of a collage in a scene. */
export interface SceneCollage {
  readonly cells: readonly SceneCell[];
  /** The cell being edited, on the canvas: the others dim, so it stands out; `null` for none. */
  readonly activeCell: number | null;
}

/** The frame around a design's photos, in a scene. */
export interface SceneFrame {
  readonly bars: readonly DrawRect[];
  readonly color: string;
}

/** Over the cells that aren't being edited. Under the frame and the widgets, which stay as they are. */
const DIMMED_CELL = 'rgba(0, 0, 0, 0.6)';
/** A photo's cell while its copy is prepared: as a picture's while it is decoded. */
const LOADING_CELL = '#3A3A3C';
/** The sign on an empty cell, on the canvas: a plus on a dark circle, in canvas pixels. */
const EMPTY_HINT = { radius: 56, length: 52, thickness: 7 } as const;

/**
 * How many times bigger the scene draws the sign of an empty photo (see `EMPTY_HINT`): 1 on the
 * canvas; more in a thumbnail, where at the canvas's size it was a dot (see `emptyHintScale`).
 */
export const EmptyHintScale = createContext(1);

/** Smallest radius of an empty photo's sign in a thumbnail, at the canvas's level, in points. */
const THUMBNAIL_HINT_RADIUS = 10;

/**
 * The `EmptyHintScale` of a scene drawn `ratio` points per canvas pixel: its sign at least
 * `THUMBNAIL_HINT_RADIUS` points in radius, never smaller than on the canvas.
 */
export function emptyHintScale(ratio: number): number {
  return Math.max(1, THUMBNAIL_HINT_RADIUS / (EMPTY_HINT.radius * ratio));
}

/** One cell of a collage. */
function CollageCellScene({ cell }: { readonly cell: SceneCell }) {
  const { clip } = cell;
  if (cell.kind === 'photo') {
    return (
      <Group clip={clip}>
        <Group transform={cell.photo.matrix}>
          <Image
            image={cell.photo.image}
            rect={cell.photo.rect}
            fit="fill"
            sampling={PHOTO_SAMPLING}
          />
        </Group>
      </Group>
    );
  }
  if (cell.kind === 'loading') {
    return <Rect {...clip} color={LOADING_CELL} />;
  }
  return cell.hint ? (
    <EmptySign cx={clip.x + clip.width / 2} cy={clip.y + clip.height / 2} />
  ) : null;
}

/** The sign to fill an empty place with a photo, on the canvas: never in the image. */
function EmptySign({ cx, cy }: { readonly cx: number; readonly cy: number }) {
  const scale = use(EmptyHintScale);
  const radius = EMPTY_HINT.radius * scale;
  const length = EMPTY_HINT.length * scale;
  const thickness = EMPTY_HINT.thickness * scale;
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={radius} color="rgba(0, 0, 0, 0.45)" />
      <Rect
        x={cx - length / 2}
        y={cy - thickness / 2}
        width={length}
        height={thickness}
        color="#FFFFFF"
      />
      <Rect
        x={cx - thickness / 2}
        y={cy - length / 2}
        width={thickness}
        height={length}
        color="#FFFFFF"
      />
    </Group>
  );
}

/**
 * Draws prepared layers over the background at the export size (1080 px wide). The editor scales
 * it to the screen; exporting renders it off-screen at full size, so both always match.
 */
export interface TemplateSceneProps {
  readonly format: CanvasFormat;
  readonly layers: readonly PreparedLayer[];
  /**
   * What shows where the photo leaves the canvas empty (and with no photo):
   * - `color`: the design's background, at `opacity` when given (on screen, live while its bar
   *   moves), and over the checkerboard when `onChecker` (on screen, where a translucent one shows
   *   what it lets through);
   * - `checker`: nothing, shown as the usual checkerboard of transparency (dark, so white widgets
   *   stay readable), on screen;
   * - `none`: nothing, for the transparent export.
   */
  readonly backdrop:
    | {
        readonly kind: 'color';
        readonly color: string;
        readonly opacity?: SharedValue<number>;
        readonly onChecker?: boolean;
      }
    | {
        readonly kind: 'checker';
        /** The side of its squares, in canvas pixels; by default `CHECKER_SQUARE`. */
        readonly square?: number;
      }
    | { readonly kind: 'none' };
  /**
   * The photo over the backdrop, or `null` for none (see {@link photoMatrix} and
   * {@link photoRect}). The editor passes shared values so gestures move it without re-rendering
   * the layers.
   */
  readonly photo: ScenePhoto | null;
  /** The photos of a collage over the backdrop, instead of `photo`. */
  readonly collage?: SceneCollage | null;
  /** The frame over the photos, under the widgets. */
  readonly frame?: SceneFrame | null;
  /**
   * The layer being moved, drawn from a shared transform so gestures don't re-render, with a
   * shared opacity (it fades over the trash).
   */
  readonly live?: {
    readonly id: string;
    readonly matrix: SharedValue<Transforms3d>;
    readonly opacity: SharedValue<number>;
  } | null;
  /**
   * While a gesture lasts, textures of what it leaves still and of the widget it moves, instead of
   * drawing them again on every frame (see `useGestureTextures`). The widgets are not drawn then.
   */
  readonly textures?: SceneTextures | null;
}

/** A texture of the scene and the rectangle of the scene it covers. */
interface SceneTexture {
  readonly image: SharedValue<SkImage | null>;
  readonly rect: DrawRect;
}

/** The textures a gesture draws with: only those it needs. */
export interface SceneTextures {
  /** Everything under what moves, instead of the backdrop, the photos and the frame. */
  readonly under: SceneTexture | null;
  readonly over: SceneTexture | null;
  /** The widget that moves, in its own coordinates, under the transform and opacity of `live`. */
  readonly live: SceneTexture | null;
}

/** The two tones of the transparency checkerboard and the side of its squares (canvas pixels). */
const CHECKER_DARK = '#1C1C1E';
const CHECKER_LIGHT = '#2C2C2E';
const CHECKER_SQUARE = 40;

/** Smallest side of the checkerboard's squares in a thumbnail, on screen, in points. */
const THUMBNAIL_CHECKER_SQUARE = 10;

/**
 * The side of the checkerboard's squares, in canvas pixels, of a scene drawn `ratio` points per
 * canvas pixel: at least `THUMBNAIL_CHECKER_SQUARE` points on screen, never smaller than on the
 * canvas. In a thumbnail, the canvas's squares were so small that it looked black, like a black
 * background (the user's report).
 */
export function checkerSquare(ratio: number): number {
  return Math.max(CHECKER_SQUARE, Math.round(THUMBNAIL_CHECKER_SQUARE / ratio));
}

/** The light squares of the checkerboard of each format and size of square, built once. */
const checkerPaths = new Map<string, SkPath>();

function checkerPath(format: CanvasFormat, square: number): SkPath {
  const key = `${format}|${square}`;
  const cached = checkerPaths.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const { width, height } = CANVAS_FORMATS[format];
  const builder = Skia.PathBuilder.Make();
  for (let row = 0; row * square < height; row++) {
    for (let column = row % 2; column * square < width; column += 2) {
      builder.addRect(Skia.XYWHRect(column * square, row * square, square, square));
    }
  }
  const path = builder.detach();
  checkerPaths.set(key, path);
  return path;
}

/**
 * Photos are usually much larger than the canvas; trilinear filtering (linear + mipmaps) keeps
 * them smooth when scaled down instead of aliased.
 */
const PHOTO_SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear } as const;
/** What stays still in a gesture is as sharp as the screen, one pixel to one pixel. */
const TEXTURE_SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None } as const;
/**
 * The widget a gesture moves turns and shrinks: with mipmaps and more pixels than it shows (see
 * `LIVE_TEXTURE_SHARPNESS` in `editor-canvas.tsx`), its edges don't saw-tooth meanwhile.
 */
const LIVE_TEXTURE_SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear } as const;

export function TemplateScene({
  format,
  layers,
  backdrop,
  photo,
  collage = null,
  frame = null,
  live = null,
  textures = null,
}: TemplateSceneProps) {
  const canvas = CANVAS_FORMATS[format];
  const { width, height } = canvas;
  if (textures !== null && textures.under !== null) {
    return (
      <Group>
        <SceneImage texture={textures.under} />
        {textures.live === null || live === null ? null : (
          <Group transform={live.matrix}>
            <SceneImage
              texture={textures.live}
              opacity={live.opacity}
              sampling={LIVE_TEXTURE_SAMPLING}
            />
          </Group>
        )}
        {textures.over === null ? null : <SceneImage texture={textures.over} />}
      </Group>
    );
  }
  return (
    <Group>
      {backdrop.kind === 'checker' || (backdrop.kind === 'color' && backdrop.onChecker === true) ? (
        <Group clip={{ x: 0, y: 0, width, height }}>
          <Rect x={0} y={0} width={width} height={height} color={CHECKER_DARK} />
          <Path
            path={checkerPath(
              format,
              backdrop.kind === 'checker' ? (backdrop.square ?? CHECKER_SQUARE) : CHECKER_SQUARE,
            )}
            color={CHECKER_LIGHT}
          />
        </Group>
      ) : null}
      {backdrop.kind === 'color' ? (
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          color={backdrop.color}
          opacity={backdrop.opacity}
        />
      ) : null}
      {photo === null ? null : (
        <Group clip={{ x: 0, y: 0, width, height }}>
          <Group transform={photo.matrix}>
            <Image image={photo.image} rect={photo.rect} fit="fill" sampling={PHOTO_SAMPLING} />
          </Group>
        </Group>
      )}
      {collage === null ? null : (
        <Group>
          {collage.cells.map((cell, index) => (
            <CollageCellScene key={index} cell={cell} />
          ))}
          {collage.activeCell === null
            ? null
            : collage.cells.map((cell, index) =>
                index === collage.activeCell ? null : (
                  <Rect key={index} {...cell.clip} color={DIMMED_CELL} />
                ),
              )}
        </Group>
      )}
      {frame === null
        ? null
        : frame.bars.map((bar, index) => <Rect key={index} {...bar} color={frame.color} />)}
      {/* A layer's opacity fades it as a whole, drawn on its own Skia layer: a group's `opacity`
          only reaches shapes (paragraphs ignore it) and fades each shape and its shadow apart,
          letting the shadow show through. Opaque layers skip the extra layer. */}
      {textures?.over !== null && textures?.over !== undefined ? (
        <SceneImage texture={textures.over} />
      ) : textures !== null ? null : (
        layers.map(({ layer, content, width, height }) =>
          live !== null && live.id === layer.id ? (
            <Group
              key={layer.id}
              transform={live.matrix}
              clip={layerClip(width, height)}
              layer={<Paint opacity={live.opacity} />}
            >
              {content}
            </Group>
          ) : (
            <Group
              key={layer.id}
              transform={layerMatrix(layer.transform, canvas)}
              clip={layerClip(width, height)}
              layer={layer.opacity < 1 ? <Paint opacity={layer.opacity} /> : undefined}
            >
              {content}
            </Group>
          ),
        )
      )}
    </Group>
  );
}

/** A texture of a gesture in its place. */
function SceneImage({
  texture,
  opacity,
  sampling = TEXTURE_SAMPLING,
}: {
  readonly texture: SceneTexture;
  readonly opacity?: SharedValue<number>;
  readonly sampling?: typeof TEXTURE_SAMPLING | typeof LIVE_TEXTURE_SAMPLING;
}) {
  return (
    <Image
      image={texture.image}
      rect={texture.rect}
      fit="fill"
      sampling={sampling}
      opacity={opacity}
    />
  );
}

/** What a layer may draw past its box, in pixels before its scale: its shadow, at the most. */
const LAYER_CLIP_MARGIN = 32;

/**
 * Where a layer draws: its box, centered on its origin, and room for its shadow. The widgets' shadows
 * are image filters on Skia layers, which are as big as the clip: without this each one blurred the
 * whole canvas, in every frame of a drag (53 ms a frame on a Samsung M32).
 */
export function layerClip(width: number, height: number) {
  return {
    x: -width / 2 - LAYER_CLIP_MARGIN,
    y: -height / 2 - LAYER_CLIP_MARGIN,
    width: width + 2 * LAYER_CLIP_MARGIN,
    height: height + 2 * LAYER_CLIP_MARGIN,
  };
}

/** Fills in and measures one layer, or `null` when it has nothing to show for this data. */
function prepareLayer(
  layer: Layer,
  { data, fonts, textContext, translate, images, emptySlots, phrases }: LayerContext,
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
      const block = prepareActivityBlock(layer, data, {
        fonts,
        textContext,
        translate,
        canvas,
        phrases,
      });
      return block === null ? null : { layer, ...block };
    }
    case 'summaryBlock': {
      if (data.mode !== 'summary') {
        return null;
      }
      const block = prepareSummaryBlock(layer, data, {
        fonts,
        textContext,
        translate,
        canvas,
        phrases,
      });
      return block === null ? null : { layer, ...block };
    }
    case 'image': {
      // A picture not known yet (the gallery's sample before it is decoded) shows as loading.
      const picked = images?.get(layer.image);
      const empty =
        emptySlots !== undefined &&
        isPhotoSlot(layer) &&
        (layer.image === SAMPLE_IMAGE || picked === undefined)
          ? emptySlots
          : null;
      if (layer.mount === 'slides') {
        const box = slidesBox();
        const slides = layerPictures(layer).map((key) => {
          const one = images?.get(key);
          return {
            picture: one?.image ?? null,
            empty:
              emptySlots !== undefined && (key === SAMPLE_IMAGE || one === undefined)
                ? emptySlots
                : null,
          };
        });
        return {
          layer,
          width: box.width,
          height: box.height,
          content: (
            <SlidesWidget
              box={box}
              slides={slides}
              data={slidesData(fonts, slidesCaption(data, textContext, translate), box)}
            />
          ),
        };
      }
      if (layer.mount === 'calendar') {
        const box = calendarBox();
        const look = CALENDAR_LOOK[layer.cover ?? 'red'];
        return {
          layer,
          width: box.width,
          height: box.height,
          content: (
            <CalendarWidget
              box={box}
              picture={picked?.image ?? null}
              empty={empty}
              ink={look}
              texts={calendarTexts(
                fonts,
                calendarCaption(data, textContext, translate),
                box,
                look,
                textContext.locale,
              )}
            />
          ),
        };
      }
      if (layer.mount === 'margins' || layer.mount === 'marginsPair') {
        const box = marginsBox(layer.mount === 'margins' ? 3 : 2, canvas);
        const photos = layerPictures(layer).map((key) => {
          const one = images?.get(key);
          return {
            picture: one?.image ?? null,
            empty:
              emptySlots !== undefined && (key === SAMPLE_IMAGE || one === undefined)
                ? emptySlots
                : null,
          };
        });
        return {
          layer,
          ...canvas,
          content: (
            <MarginsWidget
              box={box}
              photos={photos}
              texts={marginsTexts(
                fonts,
                marginsCaption(data, textContext, translate),
                box,
                textContext.locale,
              )}
            />
          ),
        };
      }
      if (layer.mount === 'chat' || layer.mount === 'chatPair') {
        const box = chatBox(layer.mount === 'chatPair', canvas);
        const photos = layerPictures(layer).map((key) => {
          const one = images?.get(key);
          return {
            picture: one?.image ?? null,
            empty:
              emptySlots !== undefined && (key === SAMPLE_IMAGE || one === undefined)
                ? emptySlots
                : null,
          };
        });
        // The message is the chat widget's own, drawn into its band.
        const common = {
          id: layer.id,
          transform: layer.transform,
          opacity: 1,
          logo: false,
          style: { font: 'inter', color: '#FFFFFF', bold: false, uppercase: false },
        } as const;
        const context = { fonts, textContext, translate, canvas, phrases };
        const message =
          data.mode === 'activity'
            ? prepareActivityBlock(
                { ...common, kind: 'activityBlock', block: { design: 'message', layout: 'dark' } },
                data,
                context,
              )
            : prepareSummaryBlock(
                {
                  ...common,
                  kind: 'summaryBlock',
                  block: { design: 'periodMessage', layout: 'dark' },
                },
                data,
                context,
              );
        const date =
          data.mode === 'activity'
            ? formatActivityDate(data.activity.startLocal, textContext.locale, 'long')
            : periodName(data, textContext, translate);
        return {
          layer,
          width: box.width,
          height: box.height,
          content: (
            <ChatWidget
              box={box}
              photos={photos}
              date={chatDate(fonts, date, box)}
              message={message}
            />
          ),
        };
      }
      if (layer.mount === 'photobooth') {
        const box = boothBox();
        const photos = layerPictures(layer).map((key) => {
          const one = images?.get(key);
          return {
            picture: one?.image ?? null,
            empty:
              emptySlots !== undefined && (key === SAMPLE_IMAGE || one === undefined)
                ? emptySlots
                : null,
          };
        });
        return {
          layer,
          width: box.width,
          height: box.height,
          content: (
            <BoothWidget
              box={box}
              photos={photos}
              writing={boothWriting(fonts, boothCaption(data, textContext, translate), box)}
            />
          ),
        };
      }
      if (layer.mount === 'camera') {
        // The app's view over the picture, as one widget: moving it moves the picture.
        const common = {
          id: layer.id,
          transform: layer.transform,
          opacity: 1,
          logo: false,
          style: { font: 'inter', color: '#FFFFFF', bold: false, uppercase: false },
        } as const;
        const context = { fonts, textContext, translate, canvas, phrases };
        const view =
          data.mode === 'activity'
            ? prepareActivityBlock(
                { ...common, kind: 'activityBlock', block: { design: 'camera' } },
                data,
                context,
              )
            : prepareSummaryBlock(
                { ...common, kind: 'summaryBlock', block: { design: 'periodCamera' } },
                data,
                context,
              );
        return {
          layer,
          ...canvas,
          content: (
            <CameraWidget
              box={mountBox('camera', canvas)}
              picture={picked?.image ?? null}
              empty={empty}
              view={view?.content ?? null}
            />
          ),
        };
      }
      if (layer.mount === 'crop') {
        const frame = cropFrame(canvas);
        return {
          layer,
          ...canvas,
          content: (
            <CropWidget
              box={mountBox('crop', canvas)}
              frame={frame}
              picture={picked?.image ?? null}
              empty={empty}
              pill={cropPill(fonts, cropCaption(data, textContext, translate), frame)}
            />
          ),
        };
      }
      if (layer.mount !== undefined) {
        const box = mountBox(layer.mount, canvas);
        const { sides, marks, strip } = mountCaption(layer.mount, data, textContext, translate);
        return {
          layer,
          width: box.width,
          height: box.height,
          content: (
            <MountWidget
              mount={layer.mount}
              box={box}
              picture={picked?.image ?? null}
              empty={empty}
              sides={mountSides(fonts, layer.mount, box, sides, textContext.locale)}
              marks={mountMarks(fonts, layer.mount, box, marks, strip, textContext.locale)}
            />
          ),
        };
      }
      if (layer.caption !== undefined) {
        const box = instantBox();
        const frame = instantFrame(layer.frame);
        const caption = captionParagraphs(
          fonts,
          instantCaption(layer.caption, data, textContext, translate),
          box.caption,
          CAPTION_INK[frame],
          textContext.locale,
        );
        return {
          layer,
          width: box.width,
          height: box.height,
          content: (
            <InstantWidget
              box={box}
              frame={INSTANT_COLORS[frame]}
              picture={picked?.image ?? null}
              empty={empty}
              caption={caption}
            />
          ),
        };
      }
      const box =
        layer.slot === true
          ? slotBox(empty === null ? (picked?.size ?? SLOT_PICTURE) : SLOT_PICTURE, layer.frame)
          : imageBox(picked?.size ?? SAMPLE_PICTURE, layer.frame);
      return {
        layer,
        width: box.width,
        height: box.height,
        content: (
          <PictureWidget
            box={box}
            frame={layer.frame === 'none' ? null : FRAME_COLORS[layer.frame]}
            picture={picked?.image ?? null}
            radius={layer.rounded === true ? PICTURE_RADIUS : 0}
            empty={empty}
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

/** Shown in a picture while it is decoded: a neutral gray, as a photo app's empty cell. */
const LOADING_PICTURE = '#3A3A3C';

/**
 * A picture of the user's in its frame, lifted off the photo by a shadow. `picture` is the
 * decoded image, `null` while it loads.
 */
function PictureWidget({
  box,
  frame,
  picture,
  radius,
  empty,
}: {
  readonly box: ImageBox;
  readonly frame: string | null;
  readonly picture: SkImage | null;
  /** The radius of the picture's corners; its frame's go around them. */
  readonly radius: number;
  /** A slot with no picture: the sign to fill it, on the canvas, or nothing, in the image. */
  readonly empty: 'hint' | 'blank' | null;
}) {
  if (empty === 'blank') {
    return null;
  }
  const rect = box.picture;
  const outer = radius === 0 ? 0 : radius + (box.width - rect.width) / 2;
  const shape = Skia.RRectXY(
    Skia.XYWHRect(rect.x, rect.y, rect.width, rect.height),
    radius,
    radius,
  );
  return (
    <Group
      layer={
        <Paint>
          <DropShadow />
        </Paint>
      }
    >
      {frame === null ? null : (
        <RoundedRect
          x={-box.width / 2}
          y={-box.height / 2}
          width={box.width}
          height={box.height}
          r={outer}
          color={frame}
        />
      )}
      <Group clip={shape}>
        {empty === null && picture !== null ? (
          // Its proportions are the picture's: it fills its place without cropping.
          <Image image={picture} rect={rect} fit="fill" sampling={PHOTO_SAMPLING} />
        ) : (
          <Rect {...rect} color={LOADING_PICTURE} />
        )}
        {empty === 'hint' ? (
          <EmptySign cx={rect.x + rect.width / 2} cy={rect.y + rect.height / 2} />
        ) : null}
      </Group>
    </Group>
  );
}

/**
 * An instant photo: a Polaroid's frame with the picture cut square in it and its caption under
 * it, lifted off the photo by a shadow. As a design's slot with no picture, the sign to fill it
 * (`hint`) or only its frame (`blank`, in the image).
 */
function InstantWidget({
  box,
  frame,
  picture,
  empty,
  caption,
}: {
  readonly box: InstantBox;
  readonly frame: string;
  readonly picture: SkImage | null;
  readonly empty: 'hint' | 'blank' | null;
  readonly caption: readonly PlacedParagraph[];
}) {
  const rect = box.picture;
  return (
    <Group
      layer={
        <Paint>
          <DropShadow />
        </Paint>
      }
    >
      <Rect
        x={-box.width / 2}
        y={-box.height / 2}
        width={box.width}
        height={box.height}
        color={frame}
      />
      {empty === 'blank' ? null : empty === null && picture !== null ? (
        // Cut square around its middle, as an instant camera frames it.
        <Image image={picture} rect={rect} fit="cover" sampling={PHOTO_SAMPLING} />
      ) : (
        <Rect {...rect} color={LOADING_PICTURE} />
      )}
      {empty === 'hint' ? (
        <EmptySign cx={rect.x + rect.width / 2} cy={rect.y + rect.height / 2} />
      ) : null}
      {caption.map(({ paragraph, x, y }, i) => (
        <ParagraphPicture
          key={i}
          paragraph={paragraph}
          x={x}
          y={y}
          width={Math.ceil(paragraph.getLongestLine()) + 1}
        />
      ))}
    </Group>
  );
}

/** How each holder looks: its color, its letters and how they read along its sides. */
const MOUNT_LOOKS: Readonly<
  Record<
    LetteredMount,
    {
      readonly color: string;
      readonly ink: string;
      readonly font: FontId;
      readonly bold: boolean;
      readonly size: number;
      /** How its sides are turned: 1 reads downwards, -1 upwards. */
      readonly turn: 1 | -1;
    }
  >
> = {
  filmFrame: {
    color: '#000000',
    ink: '#FFFFFF',
    font: 'spaceMono',
    bold: true,
    size: 24,
    turn: 1,
  },
  filmStrip: {
    color: '#161616',
    ink: '#FFFFFF',
    font: 'unbounded',
    bold: false,
    size: 0,
    turn: 1,
  },
  // Thin, as a date a camera stamps on a negative (the user's choice).
  lightNegative: {
    color: '#E6E6E3',
    ink: '#2C2C2E',
    font: 'orbitron',
    bold: false,
    size: 19,
    turn: -1,
  },
};

/** A strip of film's texts: their sizes, and the gray of all of them but the main datum. */
const MOUNT_STRIP = { top: 13, data: 16, main: 17, faded: '#9A9A9E', gap: 1 } as const;

/** The marks on a reel's edge, in the bands above and below a frame: their color and size. */
const MOUNT_MARKS = { color: '#E9A23B', size: 18, gap: 1.5 } as const;

/** Least room between two texts of a holder's side, as a share of their size. */
const MOUNT_TEXT_GAP = 1;
/** Room between letters of a holder's texts, as a share of their size. */
const MOUNT_TRACKING = 0.03;
/** The arrow inside a holder's text: its size and the room at each side, as shares of the text's. */
const MOUNT_ARROW = { size: 0.5, room: 0.45 } as const;

/** A holder's side laid out: its texts at the size that fits, and the place of each. */
interface LaidOutSide {
  readonly rect: DrawRect;
  readonly paragraphs: readonly { readonly paragraph: SkParagraph; readonly at: number }[];
  /** Where each arrow goes along the side, by its left end, and how big. */
  readonly arrows: readonly number[];
  readonly arrowSize: number;
}

/**
 * Lays out a holder's texts along its two sides (see `MOUNT_LOOKS`), spread along each, shrunk
 * together so that they fit with room between them. An arrow in a text is drawn apart: the fonts of the film's edge don't have one. Time O(t) for t texts, each
 * laid out at most twice.
 */
function mountSides(
  fonts: SkTypefaceFontProvider,
  mount: LetteredMount,
  box: MountBox,
  sides: readonly [MountSide, MountSide],
  locale: string,
): readonly LaidOutSide[] {
  const look = MOUNT_LOOKS[mount];
  const layOut = (text: string, size: number) => {
    const builder = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Left }, fonts);
    builder.pushStyle({
      color: Skia.Color(look.ink),
      fontFamilies: fontFamiliesOf(look.font),
      fontSize: size,
      fontStyle: { weight: drawsBold(look.font, look.bold) ? FontWeight.Bold : FontWeight.Normal },
      letterSpacing: size * MOUNT_TRACKING,
    });
    builder.addText(text.toLocaleUpperCase(locale));
    builder.pop();
    const paragraph = finishParagraph(builder);
    paragraph.layout(NO_WRAP_WIDTH);
    paragraph.layout(Math.ceil(paragraph.getLongestLine()) + 1);
    return paragraph;
  };
  /** Each text at `size`, in its parts: the arrows go between them. */
  const layOutAll = (texts: readonly string[], size: number) =>
    texts.map((one) => one.split(MOUNT_ARROW_MARK).map((part) => layOut(part.trim(), size)));
  const arrowRoom = (size: number) => size * (MOUNT_ARROW.size + 2 * MOUNT_ARROW.room);
  /** How long a text is along its side: its parts, and an arrow between each two. */
  const lengthOf = (parts: readonly SkParagraph[], size: number) =>
    parts.reduce((sum, part) => sum + part.getLongestLine(), 0) +
    (parts.length - 1) * arrowRoom(size);
  return sides.map((side, index): LaidOutSide => {
    const rect = box.sides[index];
    const length = rect.height;
    const count = side.texts.length;
    const needed = (texts: readonly (readonly SkParagraph[])[], size: number) =>
      texts.reduce((sum, parts) => sum + lengthOf(parts, size), 0) +
      size * MOUNT_TEXT_GAP * (count - 1);
    let size: number = look.size;
    let texts = layOutAll(side.texts, size);
    const fit = Math.min(1, length / Math.max(1, needed(texts, size)));
    if (fit < 1) {
      texts.flat().forEach(discardParagraph);
      size *= fit;
      texts = layOutAll(side.texts, size);
    }
    // What is left goes evenly between them; alone, a text goes in the middle of its side.
    const free = length - needed(texts, size);
    const gap = size * MOUNT_TEXT_GAP + (count > 1 ? free / (count - 1) : 0);
    let at = count === 1 ? -needed(texts, size) / 2 : -length / 2;
    const paragraphs: { readonly paragraph: SkParagraph; readonly at: number }[] = [];
    const arrows: number[] = [];
    for (const parts of texts) {
      parts.forEach((paragraph, i) => {
        if (i > 0) {
          arrows.push(at + size * MOUNT_ARROW.room);
          at += arrowRoom(size);
        }
        paragraphs.push({ paragraph, at });
        at += paragraph.getLongestLine();
      });
      at += gap;
    }
    return {
      rect,
      paragraphs,
      arrows,
      arrowSize: size * MOUNT_ARROW.size,
    };
  });
}

/**
 * A holder's texts around its window laid out, and the arrow of its main datum, if it has one; for a
 * holder laid up the canvas (`upright`), as across it, drawn turned a quarter.
 */
interface LaidOutMarks {
  readonly paragraphs: readonly PlacedParagraph[];
  readonly arrow: {
    readonly x: number;
    readonly y: number;
    readonly size: number;
  } | null;
}

/**
 * Lays out a holder's reel marks in the bands above and below its window (see `MountMarks`), each
 * band's two ends shrunk together so that they fit it. Time O(1).
 */
function mountMarks(
  fonts: SkTypefaceFontProvider,
  mount: LetteredMount,
  box: MountBox,
  marks: MountMarks,
  strip: MountStrip | undefined,
  locale: string,
): LaidOutMarks {
  if (box.upright === true) {
    // Laid up the canvas: its texts are laid out as across it, and drawn turned a quarter.
    const { picture } = box;
    return mountMarks(
      fonts,
      mount,
      {
        ...box,
        width: box.height,
        height: box.width,
        picture: {
          x: picture.y,
          y: -(picture.x + picture.width),
          width: picture.height,
          height: picture.width,
        },
        upright: false,
      },
      marks,
      strip,
      locale,
    );
  }
  const look = MOUNT_LOOKS[mount];
  const { x: left, y: top, width } = box.picture;
  const right = left + width;
  const layOut = (
    text: string,
    size: number,
    color: string = MOUNT_MARKS.color,
    bold: boolean = true,
  ) => {
    const builder = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Left }, fonts);
    builder.pushStyle({
      color: Skia.Color(color),
      fontFamilies: fontFamiliesOf(look.font),
      fontSize: size,
      fontStyle: { weight: drawsBold(look.font, bold) ? FontWeight.Bold : FontWeight.Normal },
      letterSpacing: size * MOUNT_TRACKING,
    });
    builder.addText(text.toLocaleUpperCase(locale));
    builder.pop();
    const paragraph = finishParagraph(builder);
    paragraph.layout(NO_WRAP_WIDTH);
    paragraph.layout(Math.ceil(paragraph.getLongestLine()) + 1);
    return paragraph;
  };
  /** A band at height `y`: its two ends, shrunk together to fit, so a long place never runs over. */
  const band = (leftText: string | null, rightText: string | null, y: number) => {
    const texts = [leftText, rightText];
    const room = (paragraphs: readonly (SkParagraph | null)[], size: number) =>
      paragraphs.reduce((sum, paragraph) => sum + (paragraph?.getLongestLine() ?? 0), 0) +
      size * MOUNT_MARKS.gap;
    const of = (size: number) => texts.map((text) => (text === null ? null : layOut(text, size)));
    let size: number = MOUNT_MARKS.size;
    let paragraphs = of(size);
    const fit = Math.min(1, width / room(paragraphs, size));
    if (fit < 1) {
      paragraphs.forEach((paragraph) => {
        if (paragraph !== null) {
          discardParagraph(paragraph);
        }
      });
      size *= fit;
      paragraphs = of(size);
    }
    return paragraphs.flatMap((paragraph, i): PlacedParagraph[] =>
      paragraph === null
        ? []
        : [
            {
              paragraph,
              x: i === 0 ? left : right - paragraph.getLongestLine(),
              y: y - paragraph.getHeight() / 2,
            },
          ],
    );
  };
  const topBand = (-box.height / 2 + top) / 2;
  if (strip !== undefined) {
    return stripTexts(strip);
  }
  return {
    paragraphs: [
      ...band(marks.topLeft, marks.topRight, topBand),
      ...band(marks.bottomLeft, marks.bottomRight, -topBand),
    ],
    arrow: null,
  };

  /** A strip's texts: one centered over its frame, and its data under it, spread and fitted. */
  function stripTexts({ top: over, left: first, main, right: last }: MountStrip): LaidOutMarks {
    const heading = layOut(over, MOUNT_STRIP.top, MOUNT_STRIP.faded, false);
    const y = box.height / 2 - STRIP_TEXT_INSET;
    const row = (scale: number) => ({
      first:
        first === null ? null : layOut(first, MOUNT_STRIP.data * scale, MOUNT_STRIP.faded, false),
      main: layOut(main, MOUNT_STRIP.main * scale, look.ink, true),
      last: last === null ? null : layOut(last, MOUNT_STRIP.data * scale, MOUNT_STRIP.faded, false),
    });
    // The main datum is centered, so what limits it is the wider side of the two.
    const sideOf = (one: SkParagraph | null) => one?.getLongestLine() ?? 0;
    let laid = row(1);
    let scale = 1;
    /** How much the arrow takes before the main datum, at its size. */
    const arrowRoom = (size: number) => size * (MOUNT_ARROW.size + MOUNT_ARROW.room);
    const taken =
      laid.main.getLongestLine() +
      arrowRoom(MOUNT_STRIP.main) +
      2 * Math.max(sideOf(laid.first), sideOf(laid.last)) +
      2 * MOUNT_STRIP.data * MOUNT_STRIP.gap;
    if (taken > width) {
      [laid.first, laid.main, laid.last].forEach((one) => {
        if (one !== null) {
          discardParagraph(one);
        }
      });
      laid = row(width / taken);
      scale = width / taken;
    }
    // The arrow and the main datum, centered together.
    const mainSize = MOUNT_STRIP.main * scale;
    const mainWidth = arrowRoom(mainSize) + laid.main.getLongestLine();
    const arrowAt = -mainWidth / 2;
    const at = (paragraph: SkParagraph, x: number): PlacedParagraph => ({
      paragraph,
      x,
      y: y - paragraph.getHeight() / 2,
    });
    return {
      paragraphs: [
        {
          paragraph: heading,
          x: -heading.getLongestLine() / 2,
          y: -box.height / 2 + STRIP_TEXT_INSET - heading.getHeight() / 2,
        },
        at(laid.main, arrowAt + arrowRoom(mainSize)),
        ...(laid.first === null ? [] : [at(laid.first, left)]),
        ...(laid.last === null ? [] : [at(laid.last, right - laid.last.getLongestLine())]),
      ],
      arrow: { x: arrowAt, y, size: mainSize * MOUNT_ARROW.size },
    };
  }
}

/** Each holder's shape with its cut-outs, with and without its window, built once. */
const mountPaths = new Map<string, SkPath>();

/**
 * A holder's shape with its cut-outs, and its window when `open`: only when it shows nothing there,
 * because a picture over a hole lets the background through along its edge.
 */
function mountPath(mount: LetteredMount, box: MountBox, open: boolean): SkPath {
  const key = `${mount}-${open}-${box.upright === true}`;
  const cached = mountPaths.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const builder = Skia.PathBuilder.Make();
  builder.addRect(Skia.XYWHRect(-box.width / 2, -box.height / 2, box.width, box.height));
  if (open) {
    for (const { x, y, width, height } of [box.picture, ...box.frames]) {
      builder.addRRect(Skia.RRectXY(Skia.XYWHRect(x, y, width, height), box.radius, box.radius));
    }
  }
  for (const hole of box.holes) {
    builder.addRRect(
      Skia.RRectXY(
        Skia.XYWHRect(hole.x, hole.y, hole.width, hole.height),
        hole.radius,
        hole.radius,
      ),
    );
  }
  const path = builder.detach();
  mountPaths.set(key, path);
  return path;
}

/** The arrow of a holder's text, pointing along it, centered on its line. */
function arrowPath(at: number, size: number): SkPath {
  const builder = Skia.PathBuilder.Make();
  builder.moveTo(at, -size / 2);
  builder.lineTo(at + size, 0);
  builder.lineTo(at, size / 2);
  builder.close();
  return builder.detach();
}

/**
 * The camera with its picture, as one piece: the picture covering it, cut around its middle, under
 * the app's view. With no picture, the sign to fill it (`hint`) or nothing.
 */
function CameraWidget({
  box,
  picture,
  empty,
  view,
}: {
  readonly box: MountBox;
  readonly picture: SkImage | null;
  readonly empty: 'hint' | 'blank' | null;
  readonly view: ReactElement | null;
}) {
  const rect = box.picture;
  return (
    <Group clip={rect}>
      {empty === 'blank' ? null : empty === null && picture !== null ? (
        <Image image={picture} rect={rect} fit="cover" sampling={PHOTO_SAMPLING} />
      ) : (
        <Rect {...rect} color={LOADING_PICTURE} />
      )}
      {view}
      {empty === 'hint' ? <EmptySign cx={0} cy={0} /> : null}
    </Group>
  );
}

/**
 * How a calendar's sheet looks: its paper, its ink, and its brand's color (the band and the
 * weekday), in Track Red or Night Ink (`cover`), as the brand's covers go in pairs.
 */
const CALENDAR_PAPER = '#FAF8F3';
const CALENDAR_INK = '#1A1A1A';
const CALENDAR_LOOK = { red: '#C94A2E', ink: '#141B2D' } as const;

/** A calendar's sheet's texts: each line's font, size, color and capitals. */
const CALENDAR_TYPE = {
  band: { font: 'inter' as FontId, size: 38, bold: true },
  day: { font: 'anton' as FontId, size: 300, bold: false },
  weekday: { font: 'inter' as FontId, size: 40, bold: true },
  data: { font: 'inter' as FontId, size: 30, bold: false },
} as const;

/** A calendar's sheet's texts laid out, each centered across it at its height. */
interface CalendarLines {
  readonly lines: readonly PlacedParagraph[];
}

/**
 * Lays out a calendar's sheet's texts (see `calendarCaption`), in capitals but its day, each
 * centered across it and shrunk to fit its width with room at its ends. Time O(1).
 */
function calendarTexts(
  fonts: SkTypefaceFontProvider,
  text: CalendarText,
  box: CalendarBox,
  brand: string,
  locale: string,
): CalendarLines {
  const room = box.width - 2 * 40;
  const line = (
    words: string,
    type: { readonly font: FontId; readonly size: number; readonly bold: boolean },
    color: string,
    middle: number,
  ): PlacedParagraph[] => {
    if (words === '') {
      return [];
    }
    const layOut = (size: number) => {
      const builder = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Left }, fonts);
      builder.pushStyle({
        color: Skia.Color(color),
        fontFamilies: fontFamiliesOf(type.font),
        fontSize: size,
        fontStyle: {
          weight: drawsBold(type.font, type.bold) ? FontWeight.Bold : FontWeight.Normal,
        },
      });
      builder.addText(words.toLocaleUpperCase(locale));
      builder.pop();
      const paragraph = finishParagraph(builder);
      paragraph.layout(NO_WRAP_WIDTH);
      return paragraph;
    };
    let paragraph = layOut(type.size);
    if (paragraph.getLongestLine() > room) {
      const fit = room / paragraph.getLongestLine();
      discardParagraph(paragraph);
      paragraph = layOut(type.size * fit);
    }
    const width = Math.ceil(paragraph.getLongestLine()) + 1;
    paragraph.layout(width);
    return [{ paragraph, x: -width / 2, y: middle - paragraph.getHeight() / 2 }];
  };
  return {
    lines: [
      ...line(text.band, CALENDAR_TYPE.band, '#FFFFFF', box.band.y + box.band.height / 2),
      ...line(text.day, CALENDAR_TYPE.day, CALENDAR_INK, box.day),
      ...line(text.weekday, CALENDAR_TYPE.weekday, brand, box.weekday),
      ...line(text.data, CALENDAR_TYPE.data, CALENDAR_INK, box.data),
    ],
  };
}

/**
 * A tear-off calendar's sheet with its photo, as one piece: its paper lifted off what is under it
 * by a shadow, its band of the brand's color with the month, the day huge, the weekday, the photo
 * and the data. Its photo not chosen shows the sign to fill it (`hint`) or only the paper.
 */
function CalendarWidget({
  box,
  picture,
  empty,
  ink,
  texts,
}: {
  readonly box: CalendarBox;
  readonly picture: SkImage | null;
  readonly empty: 'hint' | 'blank' | null;
  readonly ink: string;
  readonly texts: CalendarLines;
}) {
  const rect = box.photo;
  return (
    <Group>
      <Group
        layer={
          <Paint>
            <DropShadow />
          </Paint>
        }
      >
        <Rect
          x={-box.width / 2}
          y={-box.height / 2}
          width={box.width}
          height={box.height}
          color={CALENDAR_PAPER}
        />
      </Group>
      <Rect {...box.band} color={ink} />
      {empty === 'blank' ? null : empty === null && picture !== null ? (
        <Image image={picture} rect={rect} fit="cover" sampling={PHOTO_SAMPLING} />
      ) : (
        <Rect {...rect} color={LOADING_PICTURE} />
      )}
      {empty === 'hint' ? (
        <EmptySign cx={rect.x + rect.width / 2} cy={rect.y + rect.height / 2} />
      ) : null}
      {texts.lines.map(({ paragraph, x, y }, i) => (
        <ParagraphPicture
          key={i}
          paragraph={paragraph}
          x={x}
          y={y}
          width={Math.ceil(paragraph.getLongestLine()) + 1}
        />
      ))}
    </Group>
  );
}

/**
 * How a margins' page looks: its bands' paper, and the ink of its texts, dark or faded (AllRun's name
 * and the place, around the date: the user's choice, for both bands to look alike), in Barlow
 * Condensed with room between the letters.
 */
const MARGINS_LOOK = {
  paper: '#F5F5F3',
  ink: '#181818',
  faded: '#969696',
  font: 'barlowCondensed' as FontId,
  tracking: 0.12,
} as const;

/** A text of a margins' page laid out, where its middle goes and how it turns. */
interface MarginsLine {
  readonly paragraph: SkParagraph;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly turn: number;
}

/**
 * Lays out a margins' page's texts in capitals, each in the middle of its place, shrunk to fit the
 * length its band has for it: turned to read up the left band and down the right one, level in the
 * bands of a wide canvas. Time O(1).
 */
function marginsTexts(
  fonts: SkTypefaceFontProvider,
  text: MarginsText,
  box: MarginsBox,
  locale: string,
): readonly MarginsLine[] {
  const line = (
    words: string,
    color: string,
    at: { readonly x: number; readonly y: number },
    turn: number,
  ): MarginsLine[] => {
    if (words === '') {
      return [];
    }
    const layOut = (size: number) => {
      const builder = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Left }, fonts);
      builder.pushStyle({
        color: Skia.Color(color),
        fontFamilies: fontFamiliesOf(MARGINS_LOOK.font),
        fontSize: size,
        letterSpacing: size * MARGINS_LOOK.tracking,
      });
      builder.addText(words.toLocaleUpperCase(locale));
      builder.pop();
      const paragraph = finishParagraph(builder);
      paragraph.layout(NO_WRAP_WIDTH);
      return paragraph;
    };
    let paragraph = layOut(box.size);
    if (paragraph.getLongestLine() > box.length) {
      const fit = box.length / paragraph.getLongestLine();
      discardParagraph(paragraph);
      paragraph = layOut(box.size * fit);
    }
    const width = Math.ceil(paragraph.getLongestLine()) + 1;
    paragraph.layout(width);
    return [{ paragraph, width, x: at.x, y: at.y, turn }];
  };
  const up = box.wide ? 0 : -Math.PI / 2;
  const down = box.wide ? 0 : Math.PI / 2;
  return [
    ...text.data.flatMap((words, i) => line(words, MARGINS_LOOK.ink, box.data[i], up)),
    ...text.labels.flatMap(({ text: words, faded }, i) =>
      line(words, faded ? MARGINS_LOOK.faded : MARGINS_LOOK.ink, box.labels[i], down),
    ),
  ];
}

/**
 * A margins' page with its photos, as one piece as big as the canvas: its paper, a photo in each
 * place, the whole height between the bands (in a row on a wide canvas), and the texts turned in
 * them. A place with no photo shows the sign to fill it (`hint`) or only the paper (`blank`).
 */
function MarginsWidget({
  box,
  photos,
  texts,
}: {
  readonly box: MarginsBox;
  readonly photos: readonly {
    readonly picture: SkImage | null;
    readonly empty: 'hint' | 'blank' | null;
  }[];
  readonly texts: readonly MarginsLine[];
}) {
  return (
    <Group>
      <Rect
        x={-box.width / 2}
        y={-box.height / 2}
        width={box.width}
        height={box.height}
        color={MARGINS_LOOK.paper}
      />
      {box.windows.map((window, i) => {
        const photo = photos[i];
        return photo === undefined || photo.empty === 'blank' ? null : photo.empty === null &&
          photo.picture !== null ? (
          <Image
            key={i}
            image={photo.picture}
            rect={window}
            fit="cover"
            sampling={PHOTO_SAMPLING}
          />
        ) : (
          <Rect key={i} {...window} color={LOADING_PICTURE} />
        );
      })}
      {box.windows.map((window, i) =>
        photos[i]?.empty === 'hint' ? (
          <EmptySign key={i} cx={window.x + window.width / 2} cy={window.y + window.height / 2} />
        ) : null,
      )}
      {texts.map(({ paragraph, width, x, y, turn }, i) => (
        <Group key={i} transform={[{ translateX: x }, { translateY: y }, { rotate: turn }]}>
          <ParagraphPicture
            paragraph={paragraph}
            x={-width / 2}
            y={-paragraph.getHeight() / 2}
            width={width}
          />
        </Group>
      ))}
    </Group>
  );
}

/** A chat's date: the gray of iOS over a dark chat, and its size. */
const CHAT_LOOK = { date: '#8E8E93', dateSize: 30 } as const;

/** Lays out a chat's date in the middle of its band, shrunk to fit it. Time O(1). */
function chatDate(fonts: SkTypefaceFontProvider, text: string, box: ChatBox): PlacedParagraph {
  const layOut = (size: number) => {
    const builder = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Left }, fonts);
    builder.pushStyle({
      color: Skia.Color(CHAT_LOOK.date),
      fontFamilies: fontFamiliesOf('inter'),
      fontSize: size,
    });
    builder.addText(text);
    builder.pop();
    const paragraph = finishParagraph(builder);
    paragraph.layout(NO_WRAP_WIDTH);
    return paragraph;
  };
  let paragraph = layOut(CHAT_LOOK.dateSize);
  if (paragraph.getLongestLine() > box.date.width) {
    const fit = box.date.width / paragraph.getLongestLine();
    discardParagraph(paragraph);
    paragraph = layOut(CHAT_LOOK.dateSize * fit);
  }
  const width = Math.ceil(paragraph.getLongestLine()) + 1;
  paragraph.layout(width);
  return {
    paragraph,
    x: box.date.x + (box.date.width - width) / 2,
    y: box.date.y + (box.date.height - paragraph.getHeight()) / 2,
  };
}

/**
 * A chat in dark mode, as one piece (see `chatBox`): the date over the sent photos, rounded as a
 * chat shows them, and the message with its data, shrunk to its band and its right edge with theirs.
 * A photo not chosen shows the sign to fill it (`hint`) or nothing (`blank`, in the image).
 */
function ChatWidget({
  box,
  photos,
  date,
  message,
}: {
  readonly box: ChatBox;
  readonly photos: readonly {
    readonly picture: SkImage | null;
    readonly empty: 'hint' | 'blank' | null;
  }[];
  readonly date: PlacedParagraph;
  readonly message: {
    readonly content: ReactElement;
    readonly width: number;
    readonly height: number;
  } | null;
}) {
  const band = box.message;
  const fit =
    message === null ? 1 : Math.min(1, band.width / message.width, band.height / message.height);
  return (
    <Group>
      <ParagraphPicture
        paragraph={date.paragraph}
        x={date.x}
        y={date.y}
        width={Math.ceil(date.paragraph.getLongestLine()) + 1}
      />
      {box.windows.map((window, i) => {
        const photo = photos[i];
        if (photo === undefined || photo.empty === 'blank') {
          return null;
        }
        return (
          <Group
            key={i}
            clip={Skia.RRectXY(
              Skia.XYWHRect(window.x, window.y, window.width, window.height),
              box.radius,
              box.radius,
            )}
          >
            {photo.empty === null && photo.picture !== null ? (
              <Image image={photo.picture} rect={window} fit="cover" sampling={PHOTO_SAMPLING} />
            ) : (
              <Rect {...window} color={LOADING_PICTURE} />
            )}
            {photo.empty === 'hint' ? (
              <EmptySign cx={window.x + window.width / 2} cy={window.y + window.height / 2} />
            ) : null}
          </Group>
        );
      })}
      {message === null ? null : (
        <Group
          transform={[
            { translateX: band.x + band.width - (message.width * fit) / 2 },
            { translateY: band.y + band.height / 2 },
            { scale: fit },
          ]}
        >
          {message.content}
        </Group>
      )}
    </Group>
  );
}

/**
 * How a photobooth's strip looks: its black paper, the paper tape (a warm beige, a little see-through,
 * its ends torn in teeth), and the writing by hand, in Permanent Marker (the instant photo's): dark
 * on the tape, light on the paper. Sizes in canvas pixels, the room the tape's writing keeps at its
 * ends included.
 */
const BOOTH_LOOK = {
  paper: '#121212',
  tape: 'rgba(226, 220, 204, 0.9)',
  tooth: { depth: 6, step: 12 },
  tapeInk: '#1E1E1E',
  footInk: '#EBE8E1',
  tapeSize: 40,
  footSize: 34,
  room: 24,
} as const;

/** A photobooth's writing laid out: each text, its width, and where its middle goes. */
interface BoothWriting {
  readonly tape: PlacedParagraph | null;
  readonly foot: PlacedParagraph | null;
}

/**
 * Lays out what a photobooth's strip writes (see `boothCaption`), each line in the middle of its
 * place, shrunk to fit it. Time O(1).
 */
function boothWriting(fonts: SkTypefaceFontProvider, text: BoothText, box: BoothBox): BoothWriting {
  const line = (
    words: string,
    size: number,
    color: string,
    place: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    },
  ): PlacedParagraph | null => {
    if (words === '') {
      return null;
    }
    const layOut = (fontSize: number) => {
      const builder = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Left }, fonts);
      builder.pushStyle({
        color: Skia.Color(color),
        fontFamilies: fontFamiliesOf('permanentMarker'),
        fontSize,
      });
      builder.addText(words.toUpperCase());
      builder.pop();
      const paragraph = finishParagraph(builder);
      paragraph.layout(NO_WRAP_WIDTH);
      return paragraph;
    };
    let paragraph = layOut(size);
    const room = place.width - 2 * BOOTH_LOOK.room;
    if (paragraph.getLongestLine() > room) {
      const fit = room / paragraph.getLongestLine();
      discardParagraph(paragraph);
      paragraph = layOut(size * fit);
    }
    const width = Math.ceil(paragraph.getLongestLine()) + 1;
    paragraph.layout(width);
    return {
      paragraph,
      x: place.x + (place.width - width) / 2,
      y: place.y + (place.height - paragraph.getHeight()) / 2,
    };
  };
  return {
    // The tape's, about its own middle: it is drawn turned there.
    tape: line(text.tape, BOOTH_LOOK.tapeSize, BOOTH_LOOK.tapeInk, {
      x: -box.tape.width / 2,
      y: -box.tape.height / 2,
      width: box.tape.width,
      height: box.tape.height,
    }),
    foot: line(text.foot, BOOTH_LOOK.footSize, BOOTH_LOOK.footInk, box.foot),
  };
}

/** The tape's outline, made once: a rectangle about its middle, its two ends torn in teeth. */
let boothTape: SkPath | null = null;

function tapePath(box: BoothBox): SkPath {
  if (boothTape !== null) {
    return boothTape;
  }
  const { width, height } = box.tape;
  const { depth, step } = BOOTH_LOOK.tooth;
  const builder = Skia.PathBuilder.Make();
  const left = -width / 2;
  const top = -height / 2;
  builder.moveTo(left, top);
  builder.lineTo(left + width, top);
  for (let y = 0; y <= height; y += step) {
    builder.lineTo(left + width - ((y / step) % 2 === 1 ? depth : 0), top + y);
  }
  builder.lineTo(left + width, top + height);
  builder.lineTo(left, top + height);
  for (let y = height; y >= 0; y -= step) {
    builder.lineTo(left + ((y / step) % 2 === 1 ? depth : 0), top + y);
  }
  builder.close();
  boothTape = builder.detach();
  return boothTape;
}

/**
 * A photobooth's strip with its photos, as one piece: the black paper lifted off what is under it by
 * a shadow, a photo in each place, the date by hand at its foot, and the tape over its top with the
 * datum, level when the design leans the strip. A place with no photo shows the sign to fill it
 * (`hint`) or only the paper (`blank`, in the image).
 */
function BoothWidget({
  box,
  photos,
  writing,
}: {
  readonly box: BoothBox;
  readonly photos: readonly {
    readonly picture: SkImage | null;
    readonly empty: 'hint' | 'blank' | null;
  }[];
  readonly writing: BoothWriting;
}) {
  const tapeMiddle = {
    x: box.tape.x + box.tape.width / 2,
    y: box.tape.y + box.tape.height / 2,
  };
  return (
    <Group>
      <Group
        layer={
          <Paint>
            <DropShadow />
          </Paint>
        }
      >
        <Rect {...box.strip} color={BOOTH_LOOK.paper} />
      </Group>
      {box.windows.map((window, i) => {
        const photo = photos[i];
        return photo === undefined || photo.empty === 'blank' ? null : photo.empty === null &&
          photo.picture !== null ? (
          <Image
            key={i}
            image={photo.picture}
            rect={window}
            fit="cover"
            sampling={PHOTO_SAMPLING}
          />
        ) : (
          <Rect key={i} {...window} color={LOADING_PICTURE} />
        );
      })}
      {box.windows.map((window, i) =>
        photos[i]?.empty === 'hint' ? (
          <EmptySign key={i} cx={window.x + window.width / 2} cy={window.y + window.height / 2} />
        ) : null,
      )}
      {writing.foot === null ? null : (
        <ParagraphPicture
          paragraph={writing.foot.paragraph}
          x={writing.foot.x}
          y={writing.foot.y}
          width={Math.ceil(writing.foot.paragraph.getLongestLine()) + 1}
        />
      )}
      <Group
        transform={[
          { translateX: tapeMiddle.x },
          { translateY: tapeMiddle.y },
          { rotate: box.tape.turn },
        ]}
      >
        <Path path={tapePath(box)} color={BOOTH_LOOK.tape} />
        {writing.tape === null ? null : (
          <ParagraphPicture
            paragraph={writing.tape.paragraph}
            x={writing.tape.x}
            y={writing.tape.y}
            width={Math.ceil(writing.tape.paragraph.getLongestLine()) + 1}
          />
        )}
      </Group>
    </Group>
  );
}

/**
 * How a slide viewer looks: its body and gate in black, the gate's edge out of focus as an old
 * projector's (`blur`, a mask's sigma: the photo stays sharp, user's reference), a faint shade
 * along it inside, and the data in a wide letter, a pale yellow, right of each slide's middle.
 */
const SLIDES_LOOK = {
  body: '#000000',
  blur: 5,
  shade: { blur: 22, opacity: 0.25 },
  /** How far past the piece the gate reaches, beyond its blur, and the photo under its edge. */
  gate: 60,
  bleed: 16,
  ink: '#F4E4A6',
  font: 'unbounded' as FontId,
  size: 34,
  inset: 52,
  bodyRadius: 28,
} as const;

/** A slide's datum laid out, and where it goes: its right end and its middle's height. */
interface SlideDatum {
  readonly paragraph: SkParagraph;
  readonly width: number;
  readonly right: number;
  readonly y: number;
}

/**
 * Lays out a slide viewer's data, one per slide in order, in capitals (see `slidesCaption`). Time
 * O(d) for d data.
 */
function slidesData(
  fonts: SkTypefaceFontProvider,
  texts: readonly string[],
  box: SlidesBox,
): readonly SlideDatum[] {
  return box.windows.flatMap((window, i) => {
    const text = texts[i];
    if (text === undefined) {
      return [];
    }
    const builder = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Left }, fonts);
    builder.pushStyle({
      color: Skia.Color(SLIDES_LOOK.ink),
      fontFamilies: fontFamiliesOf(SLIDES_LOOK.font),
      fontSize: SLIDES_LOOK.size,
    });
    builder.addText(text.toUpperCase());
    builder.pop();
    const paragraph = finishParagraph(builder);
    paragraph.layout(NO_WRAP_WIDTH);
    const width = Math.ceil(paragraph.getLongestLine()) + 1;
    paragraph.layout(width);
    return [
      {
        paragraph,
        width,
        right: window.x + window.width - SLIDES_LOOK.inset,
        y: window.y + window.height / 2,
      },
    ];
  });
}

/** A slide viewer's gate, made once: around each slide, with its tab (see `slidesBox`). */
let slidesGate: { readonly ring: SkPath; readonly tabs: SkPath } | null = null;

/**
 * The gate of a slide viewer: the black over the piece, a rounded window cut in it per slide, and the
 * tabs cutting into the slides. Two paths, since a tab over the gate would cut a hole in it with
 * the even-odd rule. Time and space O(1).
 */
function gateOf(box: SlidesBox): { readonly ring: SkPath; readonly tabs: SkPath } {
  if (slidesGate !== null) {
    return slidesGate;
  }
  const ring = Skia.PathBuilder.Make();
  const tabs = Skia.PathBuilder.Make();
  // One black past the whole piece, so the blur never thins its edge, the slides cut in it: a black
  // around each would overlap its neighbours', and the even-odd rule would cut a hole there.
  const reach = SLIDES_LOOK.gate;
  ring.addRect(
    Skia.XYWHRect(
      -box.width / 2 - reach,
      -box.height / 2 - reach,
      box.width + 2 * reach,
      box.height + 2 * reach,
    ),
  );
  for (const window of box.windows) {
    ring.addRRect(
      Skia.RRectXY(
        Skia.XYWHRect(window.x, window.y, window.width, window.height),
        box.radius,
        box.radius,
      ),
    );
  }
  for (const tab of box.tabs) {
    tabs.addRRect(
      Skia.RRectXY(Skia.XYWHRect(tab.x, tab.y, tab.width, tab.height), tab.radius, tab.radius),
    );
  }
  slidesGate = { ring: ring.detach(), tabs: tabs.detach() };
  return slidesGate;
}

/**
 * An old slide viewer with its pictures, as one piece: each picture covering its slide, sharp,
 * under a black gate whose edge and tab come in out of focus, with its datum inside. A slide with
 * no picture shows the sign to fill it (`hint`) or only black (`blank`, in the image).
 */
function SlidesWidget({
  box,
  slides,
  data,
}: {
  readonly box: SlidesBox;
  readonly slides: readonly {
    readonly picture: SkImage | null;
    readonly empty: 'hint' | 'blank' | null;
  }[];
  readonly data: readonly SlideDatum[];
}) {
  const gate = gateOf(box);
  const body = Skia.RRectXY(
    Skia.XYWHRect(-box.width / 2, -box.height / 2, box.width, box.height),
    SLIDES_LOOK.bodyRadius,
    SLIDES_LOOK.bodyRadius,
  );
  return (
    <Group clip={body}>
      <Rect
        x={-box.width / 2}
        y={-box.height / 2}
        width={box.width}
        height={box.height}
        color={SLIDES_LOOK.body}
      />
      {box.windows.map((window, i) => {
        const slide = slides[i];
        // Under the gate a little past the slide: its blurred edge never shows a hard one.
        const under = {
          x: window.x - SLIDES_LOOK.bleed,
          y: window.y - SLIDES_LOOK.bleed,
          width: window.width + 2 * SLIDES_LOOK.bleed,
          height: window.height + 2 * SLIDES_LOOK.bleed,
        };
        return slide === undefined || slide.empty === 'blank' ? null : slide.empty === null &&
          slide.picture !== null ? (
          <Image key={i} image={slide.picture} rect={under} fit="cover" sampling={PHOTO_SAMPLING} />
        ) : (
          <Rect key={i} {...under} color={LOADING_PICTURE} />
        );
      })}
      {data.map(({ paragraph, width, right, y }, i) => (
        <ParagraphPicture
          key={i}
          paragraph={paragraph}
          x={right - width}
          y={y - paragraph.getHeight() / 2}
          width={width}
        />
      ))}
      <Group opacity={SLIDES_LOOK.shade.opacity}>
        <Path path={gate.ring} color={SLIDES_LOOK.body} fillType="evenOdd">
          <BlurMask blur={SLIDES_LOOK.shade.blur} style="normal" />
        </Path>
      </Group>
      <Path path={gate.ring} color={SLIDES_LOOK.body} fillType="evenOdd">
        <BlurMask blur={SLIDES_LOOK.blur} style="normal" />
      </Path>
      <Path path={gate.tabs} color={SLIDES_LOOK.body}>
        <BlurMask blur={SLIDES_LOOK.blur} style="normal" />
      </Path>
      {box.windows.map((window, i) =>
        slides[i]?.empty === 'hint' ? (
          <EmptySign key={i} cx={window.x + window.width / 2} cy={window.y + window.height / 2} />
        ) : null,
      )}
    </Group>
  );
}

/**
 * How a crop screen looks, as a phone's: the dimming around its box, the box's edge, the thirds'
 * grid, the handles at its corners (how long and thick), and the pill of its data with dark ink.
 */
const CROP_LOOK = {
  dim: 'rgba(0, 0, 0, 0.55)',
  edge: { color: 'rgba(255, 255, 255, 0.9)', width: 3 },
  grid: { color: 'rgba(255, 255, 255, 0.43)', width: 2 },
  handle: { color: '#FFFFFF', arm: 56, thickness: 8 },
  pill: 'rgba(255, 255, 255, 0.92)',
  ink: '#000000',
} as const;

/** The data of a crop screen's pill laid out, shrunk to fit its widest. */
interface CropPill {
  readonly paragraph: SkParagraph;
  readonly width: number;
}

/**
 * Lays out the pill's `text` (see `cropCaption`) in Inter bold, shrunk to fit the box's width with
 * its room at both ends. Time O(1), laid out at most twice.
 */
function cropPill(fonts: SkTypefaceFontProvider, text: string, frame: CropFrame): CropPill {
  const { size, padX, maxWidth } = frame.pill;
  const layOut = (fontSize: number) => {
    const builder = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Left }, fonts);
    builder.pushStyle({
      color: Skia.Color(CROP_LOOK.ink),
      fontFamilies: fontFamiliesOf('inter'),
      fontSize,
      fontStyle: { weight: FontWeight.Bold },
    });
    builder.addText(text);
    builder.pop();
    const paragraph = finishParagraph(builder);
    paragraph.layout(NO_WRAP_WIDTH);
    return paragraph;
  };
  let paragraph = layOut(size);
  const room = maxWidth - 2 * padX;
  if (paragraph.getLongestLine() > room) {
    const fit = room / paragraph.getLongestLine();
    discardParagraph(paragraph);
    paragraph = layOut(size * fit);
  }
  const width = Math.ceil(paragraph.getLongestLine()) + 1;
  paragraph.layout(width);
  return { paragraph, width };
}

/** A crop screen's shapes, made once per canvas size (see `cropPaths`). */
interface CropPaths {
  /** The dimming: the whole widget but its box. */
  readonly dim: SkPath;
  /** The two lines across and the two down that split the box in thirds. */
  readonly grid: SkPath;
  /** The four handles, each two bars along its corner's sides, just outside the box's edge. */
  readonly handles: SkPath;
}

/** The crop screens' shapes made, by canvas size: a few formats, kept as the holders' are. */
const cropPathCache = new Map<string, CropPaths>();

/** A crop screen's shapes for the widget `rect` and its box `view`. Time and space O(1). */
function cropPaths(rect: DrawRect, view: DrawRect): CropPaths {
  const key = `${rect.width}x${rect.height}`;
  const cached = cropPathCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const dim = Skia.PathBuilder.Make();
  dim.addRect(Skia.XYWHRect(rect.x, rect.y, rect.width, rect.height));
  dim.addRect(Skia.XYWHRect(view.x, view.y, view.width, view.height));
  const grid = Skia.PathBuilder.Make();
  const line = CROP_LOOK.grid.width;
  for (const third of [1, 2]) {
    const x = view.x + (view.width * third) / 3;
    const y = view.y + (view.height * third) / 3;
    grid.addRect(Skia.XYWHRect(x - line / 2, view.y, line, view.height));
    grid.addRect(Skia.XYWHRect(view.x, y - line / 2, view.width, line));
  }
  const { arm, thickness: t } = CROP_LOOK.handle;
  const handles = Skia.PathBuilder.Make();
  const left = view.x - t;
  const top = view.y - t;
  const right = view.x + view.width + t;
  const bottom = view.y + view.height + t;
  for (const [x, inward] of [
    [left, 1],
    [right, -1],
  ] as const) {
    for (const [y, down] of [
      [top, 1],
      [bottom, -1],
    ] as const) {
      // Along the top or bottom, and along the side, from the outer corner inwards.
      handles.addRect(
        Skia.XYWHRect(inward > 0 ? x : x - arm - t, down > 0 ? y : y - t, arm + t, t),
      );
      handles.addRect(
        Skia.XYWHRect(inward > 0 ? x : x - t, down > 0 ? y : y - arm - t, t, arm + t),
      );
    }
  }
  const paths = { dim: dim.detach(), grid: grid.detach(), handles: handles.detach() };
  cropPathCache.set(key, paths);
  return paths;
}

/**
 * A phone's crop screen with its picture, as one piece: the picture covering it, dimmed around a
 * box in the canvas's proportions, with the thirds' grid and the corners' handles, and the pill of
 * its data under it. With no picture, the box shows the sign to fill it (`hint`) or nothing.
 */
function CropWidget({
  box,
  frame,
  picture,
  empty,
  pill,
}: {
  readonly box: MountBox;
  readonly frame: CropFrame;
  readonly picture: SkImage | null;
  readonly empty: 'hint' | 'blank' | null;
  readonly pill: CropPill;
}) {
  const rect = box.picture;
  const view = frame.window;
  const paths = cropPaths(rect, view);
  const pillWidth = pill.width + 2 * frame.pill.padX;
  return (
    <Group clip={rect}>
      {empty === 'blank' ? null : empty === null && picture !== null ? (
        <Image image={picture} rect={rect} fit="cover" sampling={PHOTO_SAMPLING} />
      ) : (
        <Rect {...rect} color={LOADING_PICTURE} />
      )}
      <Path path={paths.dim} color={CROP_LOOK.dim} fillType="evenOdd" />
      <Path path={paths.grid} color={CROP_LOOK.grid.color} />
      <Rect
        {...view}
        color={CROP_LOOK.edge.color}
        style="stroke"
        strokeWidth={CROP_LOOK.edge.width}
      />
      <Path path={paths.handles} color={CROP_LOOK.handle.color} />
      {empty === 'hint' ? (
        <EmptySign cx={view.x + view.width / 2} cy={view.y + view.height / 2} />
      ) : null}
      <RoundedRect
        x={-pillWidth / 2}
        y={frame.pill.y - frame.pill.height / 2}
        width={pillWidth}
        height={frame.pill.height}
        r={frame.pill.height / 2}
        color={CROP_LOOK.pill}
      />
      <ParagraphPicture
        paragraph={pill.paragraph}
        x={-pill.width / 2}
        y={frame.pill.y - pill.paragraph.getHeight() / 2}
        width={pill.width}
      />
    </Group>
  );
}

/**
 * A picture in its holder, as one piece (see `IMAGE_MOUNTS`): the holder with its cut-outs, through
 * which the background shows, the picture cut to its window around its middle, and the texts turned
 * along its sides. With no picture, the window shows the sign to fill it (`hint`) or nothing.
 */
function MountWidget({
  mount,
  box,
  picture,
  empty,
  sides,
  marks,
}: {
  readonly mount: LetteredMount;
  readonly box: MountBox;
  readonly picture: SkImage | null;
  readonly empty: 'hint' | 'blank' | null;
  readonly sides: readonly LaidOutSide[];
  readonly marks: LaidOutMarks;
}) {
  const look = MOUNT_LOOKS[mount];
  const rect = box.picture;
  return (
    <Group clip={{ x: -box.width / 2, y: -box.height / 2, width: box.width, height: box.height }}>
      {look.color === null ? null : (
        <Path
          path={mountPath(mount, box, empty === 'blank')}
          color={look.color}
          fillType="evenOdd"
        />
      )}
      {empty === 'blank'
        ? null
        : [rect, ...box.frames].map((frame, index) => (
            <Group
              key={index}
              clip={Skia.RRectXY(
                Skia.XYWHRect(frame.x, frame.y, frame.width, frame.height),
                box.radius,
                box.radius,
              )}
            >
              {empty === null && picture !== null ? (
                <Image image={picture} rect={frame} fit="cover" sampling={PHOTO_SAMPLING} />
              ) : (
                <Rect {...frame} color={LOADING_PICTURE} />
              )}
              {empty === 'hint' && index === 0 ? (
                <EmptySign cx={frame.x + frame.width / 2} cy={frame.y + frame.height / 2} />
              ) : null}
            </Group>
          ))}
      <Group transform={box.upright === true ? [{ rotate: Math.PI / 2 }] : []}>
        {marks.arrow === null ? null : (
          <Group transform={[{ translateY: marks.arrow.y }]}>
            <Path path={arrowPath(marks.arrow.x, marks.arrow.size)} color={look.ink} />
          </Group>
        )}
        {marks.paragraphs.map(({ paragraph, x, y }, i) => (
          <ParagraphPicture
            key={i}
            paragraph={paragraph}
            x={x}
            y={y}
            width={Math.ceil(paragraph.getLongestLine()) + 1}
          />
        ))}
      </Group>
      {sides.map((side, index) => (
        <Group
          key={index}
          transform={[
            { translateX: side.rect.x + side.rect.width / 2 },
            { translateY: side.rect.y + side.rect.height / 2 },
            { rotate: (look.turn * Math.PI) / 2 },
          ]}
        >
          {side.paragraphs.map(({ paragraph, at }, i) => (
            <ParagraphPicture
              key={i}
              paragraph={paragraph}
              x={at}
              y={-paragraph.getHeight() / 2}
              width={Math.ceil(paragraph.getLongestLine()) + 1}
            />
          ))}
          {side.arrows.map((at, i) => (
            <Path key={i} path={arrowPath(at, side.arrowSize)} color={look.ink} />
          ))}
        </Group>
      ))}
    </Group>
  );
}

/** A paragraph and where it goes. */
interface PlacedParagraph {
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
function captionParagraphs(
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
 * Least room between the points a route's hit line keeps, in canvas pixels: far below a finger's
 * reach, and few enough points to hand to the gestures on every render.
 */
const HIT_STEP = 4;

/**
 * A route's lines for the hit test, from the layer's center as `RouteLines` draws them, thinned
 * to points `HIT_STEP` apart (and each route's last one). Time and space O(n) for n points.
 */
function hitLine(
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

/**
 * Routes projected into a `box` × `boxHeight` box. They are centered in it, so their own extent
 * (plus the stroke) is their box, and only near their lines a finger grabs them: the rest of the
 * box, empty for a route on the diagonal, lets touches through. `null` without any point.
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
    line: hitLine(routes, box, boxHeight, layer.stroke.width),
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
    <ParagraphPicture
      paragraph={paragraph}
      x={-width / 2}
      y={-paragraph.getHeight() / 2}
      width={width}
    />
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
    <ParagraphPicture
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
            <ParagraphPicture
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
        <ParagraphPicture
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
          <ParagraphPicture
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

/**
 * Layers prepared once and kept while what they depend on stays the same: laying out a widget's texts
 * takes milliseconds on a modest phone, and moving a widget doesn't change them, only where it goes.
 * Time O(n) per call for the n layers, plus each layer that did change; space O(n).
 */
export class PreparedLayerCache {
  private environment: readonly unknown[] = [];
  private kept = new Map<
    string,
    {
      readonly signature: string;
      readonly images: readonly unknown[];
      readonly prepared: PreparedLayer | null;
    }
  >();

  /** The layers of `template`, as `prepareLayers` gives them. */
  prepare(template: Template, context: LayerContext): PreparedLayer[] {
    const canvas = CANVAS_FORMATS[template.format];
    const environment = [
      template.format,
      context.data,
      context.fonts,
      context.textContext.unit,
      context.textContext.locale,
      context.phrases,
      context.emptySlots,
    ];
    if (environment.some((value, i) => value !== this.environment[i])) {
      this.kept.clear();
      this.environment = environment;
    }
    const next = new Map<
      string,
      {
        readonly signature: string;
        readonly images: readonly unknown[];
        readonly prepared: PreparedLayer | null;
      }
    >();
    const prepared = template.layers.flatMap((layer) => {
      const signature = JSON.stringify({ ...layer, transform: null });
      const images =
        layer.kind === 'image' ? layerPictures(layer).map((key) => context.images?.get(key)) : [];
      const known = this.kept.get(layer.id);
      const entry =
        known?.signature === signature &&
        known.images.length === images.length &&
        known.images.every((one, i) => one === images[i])
          ? known
          : { signature, images, prepared: prepareLayer(layer, context, canvas) };
      next.set(layer.id, entry);
      return entry.prepared === null ? [] : [{ ...entry.prepared, layer }];
    });
    this.kept = next;
    return prepared;
  }
}
