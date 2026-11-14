import {
  BlurMask,
  FontWeight,
  Group,
  Image,
  Paint,
  Path,
  Rect,
  Skia,
  type SkImage,
  type SkParagraph,
  type SkPath,
  type SkTypefaceFontProvider,
  TextAlign,
} from '@shopify/react-native-skia';
import type { ReactElement } from 'react';

import type { BoothBox, CalendarBox, ChatBox, MarginsBox, SlidesBox } from '@/core/image-layer';
import type { FontId } from '@/core/template';

import { drawsBold, fontFamiliesOf } from '../fonts';
import { DropShadow } from '../scene-text';
import type { BoothText, CalendarText, MarginsText } from '../mount-caption';
import { discardParagraph, finishParagraph } from '../paragraph-arena';
import { ParagraphPicture } from '../paragraph-picture';
import { NO_WRAP_WIDTH, type PlacedParagraph } from './paragraphs';
import { EmptySign, LOADING_PICTURE, PHOTO_SAMPLING } from './photo';

/**
 * How a calendar's sheet looks: its paper, its ink, and its brand's color (the band and the
 * weekday), in Track Red or Night Ink (`cover`), as the brand's covers go in pairs.
 */
const CALENDAR_PAPER = '#FAF8F3';
const CALENDAR_INK = '#1A1A1A';
export const CALENDAR_LOOK = { red: '#C94A2E', ink: '#141B2D' } as const;

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
export function calendarTexts(
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
export function CalendarWidget({
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
export function marginsTexts(
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
export function MarginsWidget({
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
export function chatDate(
  fonts: SkTypefaceFontProvider,
  text: string,
  box: ChatBox,
): PlacedParagraph {
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
export function ChatWidget({
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
export function boothWriting(
  fonts: SkTypefaceFontProvider,
  text: BoothText,
  box: BoothBox,
): BoothWriting {
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
export function BoothWidget({
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
export function slidesData(
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
export function SlidesWidget({
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
