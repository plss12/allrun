import { emptyLayout, defaultActivityTemplate, defaultSummaryTemplate } from './default-layout';
import { IMAGE_SIDE, mountBox, SAMPLE_IMAGE, SLOT_PICTURE } from './image-layer';
import { at, type TemplateData, textStyle } from './layout-kit';
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
export const READY_DESIGN_IDS = ['messageOne', 'messageTwo', 'filmFrame', 'lightNegative'] as const;

export type ReadyDesignId = (typeof READY_DESIGN_IDS)[number];

/** A design laid out, and the widgets to align once measured, which only the scene can do. */
export interface ReadyDesign {
  readonly template: Template;
  /** A layer whose right edge goes at `right` (a fraction of the canvas's width). */
  readonly alignRight: readonly { readonly id: string; readonly right: number }[];
}

const BLACK = '#000000';
const WHITE = '#FFFFFF';
/** The gray of a chat's date over a dark background. */
const CHAT_DATE = '#8E8E93';
/**
 * Of a sent chat message over the canvas: its size, and about how tall it comes out. Small, for the
 * photo to lead (decision of the user).
 */
const BUBBLE = { scale: 0.85, height: 145 } as const;
/** In a wide canvas the message goes beside the photos, smaller. */
const WIDE_BUBBLE_SCALE = 0.6;
/** A chat's date: its size and about how tall it comes out; and the room around each part. */
const DATE = { scale: 0.62, height: 50 } as const;
const GAP = 28;
/** The room the watermark takes at the canvas's foot, on it. */
const FOOT = 0.1;

/** A chat's photo: an empty slot with rounded corners, the same widget as "Your photo". */
function chatPhoto(id: string, x: number, y: number, scale: number): Layer {
  return {
    id,
    kind: 'image',
    image: SAMPLE_IMAGE,
    frame: 'none',
    rounded: true,
    slot: true,
    transform: at({ x, y, scale }),
    opacity: 1,
  };
}

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

/** The date of an activity or the name of a period, small and gray, over a chat. */
function chatDate(data: TemplateData, x: number, y: number): Layer {
  const style = textStyle('inter', { color: CHAT_DATE, shadow: false });
  const transform = at({ x, y, scale: DATE.scale });
  return data.mode === 'activity'
    ? {
        id: 'date',
        kind: 'info',
        field: 'activityDate',
        dateFormat: 'long',
        style,
        transform,
        opacity: 1,
      }
    : { id: 'date', kind: 'info', field: 'periodName', style, transform, opacity: 1 };
}

/** The data as a sent chat message, in dark mode, centered at (`x`, `y`) of the canvas. */
function chatBubble(data: TemplateData, x: number, y: number, scale: number = BUBBLE.scale): Layer {
  const common = { id: 'message', logo: false, transform: at({ x, y, scale }) };
  const style = { font: 'inter', color: WHITE, bold: false, uppercase: false } as const;
  return data.mode === 'activity'
    ? {
        ...common,
        kind: 'activityBlock',
        block: { design: 'message', layout: 'dark' },
        style,
        opacity: 1,
      }
    : {
        ...common,
        kind: 'summaryBlock',
        block: { design: 'periodMessage', layout: 'dark' },
        style,
        opacity: 1,
      };
}

/** The format's AllRun watermark, where a new design has it. */
function watermark(data: TemplateData, format: CanvasFormat): readonly Layer[] {
  return emptyLayout(
    data.mode === 'activity'
      ? defaultActivityTemplate(data.activity, format)
      : defaultSummaryTemplate(data.summary, format),
  ).layers;
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
 * How the parts of a chat go in `format`: stacked (the date, the photos, the message), or in a wide
 * canvas with the photos at the left and the rest beside them.
 *
 * @param stack - How tall the photos are, as times one photo's height.
 * @param share - The most of the canvas's width a photo takes.
 */
function chatLayout(format: CanvasFormat, stack: number, share: number) {
  const canvas = CANVAS_FORMATS[format];
  const photoWidth = (IMAGE_SIDE * SLOT_PICTURE.width) / SLOT_PICTURE.height;
  const wide = canvas.width > canvas.height;
  const room = wide
    ? canvas.height * (1 - 2 * 0.06)
    : canvas.height * (1 - FOOT - 0.04) - DATE.height - BUBBLE.height - 2 * GAP;
  const scale = Math.min(room / (stack * IMAGE_SIDE), (share * canvas.width) / photoWidth);
  const height = stack * IMAGE_SIDE * scale;
  const width = photoWidth * scale;
  return { canvas, wide, scale, width, height };
}

function messageOne(data: TemplateData, format: CanvasFormat): ReadyDesign {
  const { canvas, wide, scale, width, height } = chatLayout(format, 1, 0.63);
  if (wide) {
    const x = 0.06 + width / 2 / canvas.width;
    const right = 0.95;
    return {
      template: design('messageOne', data, format, BLACK, [
        chatPhoto('photo-1', x, 0.5, scale),
        chatDate(data, (x + width / 2 / canvas.width + right) / 2, 0.22),
        chatBubble(data, 0.7, 0.5, WIDE_BUBBLE_SCALE),
        ...watermark(data, format),
      ]),
      alignRight: [{ id: 'message', right }],
    };
  }
  const right = 0.94;
  const x = right - width / 2 / canvas.width;
  const total = DATE.height + GAP + height + GAP + BUBBLE.height;
  const top = (canvas.height * (1 - FOOT) - total) / 2;
  const photoTop = top + DATE.height + GAP;
  return {
    template: design('messageOne', data, format, BLACK, [
      chatDate(data, 0.5, (top + DATE.height / 2) / canvas.height),
      chatPhoto('photo-1', x, (photoTop + height / 2) / canvas.height, scale),
      chatBubble(data, x, (photoTop + height + GAP + BUBBLE.height / 2) / canvas.height),
      ...watermark(data, format),
    ]),
    alignRight: [{ id: 'message', right }],
  };
}

/** How far down and to the left the second of two photos of a chat goes, as times the first. */
const SECOND_PHOTO = { down: 0.84, left: 0.3 } as const;

function messageTwo(data: TemplateData, format: CanvasFormat): ReadyDesign {
  const wide = CANVAS_FORMATS[format].width > CANVAS_FORMATS[format].height;
  const { canvas, scale, width, height } = chatLayout(
    format,
    wide ? 1 : 1 + SECOND_PHOTO.down,
    0.42,
  );
  const photo = IMAGE_SIDE * scale;
  if (wide) {
    // Smaller, side by side and overlapped, to leave the message its half of the canvas.
    const shrink = 0.82;
    const half = (width * shrink) / 2 / canvas.width;
    const first = 0.05 + half;
    const second = first + half;
    return {
      template: design('messageTwo', data, format, BLACK, [
        chatPhoto('photo-1', first, 0.46, scale * shrink),
        chatPhoto('photo-2', second, 0.54, scale * shrink),
        chatDate(data, 0.78, 0.26),
        chatBubble(data, 0.78, 0.5, WIDE_BUBBLE_SCALE),
        ...watermark(data, format),
      ]),
      alignRight: [{ id: 'message', right: 0.95 }],
    };
  }
  const right = 0.94;
  const x = right - width / 2 / canvas.width;
  const total = DATE.height + GAP + height + GAP + BUBBLE.height;
  const top = (canvas.height * (1 - FOOT) - total) / 2;
  const photoTop = top + DATE.height + GAP;
  const firstY = photoTop + photo / 2;
  const secondY = firstY + photo * SECOND_PHOTO.down;
  return {
    template: design('messageTwo', data, format, BLACK, [
      chatDate(data, 0.5, (top + DATE.height / 2) / canvas.height),
      chatPhoto('photo-1', x, firstY / canvas.height, scale),
      chatPhoto(
        'photo-2',
        x - (width * SECOND_PHOTO.left) / canvas.width,
        secondY / canvas.height,
        scale,
      ),
      chatBubble(data, x, (photoTop + height + GAP + BUBBLE.height / 2) / canvas.height),
      ...watermark(data, format),
    ]),
    alignRight: [{ id: 'message', right }],
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
  const box = mountBox(mount);
  const scale = Math.min(
    (PIECE.width * canvas.width) / box.width,
    (PIECE.height * canvas.height) / box.height,
  );
  return {
    template: design(id, data, format, WHITE, [slot('photo-1', mount, 0.5, 0.5, scale)]),
    alignRight: [],
  };
}

const RECIPES: Readonly<
  Record<ReadyDesignId, (data: TemplateData, format: CanvasFormat) => ReadyDesign>
> = {
  messageOne,
  messageTwo,
  filmFrame: (data, format) => centeredPiece('filmFrame', 'filmFrame', data, format),
  lightNegative: (data, format) => centeredPiece('lightNegative', 'lightNegative', data, format),
};

/** One of AllRun's designs laid out for `data` in `format`. Time and space O(1). */
export function readyDesign(
  id: ReadyDesignId,
  data: TemplateData,
  format: CanvasFormat,
): ReadyDesign {
  return RECIPES[id](data, format);
}
