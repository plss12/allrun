import type { SkTypefaceFontProvider } from '@shopify/react-native-skia';

import type { SportIconId, TyreCompound } from '@/core/activity-block';
import type { BRAND_COVERS, LAPS_LAYOUTS } from '@/core/template';

import {
  type Box,
  column,
  columnWidths,
  overlay,
  placed,
  row,
  tableRow,
  tableWidth,
  widened,
} from './layout';
import {
  appTextBox,
  centeredAt,
  discBox,
  fillBox,
  hairlineBox,
  iconBox,
  type SportMark,
  sportMarkBox,
  symbolBox,
} from './pieces';
import { BRAND_COVER_COLORS } from './replicas';

/**
 * Most laps a timing table lists one by one (an interval session's reps and recoveries fit) and
 * most splits a timing tower lists, a grid's 20; more are grouped, as in the note.
 */
export const LAPS_ROWS = 24;
/** A board's sport icon, a share of its column names' size. */
const LAPS_ICON = 1.3;
export const GRAND_PRIX_ROWS = 20;

/** A table of laps as `lapsTableBox` draws it: its rows' texts and how to write them. */
export interface LapsTable {
  /** The columns' names: the lap, its distance, its time and its pace, speed or count. */
  readonly names: readonly [string, string, string, string];
  readonly rows: readonly {
    readonly number: string;
    readonly distance: string;
    /** The distance's unit when not the table's (a gym day's calories). */
    readonly unit?: string;
    readonly time: string;
    readonly value: string;
  }[];
  /** The row in the brand color, -1 for none. */
  readonly fastest: number;
  /** The distance's unit, after each distance. */
  readonly unit: string;
  /** What follows a value on the board ("/km"). */
  readonly after: string;
  /** A value as the timing sheet writes it (a pace with its marks). */
  readonly sheetValue: (value: string) => string;
  /** The sheet's title. */
  readonly title: string;
  /**
   * The sport the laps are all of, its icon (or AllRun's monogram for every sport) before the
   * board's first column name; a summary's laps (the sheet says it in its title).
   */
  readonly icon?: SportMark;
}

/**
 * Laps as a table, of an activity or a period alike (see `LAPS`): a board of them (`board`), its
 * numbers in a dot matrix on a see-through panel, or a karting's timing sheet (`sheet`) under its
 * title; the fastest row in AllRun's `cover` color.
 */
export function lapsTableBox(
  fonts: SkTypefaceFontProvider,
  layout: (typeof LAPS_LAYOUTS)[number],
  coverColor: (typeof BRAND_COVERS)[number],
  table: LapsTable,
): Box {
  const { fastest } = table;
  const cover = BRAND_COVER_COLORS[coverColor];
  if (layout === 'board') {
    // A board's dot matrix for its numbers.
    const board = LAPS.board;
    const { colors } = board;
    const value = (amount: string, unitText: string) =>
      appTextBox(
        fonts,
        [
          { text: amount, size: board.value, bold: false },
          { text: unitText, size: board.value * board.unit, bold: false },
        ],
        colors.ink,
        { font: 'doto' },
      );
    const names = table.names.map((name, i) => {
      const written = appTextBox(
        fonts,
        [{ text: name.toLocaleUpperCase(), size: board.header, bold: true }],
        colors.ink,
        {
          shadow: true,
        },
      );
      return i === 0 && table.icon !== undefined
        ? row(
            [sportMarkBox(table.icon, board.header * LAPS_ICON, colors.ink), written],
            board.header * 0.35,
            'center',
          )
        : written;
    });
    const cells = table.rows.map((written) => [
      appTextBox(fonts, [{ text: written.number, size: board.number, bold: false }], colors.faded, {
        font: 'doto',
      }),
      value(written.distance, written.unit ?? table.unit),
      value(written.time, ''),
      value(written.value, table.after),
    ]);
    const widths = columnWidths([names, ...cells]);
    const width = tableWidth(widths, board.gap, board.padX);
    const body = placed(
      width,
      board.rowHeight * table.rows.length,
      cells.flatMap((boxes, i) => [
        ...(i === fastest || i % 2 === 1
          ? [
              {
                box: fillBox(width, board.rowHeight, 0, i === fastest ? cover : colors.stripe, {}),
                x: 0,
                y: board.rowHeight * i,
              },
            ]
          : []),
        {
          box: tableRow(boxes, widths, board.gap, board.padX, board.rowHeight),
          x: 0,
          y: board.rowHeight * i,
        },
      ]),
    );
    return column(
      [
        tableRow(names, widths, board.gap, board.padX, board.header * 1.4),
        overlay(fillBox(width, body.height, 0, colors.panel, {}), body),
      ],
      board.headerGap,
      'start',
    );
  }
  const sheet = LAPS.sheet;
  const { colors } = sheet;
  const cells = table.rows.map((written, i) => {
    const ink = i === fastest ? colors.chosen : colors.ink;
    const mono = (text: string) =>
      appTextBox(fonts, [{ text, size: sheet.text, bold: false }], ink, { font: 'spaceMono' });
    return [
      mono(written.number),
      mono(`${written.distance}${written.unit ?? table.unit}`),
      mono(written.time),
      mono(table.sheetValue(written.value)),
    ];
  });
  const widths = columnWidths(cells);
  const width = tableWidth(widths, sheet.gap, sheet.padX);
  const paper = placed(
    width,
    sheet.rowHeight * table.rows.length,
    cells.flatMap((boxes, i) => [
      ...(i === fastest
        ? [
            {
              box: fillBox(width, sheet.rowHeight, 0, cover, {}),
              x: 0,
              y: sheet.rowHeight * i,
            },
          ]
        : []),
      ...(i === 0
        ? []
        : [
            {
              box: hairlineBox(width, 0, sheet.rule, colors.rule),
              x: 0,
              y: sheet.rowHeight * i,
            },
          ]),
      {
        box: tableRow(boxes, widths, sheet.gap, sheet.padX, sheet.rowHeight),
        x: 0,
        y: sheet.rowHeight * i,
      },
    ]),
  );
  const title = appTextBox(
    fonts,
    [{ text: table.title, size: sheet.title, bold: false }],
    colors.title,
    { shadow: true },
  );
  return column(
    [title, overlay(fillBox(width, paper.height, 0, colors.paper), paper)],
    sheet.titleGap,
    'start',
  );
}

/**
 * A board of laps (`board`), as AURA's: the names of the columns over a grey see-through panel,
 * every other row lighter; and a karting's timing sheet (`sheet`): white paper, lines between
 * rows, a typewriter's letters and the title over it. The fastest row is in a brand color.
 */
const LAPS = {
  board: {
    header: 22,
    number: 24,
    value: 40,
    unit: 0.45,
    rowHeight: 70,
    padX: 26,
    gap: 44,
    headerGap: 14,
    colors: {
      panel: '#636366B3',
      stripe: '#FFFFFF14',
      ink: '#FFFFFF',
      faded: '#FFFFFFB3',
    },
  },
  sheet: {
    title: 36,
    text: 30,
    rowHeight: 52,
    padX: 18,
    gap: 30,
    titleGap: 12,
    rule: 2,
    colors: {
      paper: '#FFFFFF',
      ink: '#1C1C1E',
      rule: '#0000002E',
      title: '#FFFFFF',
      chosen: '#FFFFFF',
    },
  },
} as const;

/**
 * A race's timing tower on TV: its dark panel, the sport and how far into the race it is on top,
 * then a row per split: its number, pace, gap to the fastest and tyre compound, or the purple
 * stopwatch of the fastest lap.
 */
const GRAND_PRIX = {
  title: 50,
  icon: 54,
  lap: 30,
  row: 36,
  rowHeight: 58,
  padX: 24,
  padY: 22,
  gap: 26,
  radius: 18,
  rule: 2,
  /** Height of the shadow the header casts on the rows. */
  shadow: 22,
  colors: {
    panel: '#15151EF0',
    header: ['#3D3D4C', '#262633'],
    shadow: ['#00000099', '#00000000'],
    ink: '#FFFFFF',
    faded: '#FFFFFFA6',
    rule: '#FFFFFF1F',
    fastest: '#A13BD4',
  },
  tyres: { soft: '#FF3B30', medium: '#FFD60A', hard: '#F2F2F2' },
} as const;
/** How a tyre compound is written on the tower, as TV writes it in any language. */
const TYRE_LETTERS: Readonly<Record<TyreCompound, string>> = { soft: 'S', medium: 'M', hard: 'H' };

/** A race's timing tower as `timingTowerBox` draws it. */
export interface TimingTower {
  /** The race's sport, its icon (or AllRun's monogram for every sport) before the title, if any. */
  readonly icon?: SportMark;
  readonly title: string;
  /** Under the title, where TV writes the lap. */
  readonly subtitle: string;
  readonly rows: readonly {
    readonly number: string;
    /** The row's own sport, its icon before its value (a period's activities). */
    readonly icon?: SportIconId;
    readonly value: string;
    /** Its gap to the leader, or the leader's word. */
    readonly gap: string;
    /** Its tyre, or the leader's purple stopwatch. */
    readonly mark: TyreCompound | 'fastest';
  }[];
}

/**
 * A race's timing tower, as TV shows one (see `GRAND_PRIX`), of an activity's splits or a
 * period's activities alike: the header lit from above over the rows, each its number and value
 * at the left, its gap and its tyre (the leader's stopwatch) at the right, in a condensed italic.
 */
export function timingTowerBox(fonts: SkTypefaceFontProvider, tower: TimingTower): Box {
  const sizes = GRAND_PRIX;
  const { colors } = sizes;
  const race = (content: string, size: number, color: string, bold = true) =>
    appTextBox(fonts, [{ text: content, size, bold }], color, {
      font: 'barlowCondensed',
      italic: true,
    });
  const cells = tower.rows.map((line) => {
    const value = race(line.value, sizes.row, colors.ink);
    return [
      race(line.number, sizes.row, colors.ink, false),
      line.icon === undefined
        ? value
        : row([iconBox(line.icon, sizes.row, colors.ink), value], sizes.gap * 0.35, 'center'),
      race(line.gap, sizes.row, colors.faded, false),
      line.mark === 'fastest'
        ? overlay(
            discBox(sizes.row * 0.5, colors.fastest),
            symbolBox('stopwatch', sizes.row * 0.82, colors.ink),
          )
        : race(TYRE_LETTERS[line.mark], sizes.row, sizes.tyres[line.mark]),
    ];
  });
  const title = race(tower.title.toLocaleUpperCase(), sizes.title, colors.ink);
  const header = column(
    [
      tower.icon === undefined
        ? title
        : row([sportMarkBox(tower.icon, sizes.icon, colors.ink), title], sizes.gap * 0.5, 'center'),
      race(tower.subtitle.toLocaleUpperCase(), sizes.lap, colors.faded, false),
    ],
    0,
    'center',
  );
  const widths = columnWidths(cells);
  const inner = Math.max(header.width, tableWidth(widths, sizes.gap, 0));
  // The number and the pace at the left, the gap and the tyre at the right end, as on TV.
  const lines = cells.map((boxes) =>
    placed(inner, sizes.rowHeight, [
      { box: boxes[0], x: 0, y: (sizes.rowHeight - boxes[0].height) / 2 },
      {
        box: boxes[1],
        x: widths[0] + sizes.gap,
        y: (sizes.rowHeight - boxes[1].height) / 2,
      },
      {
        box: boxes[2],
        x: inner - widths[3] - sizes.gap - boxes[2].width,
        y: (sizes.rowHeight - boxes[2].height) / 2,
      },
      centeredAt(boxes[3], inner - widths[3] / 2, sizes.rowHeight / 2),
    ]),
  );
  const rows = placed(
    inner,
    sizes.rowHeight * lines.length,
    lines.flatMap((line, i) => [
      ...(i === 0
        ? []
        : [
            {
              box: hairlineBox(inner, 0, sizes.rule, colors.rule),
              x: 0,
              y: sizes.rowHeight * i,
            },
          ]),
      { box: line, x: 0, y: sizes.rowHeight * i },
    ]),
  );
  // The header lit from above, apart from the rows by the shadow it casts on them.
  const width = inner + 2 * sizes.padX;
  const headerHeight = sizes.padY + header.height + sizes.padY * 0.6;
  const height = headerHeight + rows.height + sizes.padY;
  // `y` down the card: the card's top is that far above where the shade is placed.
  const shade = (y: number, tall: number, shades: readonly [string, string]): Box => ({
    width,
    height: tall,
    place: (x, top) => [
      {
        kind: 'shade',
        x,
        y: top,
        width,
        height: tall,
        colors: shades,
        card: { x, y: top - y, width, height, radius: sizes.radius },
      },
    ],
  });
  return placed(width, height, [
    { box: fillBox(width, height, sizes.radius, colors.panel), x: 0, y: 0 },
    { box: shade(0, headerHeight, colors.header), x: 0, y: 0 },
    { box: shade(headerHeight, sizes.shadow, colors.shadow), x: 0, y: headerHeight },
    { box: widened(header, inner, 'center'), x: sizes.padX, y: sizes.padY },
    { box: rows, x: sizes.padX, y: headerHeight },
  ]);
}
