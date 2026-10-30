import type { Size } from './photo-placement';
import type { ImageFrame, Layer, Template } from './template';

/**
 * Pictures of the user's on the canvas (image layers, ADR 009): a photo stuck over the design, as
 * is or in a frame. The layer only names its picture (`image`, a key of the editor's); the
 * pictures stay in the editor and never go into a saved design.
 */

type ImageLayer = Extract<Layer, { kind: 'image' }>;

/**
 * Most pictures a design takes. Each is decoded at up to 2048 px (16 MB), so four stay well
 * within a phone's memory next to the photo.
 */
export const MAX_IMAGES = 4;

/** Longest side of a picture, before the layer's scale, in canvas pixels (of 1080). */
export const IMAGE_SIDE = 640;

/** Width of a frame, as a fraction of the picture's shorter side: a print's thin white edge. */
export const FRAME_SHARE = 0.05;

/**
 * The key of the gallery's sample picture, a runner in the mountains (Pexels, square), shown in the
 * tile before the user picks theirs.
 */
export const SAMPLE_IMAGE = '';

/** Proportions of the gallery's sample picture. */
export const SAMPLE_PICTURE: Size = { width: 1, height: 1 };

/**
 * The frame colors: white and black, as the light and dark replicas of the phone's apps (the
 * alarm, the location); the brand's Chalk and Night Ink looked yellowish and bluish around photos.
 */
export const FRAME_COLORS: Readonly<Record<Exclude<ImageFrame, 'none'>, string>> = {
  light: '#FFFFFF',
  dark: '#000000',
};

/** Whether a layer is a picture of the user's. */
export function isImageLayer(layer: Layer): layer is ImageLayer {
  return layer.kind === 'image';
}

/** How many pictures `layers` show. Time O(n) for n layers. */
export function imageCount(layers: readonly Layer[]): number {
  return layers.filter(isImageLayer).length;
}

/** Whether another picture fits in the design (see `MAX_IMAGES`). */
export function canAddImage(template: Template): boolean {
  return imageCount(template.layers) < MAX_IMAGES;
}

/** `layers` without the user's pictures, which designs never keep. Time O(n). */
export function withoutImages(layers: readonly Layer[]): Layer[] {
  return layers.filter((layer) => !isImageLayer(layer));
}

/** Where a picture goes inside its widget, centered on (0, 0), as the widget's size. */
export interface ImageBox {
  /** The widget, frame included. */
  readonly width: number;
  readonly height: number;
  /** The picture inside the frame. */
  readonly picture: { readonly x: number; readonly y: number } & Size;
}

/**
 * The widget of a picture of `size` (any unit: only its proportions count), with its longest side
 * `IMAGE_SIDE` long and, framed, an even edge around it (`FRAME_SHARE` of its shorter side).
 * Time and space O(1).
 */
export function imageBox(size: Size, frame: ImageFrame): ImageBox {
  const fit = IMAGE_SIDE / Math.max(size.width, size.height);
  const width = size.width * fit;
  const height = size.height * fit;
  const edge = frame === 'none' ? 0 : Math.min(width, height) * FRAME_SHARE;
  return {
    width: width + 2 * edge,
    height: height + 2 * edge,
    picture: { x: -width / 2, y: -height / 2, width, height },
  };
}

/**
 * Shows another picture in the image layer `id` (its frame, place and size stay). Returns
 * `template` itself when the layer is missing or already shows it.
 */
export function setLayerImage(template: Template, id: string, image: string): Template {
  const index = template.layers.findIndex((layer) => layer.id === id);
  const layer = template.layers[index];
  if (layer === undefined || !isImageLayer(layer) || layer.image === image) {
    return template;
  }
  const layers = [...template.layers];
  layers[index] = { ...layer, image };
  return { ...template, layers };
}
