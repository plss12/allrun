import type { SkTypefaceFontProvider } from '@shopify/react-native-skia';

import type { SportIconId } from '@/core/activity-block';
import type { HitHole } from '@/core/layer-transform';
import type { Size } from '@/core/photo-placement';
import type { APP_MODES, BRAND_COVERS } from '@/core/template';

import type { LabelKey } from '../editor-data';
import type { BlockContext } from '../activity-blocks';
import { type Box, column, overlay, placed, row, spread, widened } from './layout';
import {
  appTextBox,
  centeredAt,
  discBox,
  fillBox,
  hairlineBox,
  iconBox,
  markBox,
  panel,
  paragraph,
  symbolBox,
  textBox,
} from './pieces';
import { SIZES } from './sizes';

/** Most splits a note lists one by one; longer activities group them (km 1–2…). */
export const NOTES_ROWS = 16;
/** Room inside a note, its corners' radius and its narrowest width. */
const NOTES_PAD = 40;
const NOTES_RADIUS = 34;
const NOTES_MIN_WIDTH = 520;

/** A note's texts: its bar's ("< AllRun") and icon, its title and its lines. */
export const NOTES_SIZES = SIZES.notes;

/** A sport at the end of a note's bar: its `name` in small letters and its icon, in the accent. */
export function noteSportBox(
  fonts: SkTypefaceFontProvider,
  mode: (typeof APP_MODES)[number],
  name: string,
  icon: SportIconId,
): Box {
  const { accent } = NOTES_COLORS[mode];
  return row(
    [
      appTextBox(
        fonts,
        [{ text: name.toLocaleLowerCase(), size: NOTES_SIZES.bar, bold: false }],
        accent,
      ),
      iconBox(icon, NOTES_SIZES.icon, accent),
    ],
    NOTES_SIZES.bar * 0.3,
    'center',
  );
}

/**
 * A note of the iPhone's Notes in `mode`, in its font and colors: "< AllRun" at the start of its
 * bar and `side`, if any, at its end, over its `title` and its `lines` (`NOTES_SIZES.row` tall).
 */
export function noteBox(
  fonts: SkTypefaceFontProvider,
  mode: (typeof APP_MODES)[number],
  title: string,
  lines: readonly Box[],
  side?: Box,
): Box {
  const colors = NOTES_COLORS[mode];
  const sizes = NOTES_SIZES;
  const heading = appTextBox(fonts, [{ text: title, size: sizes.title, bold: true }], colors.ink);
  const back = row(
    [
      markBox('chevron', sizes.bar, colors.accent),
      appTextBox(fonts, [{ text: 'AllRun', size: sizes.bar, bold: false }], colors.accent),
    ],
    sizes.bar * 0.3,
    'center',
  );
  const note = column(
    [heading, column(lines, sizes.row * 0.15, 'start')],
    sizes.row * 0.3,
    'start',
  );
  const width = Math.max(
    NOTES_MIN_WIDTH,
    note.width,
    back.width + (side?.width ?? 0) + sizes.bar * 2,
  );
  const bar = side === undefined ? widened(back, width, 'start') : spread(back, side, width);
  return panel(
    column([bar, note], sizes.bar * 0.7, 'start'),
    colors.page,
    NOTES_PAD,
    NOTES_PAD * 0.8,
    NOTES_RADIUS,
  );
}

/** The iPhone's Notes in dark and light mode: the page, the text and the yellow of its accents. */
export const NOTES_COLORS = {
  dark: { page: '#000000', ink: '#FFFFFF', accent: '#E8B43A' },
  light: { page: '#FFFFFF', ink: '#000000', accent: '#D49B12' },
} as const;

/** Sizes of a sent chat message: its text and the line under it. */
export const MESSAGE_SIZES = { text: 50, meta: 26 } as const;

/**
 * A sent chat message in dark and light mode: the green bubble, its text, the line under it
 * (where the time goes) and the blue read ticks.
 */
export const MESSAGE_COLORS = {
  dark: { bubble: '#005C4B', ink: '#E9EDEF', meta: '#E9EDEF99', ticks: '#53BDEB' },
  light: { bubble: '#D9FDD3', ink: '#111B21', meta: '#667781', ticks: '#53BDEB' },
} as const;

/**
 * A song playing on the iPhone's lock screen (iOS 26), in dark and light mode: the see-through
 * glass card and its edge, its texts (the song's name, and the fainter artist and times), the
 * progress bar's track and what has played, and the dimmed "previous" button.
 */
export const MUSIC_COLORS = {
  dark: {
    card: '#2C2C2EA6',
    edge: '#FFFFFF2E',
    ink: '#FFFFFF',
    faded: '#FFFFFF8C',
    dimmed: '#FFFFFF59',
    track: '#FFFFFF2E',
    played: '#FFFFFF8C',
  },
  light: {
    card: '#F2F2F7CC',
    edge: '#FFFFFF99',
    ink: '#000000',
    faded: '#3C3C4399',
    dimmed: '#3C3C4359',
    track: '#3C3C432E',
    played: '#3C3C4399',
  },
} as const;
/** The cover's colors in AllRun's red and night ink, the route in chalk on either. */
export const BRAND_COVER_COLORS = { red: '#C94A2E', ink: '#141B2D' } as const;
export const COVER_ROUTE = '#F6F1EA';

/** What the camera shows of an activity or a period (see `cameraBox`). */
export interface CameraContent {
  /** Where its settings go, at the top. */
  readonly values: readonly string[];
  /** The mark on its f button, `size` big. */
  readonly lens: (size: number, color: string) => Box;
  /**
   * What its last photo's thumbnail shows, `size` big, in {@link COVER_ROUTE}, or `null` for no
   * thumbnail.
   */
  readonly thumbnail: (size: number) => Box | null;
  /** The last photo's color, as the song's cover: AllRun's red or night ink. */
  readonly cover: (typeof BRAND_COVERS)[number];
}

/**
 * The phone's camera framing the whole canvas: its dimmed bands, grid and buttons over the photo,
 * seen through its see-through part (`hole`, which touches go through), as an activity's and a
 * period's widgets draw it. Time and space O(1).
 */
export function cameraBox(
  fonts: SkTypefaceFontProvider,
  translate: BlockContext['translate'],
  { width, height }: Size,
  { values: written, lens: lensMark, thumbnail, cover }: CameraContent,
): { readonly box: Box; readonly hole: HitHole } {
  const colors = CAMERA_COLORS;
  const unit = Math.min(1, height / CAMERA.storyHeight);
  const top = CAMERA.top * unit;
  const bottom = height - CAMERA.bottom * unit;
  const third = (bottom - top) / 3;
  const flat = {};
  const glass = { edge: colors.edge };
  /** A round button `size` across with `content` in its middle. */
  const button = (size: number, color: string, content: Box | null, edge?: string) =>
    [discBox(size / 2, color), ...(edge === undefined ? [] : [discBox(size / 2, edge, 2)])]
      .concat(content === null ? [] : [content])
      .reduce(overlay);
  const camText = (key: LabelKey, size: number, color: string, bold = false) =>
    appTextBox(fonts, [{ text: translate(key), size: size * unit, bold }], color);

  const data = CAMERA.data;
  const values = row(
    written.map((value) =>
      appTextBox(fonts, [{ text: value, size: data.size * unit, bold: true }], colors.ink),
    ),
    data.gap * unit,
    'center',
  );
  const pillHeight = data.height * unit;
  const pill = overlay(
    fillBox(values.width + 2 * data.pad * unit, pillHeight, pillHeight / 2, colors.pill, flat),
    values,
  );

  const lens = CAMERA.lens;
  const lensSize = lens.size * unit;
  const lensY = bottom - lens.fromBottom * unit;
  const zoom = CAMERA.zoom;

  const shutter = CAMERA.shutter;
  const shutterY = bottom + shutter.y * unit;

  const controls = CAMERA.controls;
  const controlSize = controls.size * unit;
  const controlsY = bottom + controls.y * unit;
  const shown = thumbnail(controlSize * 0.55);
  const thumb = shown === null ? null : button(controlSize, BRAND_COVER_COLORS[cover], shown);
  const modes = CAMERA.modes;
  const chosenWidth = (modes.chosenTo - modes.chosenFrom) * unit;
  const chosenHeight = controlSize - 2 * modes.inset * unit;

  return {
    hole: { x: 0, y: top, width, height: bottom - top },
    box: placed(width, height, [
      { box: fillBox(width, top, 0, colors.band, flat), x: 0, y: 0 },
      { box: fillBox(width, height - bottom, 0, colors.band, flat), x: 0, y: bottom },
      ...[1, 2].flatMap((i) => [
        {
          box: hairlineBox(0, bottom - top, CAMERA.grid, colors.grid),
          x: (width * i) / 3,
          y: top,
        },
        { box: hairlineBox(width, 0, CAMERA.grid, colors.grid), x: 0, y: top + third * i },
      ]),
      centeredAt(pill, width - data.inset * unit - pill.width / 2, top / 2),
      centeredAt(
        button(lensSize, colors.button, lensMark(lensSize * lens.icon, colors.ink)),
        lens.x * unit,
        lensY,
      ),
      centeredAt(
        camText('widgets.cameraZoom.wide', zoom.size, colors.ink),
        width / 2 - zoom.side * unit,
        lensY,
      ),
      centeredAt(
        button(
          lensSize,
          colors.button,
          camText('widgets.cameraZoom.main', zoom.size, colors.chosen),
        ),
        width / 2,
        lensY,
      ),
      centeredAt(
        camText('widgets.cameraZoom.tele', zoom.size, colors.ink),
        width / 2 + zoom.side * unit,
        lensY,
      ),
      centeredAt(
        button(
          2 * shutter.outer * unit,
          colors.ring,
          discBox(shutter.inner * unit, colors.shutter),
          colors.edge,
        ),
        width / 2,
        shutterY,
      ),
      ...(thumb === null ? [] : [centeredAt(thumb, controls.x * unit, controlsY)]),
      centeredAt(
        fillBox(modes.width * unit, controlSize, controlSize / 2, colors.pill, glass),
        width / 2,
        controlsY,
      ),
      {
        box: fillBox(chosenWidth, chosenHeight, chosenHeight / 2, colors.chosenPill, glass),
        x: width / 2 + modes.chosenFrom * unit,
        y: controlsY - chosenHeight / 2,
      },
      centeredAt(
        camText('widgets.cameraModes.video', modes.size, colors.ink),
        width / 2 + modes.videoX * unit,
        controlsY,
      ),
      centeredAt(
        camText('widgets.cameraModes.photo', modes.size, colors.chosen),
        width / 2 + ((modes.chosenFrom + modes.chosenTo) / 2) * unit,
        controlsY,
      ),
      centeredAt(
        button(
          controlSize,
          colors.pill,
          symbolBox('flip', controlSize * controls.symbol, colors.ink),
          colors.edge,
        ),
        width - controls.x * unit,
        controlsY,
      ),
    ]),
  };
}

/**
 * Where the lock screen's player puts each thing, measured on an iPhone and scaled to a card
 * 840 px wide: the cover in the top-left corner with the song's name and artist beside it, the
 * sound wave in the top-right one, the times on the progress bar's line, at its ends, and the
 * controls centered under it, AirPlay at the right.
 */
export const MUSIC = {
  width: 840,
  height: 373,
  radius: 46,
  cover: { x: 32, y: 32, size: 128, radius: 10, route: 3 },
  text: { x: 184, size: 40 },
  wave: { x: 740, y: 58, size: 46 },
  bar: { y: 194, height: 16, left: 119, right: 704, gap: 20 },
  time: { inset: 45, size: 28 },
  controls: { y: 296, pause: 71, skip: 79, skipOffset: 172, airplayX: 735, airplay: 50 },
} as const;
/** How much of the song has played, as the bar shows it. */
export const MUSIC_PLAYED = 0.3;

/**
 * The iPhone's camera (iOS 26): the dimmed bands over the photo, the grid, its texts and the
 * yellow of what is chosen, its see-through buttons and pills and their edges, the shutter's
 * ring and button, and the last photo's thumbnail (the route, as the music's cover).
 */
const CAMERA_COLORS = {
  band: '#0000008C',
  grid: '#FFFFFF73',
  ink: '#FFFFFF',
  chosen: '#FFD60A',
  pill: '#1C1C1EA6',
  button: '#3A3A3CA6',
  chosenPill: '#48484AA6',
  edge: '#FFFFFF33',
  ring: '#2C2C2ECC',
  shutter: '#FFFFFF',
} as const;

/**
 * Where the camera puts each thing on a story, measured on an iPhone and scaled to 1080 px wide
 * (the bands a little lower: a story is shorter than the phone's screen): the data's pill at the
 * top right, where the camera's settings go; the f button (with the sport's icon) and the zoom
 * at the bottom of the photo; the shutter, and under it the thumbnail, the modes' pill and the
 * flip button. Shorter formats shrink all of it alike.
 */
const CAMERA = {
  storyHeight: 1920,
  top: 170,
  bottom: 440,
  grid: 2,
  data: { height: 94, inset: 47, size: 36, gap: 40, pad: 40 },
  lens: { size: 101, x: 121, fromBottom: 95, icon: 0.5 },
  zoom: { size: 35, side: 105 },
  shutter: { y: 150, outer: 105, inner: 89, edge: 3 },
  controls: { y: 335, size: 123, x: 154, symbol: 0.58 },
  modes: { width: 438, size: 34, chosenFrom: -12, chosenTo: 211, inset: 6, videoX: -113 },
} as const;

/**
 * An alarm of the iPhone's Clock (iOS 26) in dark and light mode: its card, its time and label,
 * and its switch, on.
 */
export const ALARM_COLORS = {
  dark: { card: '#000000', ink: '#FFFFFF', on: '#30D158', knob: '#FFFFFF' },
  light: { card: '#FFFFFF', ink: '#000000', on: '#34C759', knob: '#FFFFFF' },
} as const;
/** Sizes of an alarm: the time, its AM or PM, the label, the room inside and the switch. */
export const ALARM = {
  time: 150,
  meridiem: 64,
  label: 32,
  padX: 46,
  padY: 26,
  radius: 44,
  gap: 80,
  minWidth: 700,
  toggle: { width: 126, height: 77, inset: 6 },
} as const;

/**
 * A location sticker in light and dark mode, as Instagram's: the place and a datum after a pin,
 * in a typewriter's letters, as AURA writes it.
 */
export const LOCATION_COLORS = {
  light: { card: '#FFFFFF', ink: '#000000' },
  dark: { card: '#1C1C1E', ink: '#FFFFFF' },
} as const;
export const LOCATION = { text: 40, pin: 1.15, gap: 14, padX: 30, padY: 18, radius: 24 } as const;

/**
 * AURA's board of splits: the names of its columns, then a row per split, its number at the top
 * left of a dark see-through band and a grey bar from the right as long as the split took (between
 * `shortest` and `longest` of the width), its time at the bar's end; the distance and the time
 * under it.
 */
export const SPLIT_BARS = {
  width: 760,
  header: 20,
  number: 20,
  value: 44,
  total: 64,
  rowHeight: 66,
  rowGap: 4,
  pad: 14,
  headerGap: 12,
  totalGap: 22,
  shortest: 0.3,
  longest: 0.85,
  colors: { band: '#0000008C', bar: '#8E8E93', ink: '#FFFFFF' },
} as const;
/** Most splits the board lists one by one; more are grouped, as in the note. */
export const SPLIT_BARS_ROWS = 20;

/**
 * A ladder of splits: white tags in a typewriter's letters under their title, each wider the
 * faster it went (up to `stretch` times the narrowest; a pace by its pace), the fastest in a brand
 * color.
 */
export const SPLIT_LADDER = {
  title: 40,
  text: 34,
  rowHeight: 58,
  rowGap: 10,
  padX: 16,
  gap: 34,
  stretch: 2,
  radius: 5,
  titleGap: 14,
  colors: { tag: '#FFFFFF', ink: '#000000', title: '#FFFFFF', chosen: '#FFFFFF' },
} as const;
export const SPLIT_LADDER_ROWS = 20;

/** Instagram's verified badge after a datum, in its blue, its check white; the text's color. */
export const VERIFIED = {
  text: 66,
  badge: 1.0,
  gap: 0.22,
  scallops: 8,
  blue: '#3897F0',
  check: '#FFFFFF',
} as const;
export const VERIFIED_COLORS = { dark: '#FFFFFF', light: '#000000' } as const;

/** Sizes of a chat message with a phrase: the phrase, wrapped when long, and the line under it. */
export const CHAT = { text: 50, meta: 26, wrap: 680, metaGap: 40 } as const;

/**
 * A sentence on a sheet of paper, as AURA's: the paper and its grain, the serif text and the
 * yellow of the marker over the data, a little wider than the words.
 */
const SENTENCE = {
  text: 58,
  wrap: 800,
  padX: 48,
  padY: 40,
  colors: { paper: '#EEEBE5', grain: '#00000024', ink: '#151515', marker: '#F5C542' },
  /**
   * Its band reaches this far above and below the baseline, and out of the words' ends: into the
   * space around them, or only a little next to a stop.
   */
  marker: { padX: 0.2, tight: 0.04, above: 0.95, below: 0.3 },
} as const;
/** A stretch of a highlighted sentence, and whether the marker goes over it. */
export interface SentencePart {
  readonly text: string;
  readonly marked: boolean;
}

/** A datum as a highlighted sentence writes it, in one piece: the marker never breaks a line. */
export const markedPart = (content: string): SentencePart => ({
  text: content.replace(/ /gu, '\u00A0'),
  marked: true,
});

/**
 * A highlighted sentence's parts: its `templates`, translated with the given placeholders (which
 * come back as markers, and as they are where nothing fills them), each placeholder filled with its
 * value in `values`, of an activity or a period alike.
 *
 * @throws Error if a template has a placeholder without a value.
 */
export function sentenceParts(
  templates: (holders: Readonly<Record<string, string>>) => readonly string[],
  values: Readonly<Record<string, SentencePart>>,
): SentencePart[] {
  const holders = Object.fromEntries(
    Object.keys(values).map((name) => [name, `\uE000${name}\uE001`]),
  );
  return templates(holders).flatMap((template) =>
    template
      .replace(/\uE000(\w+)\uE001/gu, '{{$1}}')
      .split(/\{\{(\w+)\}\}/u)
      .flatMap((part, i) => {
        if (i % 2 === 0) {
          return part === '' ? [] : [{ text: part, marked: false }];
        }
        const value = values[part];
        if (value === undefined) {
          throw new Error(`Nothing to write for {{${part}}} in a sentence`);
        }
        return [value];
      }),
  );
}

/**
 * A sentence typed on a sheet of paper, as AURA's, its `parts` that are `marked` highlighted.
 */
export function highlightedSentenceBox(
  fonts: SkTypefaceFontProvider,
  parts: readonly SentencePart[],
): Box {
  const sizes = SENTENCE;
  const { colors } = sizes;
  const laidOut = paragraph(
    parts.map((part) => ({ text: part.text, size: sizes.text, bold: false })),
    fonts,
    {
      font: 'spaceMono',
      color: colors.ink,
      bold: false,
      uppercase: false,
      italic: false,
    },
    { shadow: false, wrapWidth: sizes.wrap, wrapStart: true },
  );
  // Where each datum lies in the laid out text: a band per line it is on, from its first
  // letter to its last, as tall on every line whatever its letters (around the line's
  // baseline), as a marker draws it.
  const lines = laidOut.getLineMetrics();
  const { marker } = sizes;
  /** How far the band goes out of a datum's end: into a space, not over a stop. */
  const reach = (next: string | undefined) =>
    (next === undefined || /^\s/u.test(next) ? marker.padX : marker.tight) * sizes.text;
  let index = 0;
  const rects = parts.flatMap((part, i) => {
    const start = index;
    index += part.text.length;
    if (!part.marked) {
      return [];
    }
    const before = reach(parts[i - 1]?.text.slice(-1));
    const after = reach(parts[i + 1]?.text);
    const pieces = laidOut.getRectsForRange(start, index);
    return lines.flatMap((line) => {
      const on = pieces.filter(
        (rect) => rect.y <= line.baseline && line.baseline <= rect.y + rect.height,
      );
      if (on.length === 0) {
        return [];
      }
      const left = Math.min(...on.map((rect) => rect.x));
      const right = Math.max(...on.map((rect) => rect.x + rect.width));
      return [{ x: left - before, baseline: line.baseline, width: right - left + before + after }];
    });
  });
  const text = textBox(laidOut);
  const width = text.width + 2 * sizes.padX;
  const height = text.height + 2 * sizes.padY;
  return {
    width,
    height,
    place: (x, y) => {
      const left = x + sizes.padX;
      const top = y + sizes.padY;
      return [
        { kind: 'panel', x, y, width, height, radius: 0, color: colors.paper },
        { kind: 'grain', x, y, width, height, color: colors.grain },
        {
          kind: 'highlight',
          color: colors.marker,
          rects: rects.map((rect) => ({
            x: left + rect.x,
            y: top + rect.baseline - marker.above * sizes.text,
            width: rect.width,
            height: (marker.above + marker.below) * sizes.text,
          })),
        },
        ...text.place(left, top),
      ];
    },
  };
}

/**
 * How a marker's stroke strays from a rectangle, as AURA's: its ends straight, its top and bottom
 * edges leaning together from one end to the other (by up to `tilt` of its height) and slightly
 * wavy along the way (up to `wave` of its height, a wave every `step` heights), as a stroke drawn
 * by hand.
 */
export const MARKER_WOBBLE = { tilt: 0.07, wave: 0.025, step: 0.6 } as const;
/** Room the paper's grain leaves between its specks, in square pixels per speck. */
export const GRAIN_AREA = 260;
