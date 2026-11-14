/**
 * Base sizes of each design's texts, in canvas pixels before the layer's scale, chosen for a
 * story (other formats scale the whole block, see `newLayer`).
 */
export const SIZES = {
  /**
   * A big datum (`value`) and the data under it (`data`), in each look: as tall as AURA's, their
   * capitals about a fifth or a quarter of the big one's.
   */
  big: {
    wide: { value: 120, data: 38, stretch: 1 },
    day: { value: 120, data: 38, stretch: 1 },
    route: { value: 120, data: 38, stretch: 1 },
    map: { value: 120, data: 38, stretch: 1 },
    // Drawn this many times taller than the font, as AURA stretches its big "11.3 KM".
    stretched: { value: 180, data: 56, stretch: 1.9 },
    stretchedDay: { value: 180, data: 56, stretch: 1.9 },
    smallDay: { value: 120, data: 38, stretch: 1 },
  },
  /** The weekday and the big datum, as wide, and the room around the route between them. */
  dayRoute: { value: 120, gap: 0.3 },
  /** The data beside the short weekday, and the room between their lines and beside it. */
  dayBetween: { data: 44, rowGap: 0.45, sideGap: 0.7 },
  /** The weekday over its columns, and their lines, in each look. */
  dayOver: { wide: { weekday: 130, data: 30 }, narrow: { weekday: 210, data: 44 } },
  /** The lines of the date and the data, and the room between their columns. */
  dayColumns: { text: 44, gap: 3 },
  /** The stacked data, and the weekday and time under them, a share of their size. */
  dataStack: { value: 110, footer: 0.3 },
  /**
   * A tower's lines: their size, how many times taller than the font they are drawn, the room
   * under each (a share of their capitals' height), how much wider than the lines over it its
   * sport's word may be (`spread`) and how narrow it may be squeezed to stay within that. The data
   * on their side: the room between them and beside the word (shares of their capitals' height),
   * and the biggest they get (a share of the lines' size).
   */
  tower: {
    value: 150,
    stretch: 1.9,
    gap: 0.15,
    spread: 1.45,
    squeeze: 0.6,
    sideGap: 0.5,
    sideMax: 0.3,
  },
  /**
   * The data in a line, and the room between them, a share of their size; named, the names'
   * size and the room under them, and the room between data, shares of the data's size too.
   */
  dataLine: { text: 60, gap: 0.7, name: 0.5, nameGap: 0.2, namedGap: 1 },
  /**
   * A card's names of data, their values and its title, the room between a name and its value,
   * between rows and under the title (shares of their sizes), between columns and inside it.
   */
  card: {
    label: 26,
    value: 40,
    title: 64,
    labelGap: 0.35,
    rowGap: 0.6,
    titleGap: 0.5,
    columnGap: 70,
    padX: 44,
    padY: 38,
  },
  /**
   * A quotation's words: at most `lines` lines no wider than `width`, as big as `text` when they
   * fit, smaller (down to `minText`) when they don't, so a long verse is wide rather than tall.
   */
  quotation: { text: 64, minText: 34, width: 900, lines: 3, source: 36 },
  notes: { bar: 34, icon: 40, title: 74, row: 40 },
} as const;

/**
 * Room around a data widget on a backdrop, as a share of its height (at least `minPad`), wider
 * at its sides, and the box's corners, as a share of that room: as a text widget's.
 */
export const BLOCK_BACKDROP = { padding: 0.16, minPad: 6, wider: 1.6, radius: 1.4 } as const;

/**
 * Room under a big datum's baseline and its data's, for a comma's tail (a share of their size),
 * and least room between two data, a share of theirs: they spread to the big one's width.
 */
export const BIG = { below: 0.12, minGap: 0.8 } as const;

/**
 * Over a big datum: the weekday, as wide as it, its room under it a share of the big datum's
 * size; or the route, in a box `routeWidth` and `routeHeight` times the big datum's width, so it
 * doesn't outweigh the data, its room under it a share of the big datum's size too.
 */
export const BIG_HEADER = {
  dayGap: 0.08,
  smallDay: 0.34,
  smallDayGap: 0.12,
  routeWidth: 0.8,
  routeHeight: 0.9,
  routeGap: 0.3,
} as const;

/**
 * The date widgets' room: between a header and what goes under it, between lines, between
 * stacked data and least between columns, each a share of its text's size.
 */
export const DATE = { headGap: 0.1, lineGap: 0.3, stackGap: 0.12, minGap: 1.2 } as const;

/** Data a card puts in a row. */
export const CARD_COLUMNS = 3;

/** The size a text is laid out at to measure it before writing it as wide as something. */
export const FIT_SIZE = 100;

/** Width of the AllRun name signing a block, and its room above. */
export const LOGO_WIDTH = 190;
export const LOGO_GAP = 40;
