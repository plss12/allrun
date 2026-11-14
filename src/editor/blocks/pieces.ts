import {
  FontWeight,
  Skia,
  type SkParagraph,
  type SkTypefaceFontProvider,
  TextAlign,
} from '@shopify/react-native-skia';

import type { SportIconId } from '@/core/activity-block';
import { castsShadow } from '@/core/layer-style';
import type { Activity } from '@/core/activity';
import type { LatLng } from '@/core/geo';
import { toPixels } from '@/core/map-tiles';
import { decodePolyline } from '@/core/polyline';
import { projectRoutes } from '@/core/route-projection';
import { type FontId, writesInCapitals } from '@/core/template';

import { markWidth, wordmarkHeight } from '../brand/brand-art';
import { drawsBold, fontFamiliesOf, lettersExtent } from '../fonts';
import {
  WIDGET_MAP_RADIUS,
  type WidgetMap,
  widgetMapPoints,
  widgetMapViewport,
} from '../widget-map';
import { APP_ICON_PATHS, SPORT_ICON_PATHS } from '../icons/sport-icons.generated';
import { addLeanRoom, leanRoom, LETTER_SPACING, slantOf, textShadows } from '../scene-text';
import { discardParagraph, finishParagraph } from '../paragraph-arena';
import type { BlockContext, BlockStyle } from '../activity-blocks';
import { type AppSymbol, type Box, column, type Piece, placed } from './layout';
import { SIZES } from './sizes';

/** A sport's icon, or one a replica of an app draws (a streak's flame). */
export type IconId = SportIconId | keyof typeof APP_ICON_PATHS;

/** Every icon's path, the sports' and the replicas'. */
export const ICON_PATHS: Readonly<Record<IconId, string>> = {
  ...SPORT_ICON_PATHS,
  ...APP_ICON_PATHS,
};

export const iconBox = (icon: IconId, size: number, color?: string): Box => ({
  width: size,
  height: size,
  place: (x, y) => [{ kind: 'icon', icon, x, y, size, ...(color === undefined ? {} : { color }) }],
});

/**
 * What a summary's widget shows of its sport: one sport's icon `size` big, or, for a summary of
 * every sport (`allrun`), AllRun's monogram, a little lower so it weighs about as much.
 */
export type SportMark = SportIconId | 'allrun';

/** AllRun's monogram's height, a share of a sport's icon's size: about as heavy. */
const SPORT_MARK_HEIGHT = 0.62;

/** A sport's icon, or AllRun's monogram (see `SportMark`), in `color`. */
export const sportMarkBox = (mark: SportMark, size: number, color: string): Box =>
  mark === 'allrun' ? markBrandBox(size * SPORT_MARK_HEIGHT, color) : iconBox(mark, size, color);

/** AllRun's monogram `height` tall, in a replica's own `color`. */
export const markBrandBox = (height: number, color: string): Box => ({
  width: markWidth(height),
  height,
  place: (x, y) => [{ kind: 'mark', x, y, height, color }],
});

/** AllRun's name `width` wide, in the block's color or a replica's own `color`. */
export const logoBox = (width: number, color?: string): Box => ({
  width,
  height: wordmarkHeight(width),
  place: (x, y) => [{ kind: 'logo', x, y, width, ...(color === undefined ? {} : { color }) }],
});

/** Width of a block's route, before the layer's scale, when nothing sets another. */
export const ROUTE_STROKE = 8;

/**
 * Width of the route of a widget around a big datum, as a share of the datum's width: 8 over the
 * 759 of a marathon's in Unbounded, the bold wide letter it starts in. A narrower letter (a
 * condensed or thin one) makes the widget and its route smaller, and the line with them: at a
 * fixed width it looked twice as heavy as the letters.
 */
const ROUTE_STROKE_SHARE = 8 / 759;

/** The route's line width for a widget whose big datum is `datumWidth` wide. */
export const routeStrokeFor = (datumWidth: number) => datumWidth * ROUTE_STROKE_SHARE;

/**
 * The route of `polyline` (its private ends trimmed) as big as fits a `width` × `height` box,
 * shrunk to its own extent plus the stroke, or `null` when nothing is left to draw. A replica
 * draws it in a `look` of its own: a color and a line width.
 */
export function routeBox(
  polyline: string,
  width: number,
  height: number,
  look?: { readonly color?: string; readonly width: number },
): Box | null {
  const stroke = look?.width ?? ROUTE_STROKE;
  const [points] = projectRoutes([decodePolyline(polyline)], width, height);
  if (points.length < 2) {
    return null;
  }
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const spanX = Math.max(...points.map((point) => point.x)) - minX;
  const spanY = Math.max(...points.map((point) => point.y)) - minY;
  return {
    width: spanX + stroke,
    height: spanY + stroke,
    place: (x, y) => [
      {
        kind: 'route',
        points: points.map((point) => ({
          x: x + stroke / 2 + point.x - minX,
          y: y + stroke / 2 + point.y - minY,
        })),
        ...look,
      },
    ],
  };
}

/**
 * The activity's route on its map (ADR 021), as {@link routesMapBox}; `null` without a route.
 */
export function mapBox(
  activity: Activity,
  side: number,
  map: WidgetMap,
  stroke: number,
): Box | null {
  const points = widgetMapPoints(activity);
  return points === null ? null : routesMapBox([points], side, map, stroke);
}

/**
 * Routes of one place on their map (ADR 021), a rounded square `side` wide: the map, in its own
 * colors and fitted to them with room around (see `widgetMapViewport`), and each route over it
 * where it really is, in the block's color and `stroke` wide, projected with the same viewport
 * so that they line up. Time O(n) for their n points.
 */
export function routesMapBox(
  routes: readonly (readonly LatLng[])[],
  side: number,
  map: WidgetMap,
  stroke: number,
): Box {
  const viewport = widgetMapViewport(routes.flat(), side);
  const projected = routes.map((route) => route.map((point) => toPixels(point, viewport)));
  return {
    width: side,
    height: side,
    place: (x, y) => [
      {
        kind: 'map',
        x,
        y,
        size: side,
        radius: side * WIDGET_MAP_RADIUS,
        viewport,
        tiles: map.tiles,
      },
      ...projected.map((route): Piece => ({
        kind: 'route',
        points: route.map((point) => ({ x: x + point.x, y: y + point.y })),
        width: stroke,
      })),
    ],
  };
}

/** A filled glyph of an app's control, `size` square. */
export const symbolBox = (symbol: AppSymbol, size: number, color: string): Box => ({
  width: size,
  height: size,
  place: (x, y) => [{ kind: 'symbol', symbol, x, y, size, color }],
});

/** A round button `r` in radius: filled, or a ring `stroke` wide. */
export const discBox = (r: number, color: string, stroke?: number): Box => ({
  width: 2 * r,
  height: 2 * r,
  place: (x, y) => [
    { kind: 'disc', cx: x + r, cy: y + r, r, color, ...(stroke === undefined ? {} : { stroke }) },
  ],
});

/** How a see-through replica draws a rectangle: flat, with an edge or without (see `Piece`). */
interface Glass {
  readonly edge?: string;
}

/**
 * A replica's rounded rectangle of `color`, with nothing in it; part of a see-through view when
 * it is of `glass`.
 */
export const fillBox = (
  width: number,
  height: number,
  radius: number,
  color: string,
  glass?: Glass,
): Box => ({
  width,
  height,
  place: (x, y) => [
    {
      kind: 'panel',
      x,
      y,
      width,
      height,
      radius,
      color,
      ...(glass === undefined ? {} : { flat: true, ...glass }),
    },
  ],
});

/** `box` with its center at (`cx`, `cy`) of a `placed` box. */
export const centeredAt = (box: Box, cx: number, cy: number) => ({
  box,
  x: cx - box.width / 2,
  y: cy - box.height / 2,
});

/** Width of a glass card's edge. */
export const GLASS_EDGE = 2;

/** A replica's thin line from (0, 0) to (`dx`, `dy`) of where it is placed. */
export const hairlineBox = (dx: number, dy: number, width: number, color: string): Box => ({
  width: dx,
  height: dy,
  place: (x, y) => [{ kind: 'hairline', x1: x, y1: y, x2: x + dx, y2: y + dy, width, color }],
});

/** A replica's dashed line `width` long, `dash` long dashes `gap` apart, `thick` thick. */
export function dashedBox(
  width: number,
  dash: number,
  gap: number,
  thick: number,
  color: string,
): Box {
  const count = Math.max(1, Math.floor((width + gap) / (dash + gap)));
  // Spread so that the line starts and ends with a whole dash.
  const step = count === 1 ? 0 : (width - dash) / (count - 1);
  return placed(
    width,
    thick,
    Array.from({ length: count }, (_, i) => ({
      box: hairlineBox(dash, 0, thick, color),
      x: i * step,
      y: thick / 2,
    })),
  );
}

/**
 * Pseudo-random numbers in [0, 1) from `seed`, the same for the same seed (a linear congruential
 * generator, Numerical Recipes' constants): a receipt's barcode and the paper's grain look alike
 * every time they are drawn.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

/** A number from a text, to seed a barcode: the same text, the same bars. Time O(n). */
export const seedOf = (text: string): number =>
  [...text].reduce(
    (hash, char) => Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16_777_619),
    2_166_136_261,
  );

/**
 * A barcode `width` × `height` of `color`: bars and gaps of one to four units, from `seed`, with
 * a bar at each end.
 */
export function barcodeBox(width: number, height: number, seed: number, color: string): Box {
  const random = seededRandom(seed);
  const unit = width / 120;
  const bars: { x: number; width: number }[] = [];
  let x = 0;
  while (x < width - 4 * unit) {
    const bar = (1 + Math.floor(random() * 4)) * unit;
    bars.push({ x, width: bar });
    x += bar + (1 + Math.floor(random() * 3)) * unit;
  }
  bars.push({ x: width - 2 * unit, width: 2 * unit });
  return placed(
    width,
    height,
    bars.map((bar) => ({ box: fillBox(bar.width, height, 0, color, {}), x: bar.x, y: 0 })),
  );
}

export const textBox = (paragraph: SkParagraph): Box => ({
  width: Math.ceil(paragraph.getLongestLine()) + 1,
  height: paragraph.getHeight(),
  place: (x, y) => [{ kind: 'text', paragraph, x, y }],
});

/**
 * A text of several lines, `fontSize` big, with room at the right for its letters to lean out of
 * any line when `italic`.
 */
const wrappedBox = (laidOut: SkParagraph, fontSize: number, italic: boolean | undefined): Box => {
  const box = textBox(laidOut);
  return italic === true ? { ...box, width: box.width + leanRoom(fontSize) } : box;
};

/** Runs on one line in the block's lettering, drawn taller in a stretched font. */
function styledTextBox(
  fonts: SkTypefaceFontProvider,
  runs: readonly Run[],
  style: BlockStyle,
): Box {
  const laidOut = paragraph(runs, fonts, style);
  const box = textBox(laidOut);
  const stretch = STRETCHED_FONTS[style.font] ?? 1;
  return stretch === 1
    ? box
    : {
        width: box.width,
        height: box.height * stretch,
        place: (x, y) => [{ kind: 'text', paragraph: laidOut, x, y, stretch }],
      };
}

/**
 * Words in quotation marks in the block's lettering, wrapped in even lines (at most
 * `SIZES.quotation.lines`, shrunk until they fit), and who said them or where, under them: a
 * quote's or a verse's, of an activity or a period alike; and the size they ended up at. Time O(s log w) layouts for the s sizes
 * tried, each balanced in O(log w).
 */
export function quotationBox(
  fonts: SkTypefaceFontProvider,
  style: BlockStyle,
  translate: BlockContext['translate'],
  words: string,
  source: string,
): Box & { readonly wordsSize: number } {
  const sizes = SIZES.quotation;
  const laidOut = (size: number) =>
    paragraph(
      [{ text: translate('widgets.quoted', { text: words }), size, bold: style.bold }],
      fonts,
      style,
      { wrapWidth: sizes.width },
    );
  let size: number = sizes.text;
  let fitted = laidOut(size);
  while (fitted.getLineMetrics().length > sizes.lines && size > sizes.minText) {
    size = Math.max(sizes.minText, size * 0.92);
    fitted = laidOut(size);
  }
  return {
    ...column(
      [
        wrappedBox(fitted, size, style.italic),
        styledTextBox(
          fonts,
          [{ text: source, size: sizes.source, bold: false, faded: true, spacing: LABEL_SPACING }],
          style,
        ),
      ],
      sizes.source * 0.6,
      'center',
    ),
    wordsSize: size,
  };
}

/** `box` on a replica's card of `color`, `padX` and `padY` inside its edges. */
export const panel = (box: Box, color: string, padX: number, padY: number, radius: number): Box => {
  const width = box.width + 2 * padX;
  const height = box.height + 2 * padY;
  return {
    width,
    height,
    place: (x, y) => [
      { kind: 'panel', x, y, width, height, radius, color },
      ...box.place(x + padX, y + padY),
    ],
  };
};

/** Room inside a sent message's bubble, its corners' radius and its tail's size. */
const MESSAGE_PAD_X = 30;
const MESSAGE_PAD_Y = 18;
export const MESSAGE_RADIUS = 30;
export const MESSAGE_TAIL = 18;

/** `box` in a sent message's bubble of `color`, its tail out of the top right corner. */
export const messageBubble = (box: Box, color: string): Box => {
  const bubble = panel(box, color, MESSAGE_PAD_X, MESSAGE_PAD_Y, MESSAGE_RADIUS);
  return {
    width: bubble.width + MESSAGE_TAIL,
    height: bubble.height,
    place: (x, y) => [
      { kind: 'messageTail', x: x + bubble.width, y, color },
      ...bubble.place(x, y),
    ],
  };
};

/** A mark drawn with lines, `size` tall (the ticks are wider). */
export const markBox = (kind: 'chevron' | 'ticks', size: number, color: string): Box => ({
  width: kind === 'ticks' ? size * 1.4 : size * 0.6,
  height: size,
  place: (x, y) => [{ kind, x, y, size, color }],
});

/** One stretch of a text with its own size and weight. */
export interface Run {
  readonly text: string;
  readonly size: number;
  readonly bold: boolean;
  /** Written in the font's light face (see `FontFaces`): a replica's thin text. */
  readonly light?: boolean;
  /** Written fainter: names of data and other secondary texts. */
  readonly faded?: boolean;
  /** Room after each letter, as a fraction of the size. */
  readonly spacing?: number;
}

/** How opaque faded texts and rules are. */
export const FADED_ALPHA = 0.72;
/** A layout width no text reaches: lines only break where the text does. */
const NO_WRAP_WIDTH = 1_000_000;

/** A replica's own font and slant, when not the apps' upright system-like one. */
export interface AppLettering {
  readonly font?: FontId;
  readonly italic?: boolean;
}

/** How a text is laid out besides its runs and style (see `paragraph`). */
export interface TextLook {
  /** With the drop shadow of its color (a text on a bubble needs none). */
  readonly shadow?: boolean;
  /** Longest a line is: longer ones are cut short with an ellipsis, as apps cut a long title. */
  readonly maxWidth?: number;
  /**
   * Broken into centered lines no longer than this, as even as they can be, instead of one line.
   */
  readonly wrapWidth?: number;
  /** Lines of a wrapped text aligned to their start instead (a chat message, a sentence). */
  readonly wrapStart?: boolean;
  /** To be drawn turned (see `turned`): its shadow falls down the canvas, not down its lines. */
  readonly turned?: boolean;
}

/**
 * A replica's text in `color`: in the system-like font of the apps unless its `font` is another
 * (a timing sheet's typewriter), upright unless `italic`, and without a shadow unless `look` asks
 * for one (see `TextLook`).
 */
export function appTextBox(
  fonts: SkTypefaceFontProvider,
  runs: readonly Run[],
  color: string,
  { font = 'inter', italic = false, ...look }: TextLook & AppLettering = {},
): Box {
  return textBox(
    paragraph(
      runs,
      fonts,
      { font, color, bold: false, uppercase: false, italic },
      {
        shadow: false,
        ...look,
      },
    ),
  );
}

/**
 * Lays out runs in the block's font and color, on one line unless it is to wrap, shrunk to fit
 * them (see `TextLook`).
 */
export function paragraph(
  runs: readonly Run[],
  fonts: SkTypefaceFontProvider,
  style: BlockStyle,
  {
    shadow = true,
    maxWidth = NO_WRAP_WIDTH,
    wrapWidth,
    wrapStart = false,
    turned = false,
  }: TextLook = {},
) {
  const tightening =
    (TIGHT_FONTS[style.font] ?? 0) + LETTER_SPACING[style.letterSpacing ?? 'normal'];
  // A backdrop already sets the texts apart: no shadow.
  const shadows = (
    shadow && (style.backdrop ?? 'none') === 'none' ? textShadows(style.color) : []
  ).map((cast) =>
    // Turned a quarter counterclockwise, the text's left is the canvas's down.
    turned && cast.offset !== undefined
      ? { ...cast, offset: { x: -cast.offset.y, y: cast.offset.x } }
      : cast,
  );
  /** Laid out cut short with an ellipsis (`cut`), or with each word on a line of its own. */
  const build = (cut: boolean, wordPerLine = false) => {
    const builder = Skia.ParagraphBuilder.Make(
      cut
        ? { textAlign: TextAlign.Left, maxLines: 1, ellipsis: '…' }
        : {
            textAlign: wrapWidth === undefined || wrapStart ? TextAlign.Left : TextAlign.Center,
          },
      fonts,
    );
    for (const run of runs) {
      const color = Skia.Color(style.color);
      if (run.faded === true) {
        color[3] *= FADED_ALPHA;
      }
      builder
        .pushStyle({
          color,
          fontFamilies: fontFamiliesOf(style.font),
          fontSize: run.size,
          fontStyle: {
            weight:
              run.light === true
                ? FontWeight.ExtraLight
                : drawsBold(style.font, run.bold)
                  ? FontWeight.Bold
                  : FontWeight.Normal,
            slant: slantOf(style.italic),
          },
          letterSpacing: run.size * ((run.spacing ?? 0) + tightening),
          shadows,
        })
        .addText(
          (writesInCapitals(style) ? run.text.toLocaleUpperCase() : run.text).replace(
            / /gu,
            wordPerLine ? '\n' : ' ',
          ),
        )
        .pop();
    }
    // A wrapped text leans out of each of its lines: `wrappedBox` makes room for all of them.
    if (style.italic === true && runs.length > 0 && wrapWidth === undefined) {
      addLeanRoom(builder, runs[runs.length - 1].size);
    }
    return finishParagraph(builder);
  };
  const built = build(false);
  if (wrapWidth !== undefined) {
    // The narrowest width that keeps as few lines as the widest allowed: even lines, no word left
    // alone on the last one. Never narrower than the widest word (words tied with no-break spaces
    // are one), which would break inside it. Halved down to a pixel, O(log w) layouts.
    const words = build(false, true);
    words.layout(NO_WRAP_WIDTH);
    const widestWord = Math.ceil(words.getLongestLine()) + 1;
    discardParagraph(words);
    built.layout(Math.max(wrapWidth, widestWord));
    const lines = built.getLineMetrics().length;
    let low = widestWord;
    let high = Math.max(widestWord, Math.ceil(built.getLongestLine()) + 1);
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      built.layout(middle);
      if (built.getLineMetrics().length > lines) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    built.layout(high);
    built.layout(Math.ceil(built.getLongestLine()) + 1);
    return built;
  }
  built.layout(NO_WRAP_WIDTH);
  if (built.getLongestLine() > maxWidth) {
    discardParagraph(built);
    const cut = build(true);
    cut.layout(maxWidth);
    cut.layout(Math.ceil(cut.getLongestLine()) + 1);
    return cut;
  }
  built.layout(Math.ceil(built.getLongestLine()) + 1);
  return built;
}

/**
 * `runs` at `size` cut to their letters: from the top of their capitals, or of their small
 * letters when they have any, to `below` under the baseline (room for a comma's tail, or for
 * what goes under them), and as far again as their small letters go down (see
 * `lettersExtent`), so what goes over or under them sits as close as it looks. Over an accented
 * capital ("MIÉRCOLES"), the line keeps its own room above. Drawn `taller` times taller than
 * the font (squashed when less than one), in the block's lettering or in another `lettering`,
 * laid out with `look`. Texts side by side on one baseline are cut as one, all their letters
 * in `shared`.
 */
export function capitalsBox(
  fonts: SkTypefaceFontProvider,
  runs: readonly Run[],
  size: number,
  below: number,
  taller: number,
  lettering: BlockStyle,
  look: TextLook = {},
  shared?: string,
): Box {
  const stretch = (STRETCHED_FONTS[lettering.font] ?? 1) * taller;
  // A stretched text's own shadow would stretch with it, down past its room: it casts the
  // shadow of shapes once stretched instead, as long as it would have one.
  const shadow =
    stretch !== 1 &&
    (look.shadow ?? true) &&
    (lettering.backdrop ?? 'none') === 'none' &&
    castsShadow(lettering.color);
  const laidOut = paragraph(
    runs,
    fonts,
    lettering,
    stretch === 1 ? look : { ...look, shadow: false },
  );
  const baseline = laidOut.getLineMetrics()[0]?.baseline ?? laidOut.getHeight();
  const written = shared ?? runs.map((run) => run.text).join('');
  const extent = lettersExtent(
    writesInCapitals(lettering) ? written.toLocaleUpperCase() : written,
    lettering.font,
  );
  const top = extent.top === null ? 0 : baseline - extent.top * size;
  // What the letters draw under the baseline stretches with them: their descenders, and the
  // dip of round letters ("C", "O"), which only shows once stretched. The room asked for under
  // them stays as it is.
  const under = (extent.descent * stretch + ROUND_DIP * (stretch - 1)) * size;
  return {
    width: textBox(laidOut).width,
    height: (baseline - top) * stretch + under + below,
    place: (x, y) => [
      {
        kind: 'text',
        paragraph: laidOut,
        x,
        y: y - top * stretch,
        ...(stretch === 1 ? {} : { stretch }),
        ...(shadow ? { shadow } : {}),
      },
    ],
  };
}

/**
 * Fonts set tighter in mixed widgets, as a share of their size taken from the room after each
 * letter, and drawn taller than they are, as AURA's "WED": Bowlby One SC is heavy but low and
 * wide, so its letters go close together, almost touching, and stand taller.
 */
const TIGHT_FONTS: Partial<Record<FontId, number>> = { bowlbyOneSC: -0.06 };
export const STRETCHED_FONTS: Partial<Record<FontId, number>> = { bowlbyOneSC: 1.35 };

/** How far round letters ("C", "O") dip under the baseline, at most, as a share of their size. */
const ROUND_DIP = 0.02;

/** Room after each letter of a secondary text (a quotation's source). */
const LABEL_SPACING = 0.1;
