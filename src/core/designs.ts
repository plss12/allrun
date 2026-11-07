import { emptyLayout, defaultActivityTemplate, defaultSummaryTemplate } from './default-layout';
import { instantBox, mountBox, SAMPLE_IMAGE, slidesBox, boothBox, chatBox } from './image-layer';
import { at, type TemplateData } from './layout-kit';
import {
  CANVAS_FORMATS,
  type CanvasFormat,
  type ImageMount,
  type Layer,
  newTemplate,
  type Template,
} from './template';

/**
 * AllRun's designs (ADR 007, R4d): recipes that lay a design out for the data and format they are
 * given, each with its slots for photos (see `isPhotoSlot`), empty until the user fills them. Their
 * thumbnails show our stock photos in those slots. Adding one is adding a recipe here.
 */
export const READY_DESIGN_IDS = [
  'messageOne',
  'messageTwo',
  'filmFrame',
  'lightNegative',
  'filmStrip',
  'camera',
  'crop',
  'polaroid',
  'slides',
  'photobooth',
] as const;

export type ReadyDesignId = (typeof READY_DESIGN_IDS)[number];

/** A design laid out by its recipe. */
export interface ReadyDesign {
  readonly template: Template;
}

const BLACK = '#000000';
const WHITE = '#FFFFFF';
/** Where the watermark goes across a wide canvas, as a fraction of it. */
const WIDE_WATERMARK_X = 0.72;
/** The room the watermark takes at the canvas's foot, on it. */
const FOOT = 0.1;

/** A slot of `mount`, empty, centered at (`x`, `y`) of the canvas at `scale`. */
function slot(id: string, mount: ImageMount, x: number, y: number, scale: number): Layer {
  return {
    id,
    kind: 'image',
    image: SAMPLE_IMAGE,
    frame: 'none',
    mount,
    transform: at({ x, y, scale }),
    opacity: 1,
  };
}

/** The format's AllRun watermark, where a new design has it. */
function watermark(data: TemplateData, format: CanvasFormat): readonly Layer[] {
  const { layers } = emptyLayout(
    data.mode === 'activity'
      ? defaultActivityTemplate(data.activity, format)
      : defaultSummaryTemplate(data.summary, format),
  );
  // A wide canvas has the photos at its left: under the message, beside them.
  return CANVAS_FORMATS[format].width > CANVAS_FORMATS[format].height
    ? layers.map((layer) => ({ ...layer, transform: { ...layer.transform, x: WIDE_WATERMARK_X } }))
    : layers;
}

/** A design over a color of its own, with the widgets `layers`. */
function design(
  id: ReadyDesignId,
  data: TemplateData,
  format: CanvasFormat,
  color: string,
  layers: readonly Layer[],
): Template {
  return {
    ...newTemplate({ id: `allrun-${id}`, mode: data.mode, format, layers: [...layers] }),
    background: { kind: 'color', color },
  };
}

/**
 * Most of the canvas a chat takes, wide and tall, and where its middle goes down it: above the
 * watermark at the canvas's foot, which on a wide canvas reaches higher up it.
 */
const CHAT_ROOM = {
  tall: { width: 0.9, height: 1 - FOOT - 0.06, y: (1 - FOOT) / 2 },
  wide: { width: 0.9, height: 0.74, y: 0.42 },
} as const;

/**
 * A chat in dark mode with one photo or two (`pair`), as one piece (see `chatBox`: the date, the
 * sent photos and the message, the user's choice, so that nothing runs into anything on another
 * format), as big as it fits over the watermark, over black. Time and space O(1).
 */
function message(
  id: ReadyDesignId,
  pair: boolean,
  data: TemplateData,
  format: CanvasFormat,
): ReadyDesign {
  const canvas = CANVAS_FORMATS[format];
  const box = chatBox(pair, canvas);
  const room = box.wide ? CHAT_ROOM.wide : CHAT_ROOM.tall;
  const scale = Math.min(
    (room.width * canvas.width) / box.width,
    (room.height * canvas.height) / box.height,
  );
  return {
    template: design(id, data, format, BLACK, [
      slot('photo-1', pair ? 'chatPair' : 'chat', 0.5, room.y, scale),
      ...watermark(data, format),
    ]),
  };
}

/** Most of the canvas a piece takes, wide and tall. */
const PIECE = { width: 0.9, height: 0.86 } as const;

/** One holder in the middle of the canvas, as big as it fits, over white. */
function centeredPiece(
  id: ReadyDesignId,
  mount: ImageMount,
  data: TemplateData,
  format: CanvasFormat,
): ReadyDesign {
  const canvas = CANVAS_FORMATS[format];
  const box = mountBox(mount, canvas);
  const scale = Math.min(
    (PIECE.width * canvas.width) / box.width,
    (PIECE.height * canvas.height) / box.height,
  );
  return {
    template: design(id, data, format, WHITE, [slot('photo-1', mount, 0.5, 0.5, scale)]),
  };
}

/** How much a strip of film leans, clockwise (2°): what sets it apart from the other films. */
const STRIP_TILT = (2 * Math.PI) / 180;
/** Most of the canvas a strip's frame takes wide, and the strip tall. */
const STRIP = { width: 0.8, height: 0.82 } as const;

/**
 * A strip of film across a black canvas, leaning, its ends off the canvas (but in a wide canvas,
 * where it is too low to reach them). Time and space O(1).
 */
function filmStrip(data: TemplateData, format: CanvasFormat): ReadyDesign {
  const canvas = CANVAS_FORMATS[format];
  const box = mountBox('filmStrip', canvas);
  const scale = Math.min(
    (STRIP.width * canvas.width) / box.picture.width,
    (STRIP.height * canvas.height) / box.height,
  );
  const strip = slot('photo-1', 'filmStrip', 0.5, 0.5, scale);
  return {
    template: design('filmStrip', data, format, BLACK, [
      { ...strip, transform: { ...strip.transform, rotation: STRIP_TILT } },
    ]),
  };
}

/**
 * The phone's camera with its photo, the design's only widget: as big as the canvas in every format,
 * over black where it is moved away from. Time and space O(1).
 */
function camera(data: TemplateData, format: CanvasFormat): ReadyDesign {
  return {
    template: design('camera', data, format, BLACK, [slot('photo-1', 'camera', 0.5, 0.5, 1)]),
  };
}

/**
 * A phone's crop screen with its photo, the design's only widget: as big as the canvas in every
 * format, its box a smaller canvas, over black where it is moved away from. Time and space O(1).
 */
function crop(data: TemplateData, format: CanvasFormat): ReadyDesign {
  return {
    template: design('crop', data, format, BLACK, [slot('photo-1', 'crop', 0.5, 0.5, 1)]),
  };
}

/**
 * A Polaroid over the canvas's photo: how much of the canvas's width it takes, the most of its
 * height, and how much it leans, counterclockwise (4°), as one dropped on a table.
 */
const POLAROID = { width: 0.55, height: 0.8, tilt: (-4 * Math.PI) / 180 } as const;

/**
 * An instant photo with its place under it, leaning, over the canvas's own photo, the background
 * the user chooses (the user's choice: a landscape behind, and another photo in the Polaroid).
 * Over black with no photo yet. Time and space O(1).
 */
function polaroid(data: TemplateData, format: CanvasFormat): ReadyDesign {
  const canvas = CANVAS_FORMATS[format];
  const box = instantBox();
  const scale = Math.min(
    (POLAROID.width * canvas.width) / box.width,
    (POLAROID.height * canvas.height) / box.height,
  );
  const photo: Layer = {
    id: 'photo-1',
    kind: 'image',
    image: SAMPLE_IMAGE,
    frame: 'light',
    caption: 'place',
    slot: true,
    transform: { x: 0.5, y: 0.5, scale, rotation: POLAROID.tilt },
    opacity: 1,
  };
  return { template: design('polaroid', data, format, BLACK, [photo]) };
}

/** Most of the canvas a slide viewer takes, wide and tall. */
const SLIDES_ROOM = { width: 0.9, height: 0.95 } as const;

/**
 * An old slide viewer with three photos, a datum in each (the user's choice), as big as it fits,
 * over black, as its own body is. Time and space O(1).
 */
function slides(data: TemplateData, format: CanvasFormat): ReadyDesign {
  const canvas = CANVAS_FORMATS[format];
  const box = slidesBox();
  const scale = Math.min(
    (SLIDES_ROOM.width * canvas.width) / box.width,
    (SLIDES_ROOM.height * canvas.height) / box.height,
  );
  return {
    template: design('slides', data, format, BLACK, [slot('photo-1', 'slides', 0.5, 0.5, scale)]),
  };
}

/**
 * A photobooth's strip over the canvas's photo: how much of the canvas it takes at most, wide and
 * tall, and how much it leans, clockwise (3°), as one left on a table (the user's choice).
 */
const BOOTH_ROOM = { width: 0.46, height: 0.8, tilt: (-3 * Math.PI) / 180 } as const;

/**
 * A photobooth's strip with three photos, leaning, over the canvas's own photo, the background the
 * user chooses, as the Polaroid's; its datum on the tape, its date at its foot. Over black with no
 * photo yet. Time and space O(1).
 */
function photobooth(data: TemplateData, format: CanvasFormat): ReadyDesign {
  const canvas = CANVAS_FORMATS[format];
  const box = boothBox();
  const scale = Math.min(
    (BOOTH_ROOM.width * canvas.width) / box.width,
    (BOOTH_ROOM.height * canvas.height) / box.height,
  );
  const strip: Layer = {
    id: 'photo-1',
    kind: 'image',
    image: SAMPLE_IMAGE,
    frame: 'none',
    mount: 'photobooth',
    transform: { x: 0.5, y: 0.5, scale, rotation: BOOTH_ROOM.tilt },
    opacity: 1,
  };
  return { template: design('photobooth', data, format, BLACK, [strip]) };
}

const RECIPES: Readonly<
  Record<ReadyDesignId, (data: TemplateData, format: CanvasFormat) => ReadyDesign>
> = {
  messageOne: (data, format) => message('messageOne', false, data, format),
  messageTwo: (data, format) => message('messageTwo', true, data, format),
  filmFrame: (data, format) => centeredPiece('filmFrame', 'filmFrame', data, format),
  lightNegative: (data, format) => centeredPiece('lightNegative', 'lightNegative', data, format),
  filmStrip,
  camera,
  crop,
  polaroid,
  slides,
  photobooth,
};

/** One of AllRun's designs laid out for `data` in `format`. Time and space O(1). */
export function readyDesign(
  id: ReadyDesignId,
  data: TemplateData,
  format: CanvasFormat,
): ReadyDesign {
  return RECIPES[id](data, format);
}
