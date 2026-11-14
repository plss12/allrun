import {
  FilterMode,
  Group,
  Image,
  MipmapMode,
  Paint,
  Path,
  Rect,
  type SkImage,
  type SkTypefaceFontProvider,
  type Transforms3d,
} from '@shopify/react-native-skia';
import type { ReactElement } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import type { PhotoFilterId } from '@/core/photo-filter';
import { contrastingInk } from '@/core/layer-style';
import { layerPictures } from '@/core/image-layer';
import type { HitHole, HitLine, LayerTransform } from '@/core/layer-transform';
import type { PhotoDrawing, Size } from '@/core/photo-placement';
import type { Phrase } from '@/core/phrases';
import { CANVAS_FORMATS, type CanvasFormat, type Layer, type Template } from '@/core/template';

import { type EditorData, type LabelKey, layerText, type TextContext } from './editor-data';
import { prepareActivityBlock } from './activity-blocks';
import { prepareSummaryBlock } from './summary-blocks';
import { watermarkLayout } from './brand/watermark-layout';
import { Watermark } from './brand/brand-art';
import { softBackdrop } from './scene-text';
import { prepareActivityChart, prepareSummaryChart } from './scene/charts';
import { prepareImageLayer } from './scene/mounts';
import {
  BACKDROP_FIT,
  buildFittedParagraph,
  INFO_SIZE,
  preparedBackdrop,
  preparedParagraph,
  TEXT_SIZE,
  VALUE_SIZE,
} from './scene/paragraphs';
import {
  CHECKER_DARK,
  CHECKER_LIGHT,
  CHECKER_SQUARE,
  checkerPath,
  EmptySign,
  FilteredPhoto,
  PHOTO_SAMPLING,
} from './scene/photo';
import {
  preparedRouteMap,
  preparedRoutes,
  projectedRoutes,
  ROUTE_BOX,
  ROUTES_HEIGHT,
  ROUTES_WIDTH,
} from './scene/routes';

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
  return [
    { translateX: drawing.x },
    { translateY: drawing.y },
    { rotate: drawing.rotation },
    { scale: drawing.scale },
  ];
}

/**
 * Where the photo goes inside its {@link photoMatrix} group: centered on it, at the size that just
 * covers its canvas or cell, which the group scales. So what is drawn on it, as a filter's blur,
 * grows and shrinks with the photo.
 */
export function photoRect(drawing: PhotoDrawing): DrawRect {
  'worklet';
  const width = drawing.width / drawing.scale;
  const height = drawing.height / drawing.scale;
  return { x: -width / 2, y: -height / 2, width, height };
}

/** The photo of a scene: drawn in `rect` inside a group transformed by `matrix`. */
export interface ScenePhoto {
  readonly image: SkImage;
  readonly matrix: Transforms3d | SharedValue<Transforms3d>;
  readonly rect: DrawRect | SharedValue<DrawRect>;
  /** The canvas's photo's filter (see `photo-filter.ts`); absent or `null`, none. */
  readonly filter?: PhotoFilterId | null;
  /**
   * The photo already drawn with its filter, at the size of `rect` (see `useBakedPhoto`): a blur
   * reads the photo 24 times a pixel, too much to draw again on every frame of a modest phone.
   */
  readonly baked?: SharedValue<SkImage | null>;
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
            <FilteredPhoto photo={photo} canvasWidth={width} />
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
function prepareLayer(layer: Layer, context: LayerContext, canvas: Size): PreparedLayer | null {
  const { data, fonts, textContext, translate, phrases } = context;
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
      // On its map once loaded; until then, and without one, the line alone.
      if (layer.map === true && data.map !== undefined && data.map !== null) {
        const onMap = preparedRouteMap(layer, data.activity, data.map);
        if (onMap !== null) {
          return onMap;
        }
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
    case 'summaryChart':
      return prepareSummaryChart(layer, context);
    case 'activityChart':
      return prepareActivityChart(layer, context);
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
    case 'image':
      return prepareImageLayer(layer, context, canvas);
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
