import {
  FontWeight,
  Group,
  Image,
  Paint,
  Path,
  Rect,
  RoundedRect,
  Skia,
  type SkImage,
  type SkParagraph,
  type SkPath,
  type SkTypefaceFontProvider,
  TextAlign,
} from '@shopify/react-native-skia';
import type { ReactElement } from 'react';

import {
  boothBox,
  calendarBox,
  CAPTION_INK,
  chatBox,
  cropFrame,
  type CropFrame,
  FRAME_COLORS,
  imageBox,
  type ImageBox,
  INSTANT_COLORS,
  instantBox,
  type InstantBox,
  instantFrame,
  isPhotoSlot,
  layerPictures,
  marginsBox,
  mountBox,
  type MountBox,
  PICTURE_RADIUS,
  SAMPLE_IMAGE,
  SAMPLE_PICTURE,
  slidesBox,
  SLOT_PICTURE,
  slotBox,
  STRIP_TEXT_INSET,
} from '@/core/image-layer';
import type { Size } from '@/core/photo-placement';
import type { FontId, Layer } from '@/core/template';
import { formatActivityDate } from '@/ui/format';

import { periodName } from '../editor-data';
import { prepareActivityBlock } from '../activity-blocks';
import { prepareSummaryBlock } from '../summary-blocks';
import { drawsBold, fontFamiliesOf } from '../fonts';
import { DropShadow } from '../scene-text';
import { instantCaption } from '../instant-caption';
import {
  boothCaption,
  calendarCaption,
  cropCaption,
  type LetteredMount,
  marginsCaption,
  MOUNT_ARROW as MOUNT_ARROW_MARK,
  mountCaption,
  type MountMarks,
  type MountSide,
  type MountStrip,
  slidesCaption,
} from '../mount-caption';
import { discardParagraph, finishParagraph } from '../paragraph-arena';
import { ParagraphPicture } from '../paragraph-picture';
import type { DrawRect, LayerContext, PreparedLayer } from '../template-scene';
import {
  BoothWidget,
  boothWriting,
  CALENDAR_LOOK,
  calendarTexts,
  CalendarWidget,
  chatDate,
  ChatWidget,
  marginsTexts,
  MarginsWidget,
  slidesData,
  SlidesWidget,
} from './mount-replicas';
import { captionParagraphs, NO_WRAP_WIDTH, type PlacedParagraph } from './paragraphs';
import { EmptySign, LOADING_PICTURE, PHOTO_SAMPLING } from './photo';

/** A picture: alone, on its frame or in its holder, with what its holder writes. */
export function prepareImageLayer(
  layer: Extract<Layer, { kind: 'image' }>,
  context: LayerContext,
  canvas: Size,
): PreparedLayer | null {
  const { data, fonts, textContext, translate, images, emptySlots, phrases } = context;
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
        <ChatWidget box={box} photos={photos} date={chatDate(fonts, date, box)} message={message} />
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
            {
              ...common,
              kind: 'activityBlock',
              block: { design: 'camera', cover: layer.cover },
            },
            data,
            context,
          )
        : prepareSummaryBlock(
            {
              ...common,
              kind: 'summaryBlock',
              block: { design: 'periodCamera', cover: layer.cover },
            },
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
