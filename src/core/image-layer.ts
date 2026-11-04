import type { Size } from './photo-placement';
import type { ImageFrame, ImageMount, Layer, Template } from './template';

/**
 * Pictures of the user's on the canvas (image layers, ADR 009): a photo stuck over the design, as
 * is or in a frame. The layer only names its picture (`image`, a key of the editor's); the
 * pictures stay in the editor and never go into a saved design.
 */

type ImageLayer = Extract<Layer, { kind: 'image' }>;

/**
 * Most pictures a design takes, as many as a collage's cells, whose photos count too (see
 * `canAddImage`). Each is decoded at up to 2048 px (16 MB), so six stay within a phone's memory next
 * to the photo.
 */
export const MAX_IMAGES = 6;

/** Longest side of a picture, before the layer's scale, in canvas pixels (of 1080). */
export const IMAGE_SIDE = 640;

/** Width of a frame, as a fraction of the picture's shorter side: a print's thin white edge. */
export const FRAME_SHARE = 0.05;

/**
 * The key of a layer with no picture chosen. A tile of the gallery has it, and shows a stock photo;
 * a slot of a design (see `isPhotoSlot`) has it until then, and shows a sign to fill it on the canvas.
 */
export const SAMPLE_IMAGE = '';

/**
 * The key of a slot showing the editor's own photo, which then isn't drawn over the canvas as well
 * (see `usesEditorPhoto`). So choosing a design with slots for a photo already chosen puts it in the
 * first one, and undoing brings it back, with no second copy of it.
 */
export const EDITOR_PHOTO = 'photo';

/** Proportions of a picture not known yet. */
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

/**
 * Whether another picture fits in the design (see `MAX_IMAGES`).
 *
 * @param cellPhotos - How many photos its collage shows: they are pictures of the design too.
 */
export function canAddImage(template: Template, cellPhotos = 0): boolean {
  return imageCount(template.layers) + cellPhotos < MAX_IMAGES;
}

/** Whether a layer is a slot of a design: a picture marked as one, or in a holder (`IMAGE_MOUNTS`). */
export function isPhotoSlot(layer: Layer): layer is ImageLayer {
  return isImageLayer(layer) && (layer.slot === true || layer.mount !== undefined);
}

/** Whether the editor's photo is in a slot, instead of over the canvas. Time O(n) for n layers. */
export function usesEditorPhoto(layers: readonly Layer[]): boolean {
  return layers.some((layer) => isPhotoSlot(layer) && layer.image === EDITOR_PHOTO);
}

/**
 * Whether a slot has no picture: none chosen, or the editor's photo while there is none.
 *
 * @param hasPhoto - Whether the editor has a photo.
 */
export function isEmptySlot(layer: Layer, hasPhoto: boolean): layer is ImageLayer {
  return (
    isPhotoSlot(layer) &&
    (layer.image === SAMPLE_IMAGE || (layer.image === EDITOR_PHOTO && !hasPhoto))
  );
}

/**
 * `layers` as a saved design keeps them: its slots empty, and without the other pictures, which
 * belong to the image being made, not to the design. Time O(n) for n layers.
 */
export function withEmptySlots(layers: readonly Layer[]): Layer[] {
  return layers.flatMap((layer): Layer[] => {
    if (isPhotoSlot(layer)) {
      return [{ ...layer, image: SAMPLE_IMAGE }];
    }
    return isImageLayer(layer) ? [] : [layer];
  });
}

/**
 * `layers` with their empty slots filled in order with `pictures`; those left over stay out. Time
 * O(n) for n layers.
 */
export function fillSlots(layers: readonly Layer[], pictures: readonly string[]): Layer[] {
  let next = 0;
  return layers.map((layer) => {
    if (!isPhotoSlot(layer) || layer.image !== SAMPLE_IMAGE || next >= pictures.length) {
      return layer;
    }
    next += 1;
    return { ...layer, image: pictures[next - 1] };
  });
}

/** A rectangle inside a widget centered on (0, 0). */
export type BoxRect = { readonly x: number; readonly y: number } & Size;

/** Where a picture goes inside its widget, centered on (0, 0), as the widget's size. */
export interface ImageBox {
  /** The widget, frame included. */
  readonly width: number;
  readonly height: number;
  /** The picture inside the frame. */
  readonly picture: BoxRect;
}

/** An instant photo's widget: its square picture and the band under it for its caption. */
export interface InstantBox extends ImageBox {
  readonly caption: BoxRect;
}

/**
 * Proportions of an instant photo, as a Polaroid's (88 × 107 mm, a 79 mm square picture): its edge
 * at the sides and the top, and the band under the picture, as fractions of its width.
 */
export const INSTANT = { edge: 0.05, band: 0.27 } as const;

/**
 * The widget of an instant photo: as a Polaroid, its longest side `IMAGE_SIDE` long, a square
 * picture with an even edge at its sides and top, and the band of its caption under it. Time and
 * space O(1).
 */
export function instantBox(): InstantBox {
  // Its height is its width × (1 − edge + band): the edge at the top and the square picture.
  const width = IMAGE_SIDE / (1 - INSTANT.edge + INSTANT.band);
  const edge = width * INSTANT.edge;
  const side = width - 2 * edge;
  const height = IMAGE_SIDE;
  const top = -height / 2;
  return {
    width,
    height,
    picture: { x: -side / 2, y: top + edge, width: side, height: side },
    caption: { x: -side / 2, y: top + edge + side, width: side, height: width * INSTANT.band },
  };
}

/** The radius of a picture's rounded corners, in canvas pixels before its layer's scale. */
export const PICTURE_RADIUS = 44;

/** The place of a plain slot (see `slotBox`): as a phone's vertical photos, which fill it whole. */
export const SLOT_PICTURE: Size = { width: 3, height: 4 };

/**
 * The widget of a picture of `size` in a plain slot: as `imageBox` makes it, but inside the slot's
 * place, however wide it is, so that it never leaves the part of the design meant for it. Time and
 * space O(1).
 */
export function slotBox(size: Size, frame: ImageFrame): ImageBox {
  const fit = Math.min(
    (IMAGE_SIDE * SLOT_PICTURE.width) / SLOT_PICTURE.height / size.width,
    IMAGE_SIDE / size.height,
  );
  return framedBox(size.width * fit, size.height * fit, frame);
}

/** A cut-out of a holder: a rectangle with rounded corners. */
export type BoxHole = BoxRect & { readonly radius: number };

/** A picture in its holder: the widget, the window of the picture and the holder's cut-outs. */
export interface MountBox extends ImageBox {
  /** The radius of the window's corners. */
  readonly radius: number;
  /** The perforations and notches cut out of the holder, through which the background shows. */
  readonly holes: readonly BoxHole[];
  /** The two columns at the window's sides where its data is written, turned on their side. */
  readonly sides: readonly [BoxRect, BoxRect];
  /**
   * The frames beside the window, which show the same picture again: whole, here, though the widget
   * cuts them at its ends, so that a frame shows the side of the picture nearest the window.
   */
  readonly frames: readonly BoxRect[];
}

/** Proportions of the window of every holder: as a phone's vertical photos, which it never cuts. */
const WINDOW_RATIO = 3 / 4;

/** A 35 mm frame: the band above and below its window, for its reel marks, and the one at its sides. */
const FILM_FRAME = { band: 46, side: 54 } as const;

/** A negative: the band above and below, its data's column and its perforations' column. */
const NEGATIVE = {
  band: 30,
  data: 36,
  gap: 12,
  hole: { width: 44, height: 38, radius: 8 },
  holes: 7,
  radius: 6,
} as const;

/**
 * A strip of film: the band above and below its frames, for its texts, the room between frames, how
 * much of the frames beside the main one shows, its frames' corners, and its perforations along
 * both edges.
 */
const FILM_STRIP = {
  band: 52,
  gap: 16,
  shown: 0.3,
  radius: 14,
  hole: { width: 20, height: 12, radius: 3, inset: 6, step: 46 },
} as const;

/** Where a strip of film's texts go, in the middle of what the perforations leave of its band. */
export const STRIP_TEXT_INSET =
  (FILM_STRIP.hole.inset + FILM_STRIP.hole.height + FILM_STRIP.band) / 2;

/** The window of a holder as tall as `IMAGE_SIDE`, with its `band` above and below. */
function windowIn(band: number): BoxRect {
  const height = IMAGE_SIDE - 2 * band;
  const width = height * WINDOW_RATIO;
  return { x: -width / 2, y: -height / 2, width, height };
}

/**
 * The widget of a picture in its holder (see `IMAGE_MOUNTS`), as tall as `IMAGE_SIDE`, but the
 * camera, as big as the `canvas`. Time and space O(1).
 */
export function mountBox(mount: ImageMount, canvas: Size): MountBox {
  const height = IMAGE_SIDE;
  switch (mount) {
    case 'camera': {
      const picture = {
        x: -canvas.width / 2,
        y: -canvas.height / 2,
        width: canvas.width,
        height: canvas.height,
      };
      const none = { ...picture, width: 0 };
      return { ...canvas, picture, radius: 0, holes: [], sides: [none, none], frames: [] };
    }
    case 'filmFrame': {
      const { band, side } = FILM_FRAME;
      const picture = windowIn(band);
      const width = picture.width + 2 * side;
      return {
        width,
        height,
        picture,
        radius: 0,
        holes: [],
        sides: [
          { x: -width / 2, y: picture.y, width: side, height: picture.height },
          { x: -picture.x, y: picture.y, width: side, height: picture.height },
        ],
        frames: [],
      };
    }
    case 'filmStrip': {
      const { band, gap, shown, radius, hole } = FILM_STRIP;
      const picture = windowIn(band);
      const width = picture.width * (1 + 2 * shown) + 2 * gap;
      const none = { ...picture, width: 0 };
      const count = Math.floor(width / hole.step);
      const start = (-count * hole.step) / 2 + (hole.step - hole.width) / 2;
      return {
        width,
        height,
        picture,
        radius,
        holes: Array.from({ length: count }, (_, i) => {
          const x = start + i * hole.step;
          const shape = { width: hole.width, height: hole.height, radius: hole.radius };
          return [
            { ...shape, x, y: -height / 2 + hole.inset },
            { ...shape, x, y: height / 2 - hole.inset - hole.height },
          ];
        }).flat(),
        sides: [none, none],
        frames: [
          { ...picture, x: picture.x - picture.width - gap },
          { ...picture, x: -picture.x + gap },
        ],
      };
    }
    case 'lightNegative': {
      const { band, data, gap, hole, holes, radius } = NEGATIVE;
      const picture = windowIn(band);
      const width = picture.width + 2 * (data + hole.width + 2 * gap);
      const step = (picture.height - hole.height) / (holes - 1);
      return {
        width,
        height,
        picture,
        radius,
        holes: Array.from({ length: holes }, (_, row) => {
          const y = picture.y + row * step;
          return [
            { ...hole, x: picture.x - gap - hole.width, y },
            { ...hole, x: -picture.x + gap, y },
          ];
        }).flat(),
        sides: [
          { x: -width / 2, y: picture.y, width: data, height: picture.height },
          { x: width / 2 - data, y: picture.y, width: data, height: picture.height },
        ],
        frames: [],
      };
    }
  }
}

/** The frame of an instant photo: light, or dark when chosen, never none. */
export function instantFrame(frame: ImageFrame): Exclude<ImageFrame, 'none'> {
  return frame === 'dark' ? 'dark' : 'light';
}

/** The ink of a caption on a frame: black on white, white on black. */
export const CAPTION_INK: Readonly<Record<Exclude<ImageFrame, 'none'>, string>> = {
  light: '#000000',
  dark: '#FFFFFF',
};

/**
 * The widget of a picture of `size` (any unit: only its proportions count), with its longest side
 * `IMAGE_SIDE` long and, framed, an even edge around it (`FRAME_SHARE` of its shorter side).
 * Time and space O(1).
 */
export function imageBox(size: Size, frame: ImageFrame): ImageBox {
  const fit = IMAGE_SIDE / Math.max(size.width, size.height);
  return framedBox(size.width * fit, size.height * fit, frame);
}

/** The widget of a picture `width` × `height`, with an even edge around it when framed. */
function framedBox(width: number, height: number, frame: ImageFrame): ImageBox {
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
