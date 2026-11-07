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

/**
 * How many windows, each with its picture, a picture's widget has: three in the slide viewer, one
 * in the rest (see `IMAGE_MOUNTS`). Time and space O(1).
 */
export function windowCount(layer: ImageLayer): number {
  return mountWindows(layer.mount);
}

/** How many windows a picture in `mount` has (none: a picture as it is), as `windowCount` says. */
export function mountWindows(mount: ImageMount | undefined): number {
  return mount === 'slides'
    ? SLIDES.count
    : mount === 'photobooth'
      ? BOOTH.count
      : mount === 'chatPair'
        ? 2
        : 1;
}

/**
 * The picture of each window of `layer` (see `windowCount`), in order: `image`, then
 * `extraImages`, and `SAMPLE_IMAGE` for a window with none yet. Time and space O(w) for w windows.
 */
export function layerPictures(layer: ImageLayer): string[] {
  const extra = layer.extraImages ?? [];
  return Array.from({ length: windowCount(layer) }, (_, window) =>
    window === 0 ? layer.image : (extra[window - 1] ?? SAMPLE_IMAGE),
  );
}

/** `layer` with `image` in its window `window` (see `layerPictures`). Time O(w) for w windows. */
export function withWindowPicture(layer: ImageLayer, window: number, image: string): ImageLayer {
  if (window === 0) {
    return { ...layer, image };
  }
  const pictures = layerPictures(layer);
  pictures[window] = image;
  return { ...layer, extraImages: pictures.slice(1) };
}

/**
 * `layer` with no picture in any window, as a slot (a picture as it is, or an instant photo, becomes
 * one; one in a holder always is): as a design keeps it.
 */
function emptied(layer: ImageLayer): ImageLayer {
  const { extraImages: _extra, ...rest } = layer;
  return { ...rest, image: SAMPLE_IMAGE, ...(layer.mount === undefined ? { slot: true } : {}) };
}

/** How many pictures `layers` show, a window each. Time O(n) for n layers. */
export function imageCount(layers: readonly Layer[]): number {
  return layers.filter(isImageLayer).reduce((sum, layer) => sum + windowCount(layer), 0);
}

/**
 * Whether another picture fits in the design (see `MAX_IMAGES`), or `count` of them (a piece with
 * as many windows).
 *
 * @param cellPhotos - How many photos its collage shows: they are pictures of the design too.
 */
export function canAddImage(template: Template, cellPhotos = 0, count = 1): boolean {
  return imageCount(template.layers) + cellPhotos + count <= MAX_IMAGES;
}

/** Whether a layer is a slot of a design: a picture marked as one, or in a holder (`IMAGE_MOUNTS`). */
export function isPhotoSlot(layer: Layer): layer is ImageLayer {
  return isImageLayer(layer) && (layer.slot === true || layer.mount !== undefined);
}

/** The pictures in the windows of the slots of `layers`, in order. Time O(n) for n layers. */
export function slotPictures(layers: readonly Layer[]): string[] {
  return layers.filter(isPhotoSlot).flatMap(layerPictures);
}

/** Whether the editor's photo is in a slot, instead of over the canvas. Time O(n) for n layers. */
export function usesEditorPhoto(layers: readonly Layer[]): boolean {
  return slotPictures(layers).includes(EDITOR_PHOTO);
}

/**
 * Whether the window `window` of a slot has no picture: none chosen, or the editor's photo while
 * there is none. Time O(w) for w windows.
 *
 * @param hasPhoto - Whether the editor has a photo.
 */
export function isEmptyWindow(layer: Layer, window: number, hasPhoto: boolean): boolean {
  if (!isPhotoSlot(layer)) {
    return false;
  }
  const picture = layerPictures(layer)[window];
  return picture === SAMPLE_IMAGE || (picture === EDITOR_PHOTO && !hasPhoto);
}

/**
 * The first window of a slot with no picture (see `isEmptyWindow`), or `null`: none, or not a slot.
 * Time O(w) for w windows.
 */
export function firstEmptyWindow(layer: Layer, hasPhoto: boolean): number | null {
  if (!isPhotoSlot(layer)) {
    return null;
  }
  const at = layerPictures(layer).findIndex((_, window) => isEmptyWindow(layer, window, hasPhoto));
  return at === -1 ? null : at;
}

/**
 * `layers` as a saved design keeps them: every picture an empty slot, so that whoever uses the
 * design puts their own photos in it (the user's choice); the photos belong to the image being
 * made, not to the design. Time O(n) for n layers.
 */
export function withEmptySlots(layers: readonly Layer[]): Layer[] {
  return layers.map((layer) => (isImageLayer(layer) ? emptied(layer) : layer));
}

/**
 * `layers` with the empty windows of their slots filled in order with `pictures`; those left over
 * stay out. Time O(n·w) for n layers of w windows.
 */
export function fillSlots(layers: readonly Layer[], pictures: readonly string[]): Layer[] {
  const left = [...pictures];
  return layers.map((layer) => {
    if (!isPhotoSlot(layer)) {
      return layer;
    }
    return layerPictures(layer).reduce((filled, picture, window) => {
      if (picture !== SAMPLE_IMAGE) {
        return filled;
      }
      const image = left.shift();
      return image === undefined ? filled : withWindowPicture(filled, window, image);
    }, layer);
  });
}

/**
 * `layers` with `key` out of every window: those of slots go back to empty, and a picture stuck on
 * with it leaves (a picture that couldn't be read). Time O(n·w) for n layers of w windows.
 */
export function withoutPicture(layers: readonly Layer[], key: string): Layer[] {
  return layers.flatMap((layer): Layer[] => {
    if (!isImageLayer(layer) || !layerPictures(layer).includes(key)) {
      return [layer];
    }
    if (!isPhotoSlot(layer)) {
      return [];
    }
    return [
      layerPictures(layer).reduce(
        (cleared, picture, window) =>
          picture === key ? withWindowPicture(cleared, window, SAMPLE_IMAGE) : cleared,
        layer,
      ),
    ];
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

/** The holders as big as the canvas, seen through: the camera and the crop screen. */
export type CanvasMount = Extract<ImageMount, 'camera' | 'crop'>;

/**
 * Whether a holder is as big as the canvas (see `CanvasMount`): it comes at the canvas's size in
 * every format, and goes under the widgets already there, not to hide them. Added to a canvas, it
 * holds the canvas's own photo (`EDITOR_PHOTO`, the first cell's in a collage; with none, the
 * one picked for it becomes the canvas's), as a design's slot does: a photo of its own would hide that one under it (the user's
 * choice). Removing it gives the photo back to the canvas.
 */
export function coversCanvas(mount: ImageMount | undefined): mount is CanvasMount {
  return mount === 'camera' || mount === 'crop';
}

/**
 * A crop screen's parts, in canvas pixels of 1080: how much of the canvas its box takes at most,
 * and how much of it the box and the data under it take together; the room between them; and the
 * pill of the data, its letters' size and the room around them.
 */
const CROP = {
  share: 0.72,
  room: 0.86,
  gap: 48,
  pill: { size: 38, padX: 40, padY: 24 },
} as const;

/** A crop screen laid out (see `cropFrame`): its box, and where the pill of its data goes. */
export interface CropFrame {
  /** The box, with the canvas's own proportions: a smaller canvas inside it. */
  readonly window: BoxRect;
  /** The pill under it: its middle's height, its height, its widest and its letters' size. */
  readonly pill: {
    readonly y: number;
    readonly height: number;
    readonly maxWidth: number;
    readonly size: number;
    readonly padX: number;
  };
}

/**
 * Where a crop screen as big as `canvas` puts its box and its data, around its middle: the box in
 * the canvas's proportions, as big as it fits with the pill under it, both centered together.
 * Time and space O(1).
 */
export function cropFrame(canvas: Size): CropFrame {
  const { share, room, gap, pill } = CROP;
  const pillHeight = pill.size + 2 * pill.padY;
  const scale = Math.min(share, (room * canvas.height - gap - pillHeight) / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  const top = -(height + gap + pillHeight) / 2;
  return {
    window: { x: -width / 2, y: top, width, height },
    pill: {
      y: top + height + gap + pillHeight / 2,
      height: pillHeight,
      maxWidth: width,
      size: pill.size,
      padX: pill.padX,
    },
  };
}

/**
 * An old slide viewer (`slides`), in canvas pixels of 1080: how many slides, each one's width and
 * proportions (3:2, as a camera's), the room between them and around them, its corners', and the
 * viewer's tab cutting into each slide's left edge at its middle: how far in, how tall (a share of
 * the slide's height) and its corners'.
 */
const SLIDES = {
  count: 3,
  width: 760,
  ratio: 2 / 3,
  gap: 44,
  margin: 40,
  radius: 30,
  tab: { depth: 46, height: 0.3, radius: 26 },
} as const;

/** A slide viewer laid out (see `slidesBox`): the whole piece, its slides and their tabs. */
export interface SlidesBox extends Size {
  readonly windows: readonly BoxRect[];
  readonly tabs: readonly BoxHole[];
  readonly radius: number;
}

/**
 * Where a slide viewer puts its slides, one under another around its middle, each with the tab
 * cutting into its left edge, always at its middle (the user's choice). Time and space O(1).
 */
export function slidesBox(): SlidesBox {
  const { count, width, ratio, gap, margin, radius, tab } = SLIDES;
  const height = width * ratio;
  const whole = {
    width: width + 2 * margin,
    height: count * height + (count - 1) * gap + 2 * margin,
  };
  const windows = Array.from({ length: count }, (_, i) => ({
    x: -width / 2,
    y: -whole.height / 2 + margin + i * (height + gap),
    width,
    height,
  }));
  return {
    ...whole,
    windows,
    radius,
    tabs: windows.map((window) => ({
      // From outside the slide, so only its rounded end shows inside it.
      x: window.x - tab.radius,
      y: window.y + (window.height * (1 - tab.height)) / 2,
      width: tab.depth + tab.radius,
      height: window.height * tab.height,
      radius: tab.radius,
    })),
  };
}

/**
 * A photobooth's strip (`photobooth`), in canvas pixels of 1080: how many photos, each one's size
 * (a booth's, a little wider than tall), the black paper around them, between them and the longer
 * foot under them, for its date; and the piece of paper tape over its top, with its datum: its size,
 * how far it sticks out above the strip, and how much it leans (3°, counterclockwise: level when
 * the strip leans as much the other way, as the owner's reference).
 */
const BOOTH = {
  count: 3,
  photo: { width: 440, height: 400 },
  edge: 22,
  gap: 14,
  foot: 110,
  tape: { width: 300, height: 92, over: 24, turn: (3 * Math.PI) / 180 },
} as const;

/** A photobooth's strip laid out (see `boothBox`): the piece, its strip, photos, foot and tape. */
export interface BoothBox extends Size {
  readonly strip: BoxRect;
  readonly windows: readonly BoxRect[];
  readonly foot: BoxRect;
  /** The tape, before its turn, which goes about its middle. */
  readonly tape: BoxRect & { readonly turn: number };
}

/**
 * Where a photobooth's strip puts its photos, one under another, its foot under them and the tape
 * over its top, sticking out above it: all of it inside the piece. Time and space O(1).
 */
export function boothBox(): BoothBox {
  const { count, photo, edge, gap, foot, tape } = BOOTH;
  const strip = {
    width: photo.width + 2 * edge,
    height: edge + count * photo.height + (count - 1) * gap + foot,
  };
  const width = strip.width;
  const height = strip.height + tape.over;
  const top = -height / 2 + tape.over;
  const windows = Array.from({ length: count }, (_, i) => ({
    x: -photo.width / 2,
    y: top + edge + i * (photo.height + gap),
    width: photo.width,
    height: photo.height,
  }));
  return {
    width,
    height,
    strip: { x: -strip.width / 2, y: top, ...strip },
    windows,
    foot: { x: -strip.width / 2, y: top + strip.height - foot, width: strip.width, height: foot },
    tape: {
      x: -tape.width / 2,
      y: -height / 2,
      width: tape.width,
      height: tape.height,
      turn: tape.turn,
    },
  };
}

/**
 * A chat's piece (`chat`, `chatPair`), in canvas pixels of 1080: its photos' widths (3:4, as a
 * phone's, rounded as a chat shows them), how far down and left the second of two goes as times
 * the first (and right and down on a wide canvas), the date's band over them, the room between the
 * parts, and the band of the message under them (as wide as the piece, the message shrunk to fit
 * it). On a wide canvas, the photos at the left and the date and message in a column beside them.
 */
const CHAT = {
  one: 560,
  two: 440,
  second: { down: 0.84, left: 0.3 },
  wideSecond: { right: 0.5, down: 0.16 },
  date: 56,
  gap: 28,
  message: 150,
  width: 860,
  column: 620,
  radius: 40,
} as const;

/** A chat's piece laid out (see `chatBox`): the piece, its photos, its date and its message. */
export interface ChatBox extends Size {
  readonly windows: readonly BoxRect[];
  readonly date: BoxRect;
  readonly message: BoxRect;
  readonly radius: number;
  /** Whether it is laid out for a wide canvas, side by side. */
  readonly wide: boolean;
}

/**
 * Where a chat's piece puts its parts, with one photo or two (`pair`): stacked, the date over the
 * photos at the right and the message under them, its right edge with theirs, as a chat sends them;
 * on a wide `canvas`, the photos at the left and the date and message beside them. Time and space
 * O(1).
 */
export function chatBox(pair: boolean, canvas: Size): ChatBox {
  const { gap, radius } = CHAT;
  const width = pair ? CHAT.two : CHAT.one;
  const height = (width / SLOT_PICTURE.width) * SLOT_PICTURE.height;
  const wide = canvas.width > canvas.height;
  if (wide) {
    const area = pair
      ? { width: width * (1 + CHAT.wideSecond.right), height: height * (1 + CHAT.wideSecond.down) }
      : { width, height };
    const whole = { width: area.width + 2 * gap + CHAT.column, height: area.height };
    const left = -whole.width / 2;
    const top = -whole.height / 2;
    const first = { x: left, y: top, width, height };
    const column = { x: left + area.width + 2 * gap, width: CHAT.column };
    const block = CHAT.date + gap + CHAT.message;
    return {
      ...whole,
      wide,
      radius,
      windows: pair
        ? [
            first,
            {
              x: left + width * CHAT.wideSecond.right,
              y: top + height * CHAT.wideSecond.down,
              width,
              height,
            },
          ]
        : [first],
      date: { ...column, y: -block / 2, height: CHAT.date },
      message: { ...column, y: -block / 2 + CHAT.date + gap, height: CHAT.message },
    };
  }
  const area = pair ? height * (1 + CHAT.second.down) : height;
  const whole = { width: CHAT.width, height: CHAT.date + 2 * gap + area + CHAT.message };
  const right = whole.width / 2;
  const top = -whole.height / 2;
  const photosTop = top + CHAT.date + gap;
  const first = { x: right - width, y: photosTop, width, height };
  return {
    ...whole,
    wide,
    radius,
    windows: pair
      ? [
          first,
          {
            x: right - width - width * CHAT.second.left,
            y: photosTop + height * CHAT.second.down,
            width,
            height,
          },
        ]
      : [first],
    date: { x: -whole.width / 2, y: top, width: whole.width, height: CHAT.date },
    message: {
      x: -whole.width / 2,
      y: photosTop + area + gap,
      width: whole.width,
      height: CHAT.message,
    },
  };
}

/**
 * The windows of a holder of several (see `mountWindows`) on `canvas`, from its middle; `null`
 * for the rest.
 */
function windowsOf(mount: ImageMount | undefined, canvas: Size): readonly BoxRect[] | null {
  switch (mount) {
    case 'slides':
      return slidesBox().windows;
    case 'photobooth':
      return boothBox().windows;
    case 'chatPair':
      return chatBox(true, canvas).windows;
    default:
      return null;
  }
}

/**
 * The window of `layer` under `point`, from its middle and before its scale (see `layerPoint`):
 * the photo touched in a slide viewer, a photobooth's strip or a chat with two, the nearest between
 * two; else its only window (0), also off them. Time O(w) for w windows.
 */
export function windowAt(
  layer: ImageLayer,
  point: { readonly x: number; readonly y: number },
  canvas: Size,
): number {
  const windows = windowsOf(layer.mount, canvas);
  if (windows === null) {
    return 0;
  }
  // Photos that overlap (a chat's two): the one on top, the last, where both are.
  const under = windows
    .map((rect, i) => ({ rect, i }))
    .reverse()
    .find(
      ({ rect }) =>
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height,
    );
  if (under !== undefined) {
    return under.i;
  }
  const at = windows.findIndex(({ y, height }) => point.y >= y && point.y <= y + height);
  if (at !== -1) {
    return at;
  }
  // Between two photos, the nearest.
  const distances = windows.map(({ y, height }) => Math.abs(point.y - (y + height / 2)));
  return distances.indexOf(Math.min(...distances));
}

/**
 * The widget of a picture in its holder (see `IMAGE_MOUNTS`), as tall as `IMAGE_SIDE`, but the
 * camera and the crop screen, as big as the `canvas`, and the slide viewer and the photobooth's
 * strip, as `slidesBox` and `boothBox` make them. Time and space O(1).
 */
export function mountBox(mount: ImageMount, canvas: Size): MountBox {
  const height = IMAGE_SIDE;
  switch (mount) {
    case 'camera':
    case 'crop': {
      const picture = {
        x: -canvas.width / 2,
        y: -canvas.height / 2,
        width: canvas.width,
        height: canvas.height,
      };
      const none = { ...picture, width: 0 };
      return { ...canvas, picture, radius: 0, holes: [], sides: [none, none], frames: [] };
    }
    case 'slides': {
      const slides = slidesBox();
      const [picture] = slides.windows;
      const none = { ...picture, width: 0 };
      return {
        width: slides.width,
        height: slides.height,
        picture,
        radius: slides.radius,
        holes: [],
        sides: [none, none],
        frames: [],
      };
    }
    case 'photobooth': {
      const booth = boothBox();
      const [picture] = booth.windows;
      const none = { ...picture, width: 0 };
      return {
        width: booth.width,
        height: booth.height,
        picture,
        radius: 0,
        holes: [],
        sides: [none, none],
        frames: [],
      };
    }
    case 'chat':
    case 'chatPair': {
      const chat = chatBox(mount === 'chatPair', canvas);
      const [picture] = chat.windows;
      const none = { ...picture, width: 0 };
      return {
        width: chat.width,
        height: chat.height,
        picture,
        radius: chat.radius,
        holes: [],
        sides: [none, none],
        frames: [],
      };
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

/**
 * The frame of an instant photo: a white and a black faded with time, as an old print's (the user's
 * choice), not the pure ones of a picture's frame (see `FRAME_COLORS`).
 */
export const INSTANT_COLORS: Readonly<Record<Exclude<ImageFrame, 'none'>, string>> = {
  light: '#EDE8DC',
  dark: '#262321',
};

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
 * Shows another picture in the window `window` of the image layer `id` (its frame, place and size
 * stay, and its other windows). Returns `template` itself when the layer or window is missing or
 * already shows it.
 */
export function setLayerImage(
  template: Template,
  id: string,
  image: string,
  window: number = 0,
): Template {
  const index = template.layers.findIndex((layer) => layer.id === id);
  const layer = template.layers[index];
  if (
    layer === undefined ||
    !isImageLayer(layer) ||
    window >= windowCount(layer) ||
    layerPictures(layer)[window] === image
  ) {
    return template;
  }
  const layers = [...template.layers];
  layers[index] = withWindowPicture(layer, window, image);
  return { ...template, layers };
}
