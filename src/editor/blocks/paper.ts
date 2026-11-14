import type { SkTypefaceFontProvider } from '@shopify/react-native-skia';

import type { EquivalenceId } from '@/core/equivalences';
import type { APP_MODES, BRAND_COVERS, NUTRITION_LABELS } from '@/core/template';

import type { EquivalenceLine, NutritionLabel, NutritionRow } from '../editor-data';
import type { BlockContext } from '../activity-blocks';
import {
  type Align,
  type Box,
  column,
  justified,
  overlay,
  placed,
  row,
  spread,
  widened,
} from './layout';
import {
  appTextBox,
  barcodeBox,
  centeredAt,
  dashedBox,
  discBox,
  fillBox,
  iconBox,
  type IconId,
  panel,
  type Run,
  seedOf,
  type SportMark,
  sportMarkBox,
} from './pieces';
import { BRAND_COVER_COLORS } from './replicas';

/**
 * A shop's receipt on thermal paper, in a typewriter's letters: the shop (AllRun), the activity
 * and its day, a line per datum, the total (the main datum), thanks and a barcode, between dashed
 * lines; its top and bottom torn in teeth.
 */
export const RECEIPT = {
  width: 620,
  shop: 50,
  text: 28,
  total: 36,
  padX: 40,
  padY: 46,
  tooth: 14,
  gap: 22,
  dash: { length: 10, gap: 8, thick: 2 },
  barcode: 86,
  colors: { paper: '#FBFAF6', ink: '#1C1C1E' },
} as const;

/** A shop's receipt as `receiptBox` prints it. */
export interface Receipt {
  /** Under the shop's name (AllRun): what was bought and when. */
  readonly header: readonly string[];
  /** A line each, its name at the start and its value at the end. */
  readonly items: readonly { readonly name: string; readonly value: string }[];
  /** Under the items, between dashes: the last one is the total, in bold and bigger. */
  readonly totals: readonly { readonly name: string; readonly value: string }[];
  readonly thanks: string;
  /** What its barcode is drawn from, so the same receipt always has the same one. */
  readonly seed: string;
}

/**
 * A shop's receipt on thermal paper, of an activity or a period alike (see `RECEIPT`): the shop
 * and its header, a line per item, the totals, thanks and a barcode, between dashed lines; its
 * top and bottom torn in teeth. An item's name is cut short before its value.
 */
export function receiptBox(fonts: SkTypefaceFontProvider, receipt: Receipt): Box {
  const sizes = RECEIPT;
  const { colors } = sizes;
  const inner = sizes.width - 2 * sizes.padX;
  const mono = (content: string, size: number, bold = false, maxWidth = inner) =>
    appTextBox(fonts, [{ text: content, size, bold }], colors.ink, {
      font: 'spaceMono',
      maxWidth,
    });
  const dashes = () =>
    dashedBox(inner, sizes.dash.length, sizes.dash.gap, sizes.dash.thick, colors.ink);
  const item = (name: string, value: string, size: number, bold: boolean) => {
    const right = mono(value, size, bold);
    return spread(
      mono(name.toLocaleUpperCase(), size, bold, inner - right.width - size),
      right,
      inner,
    );
  };
  const last = receipt.totals.length - 1;
  const content = column(
    [
      column(
        [mono('AllRun', sizes.shop, true), ...receipt.header.map((line) => mono(line, sizes.text))],
        sizes.gap * 0.3,
        'center',
      ),
      dashes(),
      column(
        receipt.items.map((line) => item(line.name, line.value, sizes.text, false)),
        sizes.gap * 0.5,
        'start',
      ),
      dashes(),
      column(
        receipt.totals.map((line, i) =>
          i === last
            ? item(line.name, line.value, sizes.total, true)
            : item(line.name, line.value, sizes.text, false),
        ),
        sizes.gap * 0.5,
        'start',
      ),
      dashes(),
      mono(receipt.thanks, sizes.text),
      barcodeBox(inner, sizes.barcode, seedOf(receipt.seed), colors.ink),
    ],
    sizes.gap,
    'center',
  );
  const width = content.width + 2 * sizes.padX;
  const height = content.height + 2 * sizes.padY;
  return {
    width,
    height,
    place: (x, y) => [
      { kind: 'paper', shape: 'receipt', x, y, width, height, color: colors.paper },
      ...content.place(x + sizes.padX, y + sizes.padY),
    ],
  };
}

/**
 * A boarding pass: the band in a brand color with its title and the sport's icon; from the start
 * (no distance yet, its time) to the finish (the distance, when it ended), with the sport's icon
 * on the dashed line between them; the date and the data in a row; and the stub with its barcode,
 * apart by the notches where it tears off.
 */
export const BOARDING_PASS = {
  width: 880,
  radius: 30,
  padX: 44,
  band: 96,
  title: 28,
  icon: 46,
  label: 21,
  big: 84,
  time: 30,
  field: 32,
  routeIcon: 52,
  gap: 26,
  notch: 18,
  barcode: 92,
  dash: { length: 14, gap: 10, thick: 3 },
  colors: { paper: '#FFFFFF', ink: '#141B2D', faded: '#8A8F98', band: '#F6F1EA', rule: '#C9CDD3' },
} as const;

/** One end of a boarding pass's trip: big, its unit after it, and what goes under it. */
export interface PassEnd {
  readonly big: string;
  readonly unit: string | null;
  readonly under: string | null;
}

/** A boarding pass as `boardingPassBox` draws it. */
export interface BoardingPass {
  /** On its band, as a pass names its destination. */
  readonly title: string;
  /** Its sport's icon (or AllRun's monogram), on its band and on the dashed line. */
  readonly mark: SportMark;
  readonly departure: PassEnd;
  readonly arrival: PassEnd;
  readonly names: { readonly departure: string; readonly arrival: string };
  /** The data in a row under the trip. */
  readonly fields: readonly { readonly name: string; readonly value: string }[];
  /** What its barcode is drawn from, so the same pass always has the same one. */
  readonly seed: string;
}

/**
 * A boarding pass, of an activity or a period alike (see `BOARDING_PASS`): its band in AllRun's
 * `coverColor` with its title and mark; from its departure to its arrival, the mark on the dashed
 * line between them; its fields in a row; and the stub with its barcode, apart by the notches
 * where it tears off.
 */
export function boardingPassBox(
  fonts: SkTypefaceFontProvider,
  coverColor: (typeof BRAND_COVERS)[number],
  pass: BoardingPass,
): Box {
  const sizes = BOARDING_PASS;
  const { colors } = sizes;
  const cover = BRAND_COVER_COLORS[coverColor];
  const label = (content: string) =>
    appTextBox(
      fonts,
      [{ text: content.toLocaleUpperCase(), size: sizes.label, bold: true, spacing: 0.08 }],
      colors.faded,
    );
  const strong = (content: string, size: number) =>
    appTextBox(fonts, [{ text: content, size, bold: true }], colors.ink);
  /** A value written big, its unit after it, smaller. */
  const big = (value: string, unit: string | null) =>
    appTextBox(
      fonts,
      [
        { text: value, size: sizes.big, bold: true },
        ...(unit === null ? [] : [{ text: ` ${unit}`, size: sizes.big * 0.45, bold: true }]),
      ],
      colors.ink,
    );
  const end = (name: string, at: PassEnd, align: Align) =>
    column(
      [
        label(name),
        big(at.big, at.unit),
        ...(at.under === null ? [] : [strong(at.under, sizes.time)]),
      ],
      4,
      align,
    );
  const from = end(pass.names.departure, pass.departure, 'start');
  const to = end(pass.names.arrival, pass.arrival, 'end');
  const dash = (length: number) =>
    dashedBox(length, sizes.dash.length, sizes.dash.gap, sizes.dash.thick, colors.rule);
  const minRoute = sizes.routeIcon * 3;
  const inner = Math.max(
    sizes.width - 2 * sizes.padX,
    from.width + to.width + 2 * sizes.gap + minRoute,
  );
  const routeWidth = inner - from.width - to.width - 2 * sizes.gap;
  const leg = (routeWidth - sizes.routeIcon) / 2 - sizes.gap * 0.4;
  const trip = placed(inner, Math.max(from.height, to.height), [
    { box: from, x: 0, y: 0 },
    centeredAt(
      row(
        [dash(leg), sportMarkBox(pass.mark, sizes.routeIcon, colors.ink), dash(leg)],
        sizes.gap * 0.4,
        'center',
      ),
      from.width + sizes.gap + routeWidth / 2,
      Math.max(from.height, to.height) / 2,
    ),
    { box: to, x: inner - to.width, y: 0 },
  ]);
  const fields = justified(
    pass.fields.map((field) =>
      column([label(field.name), strong(field.value, sizes.field)], 4, 'start'),
    ),
    inner,
    sizes.gap,
  );
  // A long title is cut short before the icon.
  const title = appTextBox(
    fonts,
    [
      {
        text: pass.title.toLocaleUpperCase(),
        size: sizes.title,
        bold: true,
        spacing: 0.12,
      },
    ],
    colors.band,
    { maxWidth: inner - sizes.icon - sizes.gap },
  );
  const width = inner + 2 * sizes.padX;
  const body = sizes.band + sizes.gap * 1.2;
  const cut = body + trip.height + sizes.gap * 1.4 + fields.height + sizes.gap * 1.4;
  const height = cut + sizes.gap * 1.4 + sizes.barcode + sizes.gap * 1.4;
  const inset = sizes.notch + sizes.gap * 0.4;
  return {
    width,
    height,
    place: (x, y) => [
      { kind: 'paper', shape: 'pass', x, y, width, height, color: colors.paper, cut },
      ...placed(width, height, [
        // The band, its top corners rounded as the pass's, its bottom ones square.
        { box: fillBox(width, sizes.band, sizes.radius, cover, {}), x: 0, y: 0 },
        {
          box: fillBox(width, sizes.band - sizes.radius, 0, cover, {}),
          x: 0,
          y: sizes.radius,
        },
        { box: title, x: sizes.padX, y: (sizes.band - title.height) / 2 },
        {
          box: sportMarkBox(pass.mark, sizes.icon, colors.band),
          x: width - sizes.padX - sizes.icon,
          y: (sizes.band - sizes.icon) / 2,
        },
        { box: trip, x: sizes.padX, y: body },
        { box: fields, x: sizes.padX, y: body + trip.height + sizes.gap * 1.4 },
        { box: dash(width - 2 * inset), x: inset, y: cut - sizes.dash.thick / 2 },
        {
          box: barcodeBox(inner, sizes.barcode, seedOf(pass.seed), colors.ink),
          x: sizes.padX,
          y: cut + sizes.gap * 1.4,
        },
      ]).place(x, y),
    ],
  };
}

/** A nutrition label's paper and ink: white with black print, or black with white print. */
const NUTRITION_COLORS = {
  light: { paper: '#FFFFFF', ink: '#000000' },
  dark: { paper: '#000000', ink: '#FFFFFF' },
} as const;

/**
 * The sizes of the American label: its width, its corners, the room around its frame and the
 * frame's width, the room inside it; its title (smaller when it doesn't fit), its servings, its
 * serving size, the line over the calories, the calories' name and amount, the "% Daily Value"
 * heading and each nutrient's text, row and indent; its thick, medium and thin rules; and its
 * footnote and ingredients.
 */
const NUTRITION_FACTS = {
  width: 760,
  radius: 8,
  margin: 14,
  frame: 4,
  pad: 22,
  title: 92,
  servings: 30,
  serving: 36,
  amountPer: 24,
  caloriesName: 62,
  caloriesValue: 80,
  dailyValue: 24,
  text: 30,
  row: 50,
  indent: 34,
  rules: { thick: 20, medium: 9, thin: 2 },
  foot: 22,
  ingredients: 26,
  gap: 6,
} as const;

/**
 * The sizes of the European label: its width, corners and room inside; its title; the table's
 * frame, the room inside its cells, its texts, row height and indent; and its ingredients.
 */
const NUTRITION_TABLE = {
  width: 760,
  radius: 8,
  pad: 30,
  title: 44,
  frame: 3,
  cell: 18,
  text: 30,
  row: 58,
  indent: 28,
  ingredients: 26,
  gap: 22,
} as const;

/**
 * An activity or a period as a food's nutrition label (see `activityNutrition`): the American one
 * (`facts`: its title big, servings, the calories big between thick rules, each nutrient bold with
 * its amount, its parts indented with their shares in the "% Daily Value" column, the footnote
 * and the ingredients), or the European table (`table`: average values per serving in two
 * columns, the energy first, the parts "of which"); white with black print (`light`) or black
 * with white print (`dark`). Without calories, the American one writes the time big in their
 * place, and the European one leaves its energy out.
 */
export function nutritionLabelBox(
  fonts: SkTypefaceFontProvider,
  label: NutritionLabel,
  look: {
    readonly label: (typeof NUTRITION_LABELS)[number];
    readonly layout: (typeof APP_MODES)[number];
  },
  translate: BlockContext['translate'],
): Box {
  const colors = NUTRITION_COLORS[look.layout];
  const text = (content: string, size: number, bold: boolean, maxWidth?: number) =>
    appTextBox(fonts, [{ text: content, size, bold }], colors.ink, {
      ...(maxWidth === undefined ? {} : { maxWidth }),
    });
  /** A paragraph wrapped to `width`, its lines at their start: the ingredients, the footnote. */
  const wrapped = (runs: readonly Run[], width: number) =>
    appTextBox(fonts, runs, colors.ink, { wrapWidth: width, wrapStart: true });
  const ingredients = (size: number, width: number) =>
    column(
      [
        wrapped(
          [
            { text: `${translate('widgets.nutrition.ingredients')} `, size, bold: true },
            {
              text: [...label.ingredients, translate('widgets.nutrition.extras')].join(', ') + '.',
              size,
              bold: false,
            },
          ],
          width,
        ),
        wrapped([{ text: translate('widgets.nutrition.traces'), size, bold: true }], width),
      ],
      size * 0.3,
      'start',
    );
  const rule = (width: number, thick: number) => fillBox(width, thick, 0, colors.ink, {});
  /** `box` on the label's paper, `pad` inside its edges, lifting off the photo with a shadow. */
  const onPaper = (
    box: Box,
    pad: number,
    radius: number,
    frame?: { margin: number; width: number },
  ) => {
    const width = box.width + 2 * pad;
    const height = box.height + 2 * pad;
    return placed(width, height, [
      { box: fillBox(width, height, radius, colors.paper), x: 0, y: 0 },
      ...(frame === undefined
        ? []
        : [
            {
              box: fillBox(width - 2 * frame.margin, height - 2 * frame.margin, 0, colors.ink, {}),
              x: frame.margin,
              y: frame.margin,
            },
            {
              box: fillBox(
                width - 2 * (frame.margin + frame.width),
                height - 2 * (frame.margin + frame.width),
                0,
                colors.paper,
                {},
              ),
              x: frame.margin + frame.width,
              y: frame.margin + frame.width,
            },
          ]),
      { box, x: pad, y: pad },
    ]);
  };

  if (look.label === 'table') {
    const sizes = NUTRITION_TABLE;
    const inner = sizes.width - 2 * sizes.pad;
    const rows: { name: string; value: string; part: boolean; bold: boolean }[] = [
      {
        name: translate('widgets.nutrition.average'),
        value: label.serving,
        part: false,
        bold: true,
      },
      ...(label.calories === null
        ? []
        : [
            {
              name: translate('widgets.nutrition.energy'),
              value: `${label.calories} kcal`,
              part: false,
              bold: false,
            },
          ]),
      ...label.rows.map((row) => ({
        name: row.part
          ? translate('widgets.nutrition.partOf', {
              name: row.name.toLocaleLowerCase(),
            })
          : row.name,
        value: row.value,
        part: row.part,
        bold: false,
      })),
    ];
    const values = rows.map((row) => text(row.value, sizes.text, row.bold));
    const valueWidth = Math.max(...values.map((box) => box.width)) + 2 * sizes.cell;
    const nameWidth = inner - valueWidth - sizes.frame;
    const lines = rows.map((row, i) => {
      const indent = row.part ? sizes.indent : 0;
      const name = text(row.name, sizes.text, row.bold, nameWidth - 2 * sizes.cell - indent);
      return placed(inner, sizes.row, [
        { box: name, x: sizes.cell + indent, y: (sizes.row - name.height) / 2 },
        {
          box: values[i],
          x: inner - sizes.cell - values[i].width,
          y: (sizes.row - values[i].height) / 2,
        },
      ]);
    });
    const height = rows.length * sizes.row + (rows.length + 1) * sizes.frame;
    // The table's frame, its rules between rows and the one between its columns, then its rows.
    const table = placed(inner, height, [
      { box: rule(inner, height), x: 0, y: 0 },
      ...lines.flatMap((line, i) => {
        const y = sizes.frame + i * (sizes.row + sizes.frame);
        return [
          {
            box: fillBox(nameWidth - sizes.frame, sizes.row, 0, colors.paper, {}),
            x: sizes.frame,
            y,
          },
          {
            box: fillBox(valueWidth - sizes.frame, sizes.row, 0, colors.paper, {}),
            x: nameWidth + sizes.frame,
            y,
          },
          { box: line, x: 0, y },
        ];
      }),
    ]);
    return onPaper(
      column(
        [
          text(translate('widgets.nutrition.title'), sizes.title, true, inner),
          table,
          ingredients(sizes.ingredients, inner),
        ],
        sizes.gap,
        'start',
      ),
      sizes.pad,
      sizes.radius,
    );
  }

  const sizes = NUTRITION_FACTS;
  const inner = sizes.width - 2 * (sizes.margin + sizes.frame + sizes.pad);
  const titleAt = (size: number) => text(translate('widgets.nutrition.title'), size, true);
  const fullTitle = titleAt(sizes.title);
  const title =
    fullTitle.width <= inner ? fullTitle : titleAt((sizes.title * inner) / fullTitle.width);
  // Without calories, the time takes their big line, down to its minutes.
  const timeRow =
    label.calories === null ? label.rows.find((row) => row.time !== undefined) : undefined;
  const energy =
    label.calories === null
      ? { name: timeRow?.name ?? '', value: timeRow?.time ?? '' }
      : { name: translate('widgets.nutrition.calories'), value: label.calories };
  // Its parts (its sports or heart rate zones) go first, right under it.
  const timeAt = timeRow === undefined ? -1 : label.rows.indexOf(timeRow);
  let partsEnd = timeAt + 1;
  while (timeAt >= 0 && partsEnd < label.rows.length && label.rows[partsEnd].part) {
    partsEnd++;
  }
  const nutrients =
    timeAt < 0
      ? label.rows
      : [
          ...label.rows.slice(timeAt + 1, partsEnd),
          ...label.rows.slice(0, timeAt),
          ...label.rows.slice(partsEnd),
        ];
  const shares = nutrients.some((row) => row.share !== null);
  const nutrient = (row: NutritionRow) => {
    const share = row.share === null ? null : text(row.share, sizes.text, true);
    const indent = row.part ? sizes.indent : 0;
    const room = inner - indent - (share === null ? 0 : share.width + sizes.text);
    const written = appTextBox(
      fonts,
      [
        { text: `${row.name} `, size: sizes.text, bold: !row.part },
        { text: row.value, size: sizes.text, bold: false },
      ],
      colors.ink,
      { maxWidth: room },
    );
    return placed(inner, sizes.row, [
      { box: written, x: indent, y: (sizes.row - written.height) / 2 },
      ...(share === null
        ? []
        : [{ box: share, x: inner - share.width, y: (sizes.row - share.height) / 2 }]),
    ]);
  };
  // Its amount smaller when it leaves its name no room.
  const energyName = text(energy.name, sizes.caloriesName, true);
  const fullValue = text(energy.value, sizes.caloriesValue, true);
  const valueRoom = inner - energyName.width - sizes.text;
  const energyValue =
    fullValue.width <= valueRoom
      ? fullValue
      : text(energy.value, (sizes.caloriesValue * valueRoom) / fullValue.width, true);
  const energyLine = spread(energyName, energyValue, inner);
  // The serving size and its value on one line, smaller together when a long one leaves no room.
  const servingAt = (size: number) => [
    text(translate('widgets.nutrition.servingSize'), size, true),
    text(label.serving, size, true),
  ];
  const fullServing = servingAt(sizes.serving);
  const servingWidth = fullServing[0].width + fullServing[1].width + sizes.text;
  const [servingName, servingValue] =
    servingWidth <= inner
      ? fullServing
      : servingAt((sizes.serving * (inner - sizes.text)) / (servingWidth - sizes.text));
  const content = column(
    [
      title,
      column(
        [
          text(label.servings, sizes.servings, false, inner),
          spread(servingName, servingValue, inner),
        ],
        sizes.gap,
        'start',
      ),
      rule(inner, sizes.rules.thick),
      text(translate('widgets.nutrition.amountPer'), sizes.amountPer, true),
      energyLine,
      rule(inner, sizes.rules.medium),
      ...(shares
        ? [
            widened(
              text(translate('widgets.nutrition.dailyValue'), sizes.dailyValue, true),
              inner,
              'end',
            ),
          ]
        : []),
      column(
        nutrients.flatMap((row, i) => [
          ...(i === 0 && !shares ? [] : [rule(inner, sizes.rules.thin)]),
          nutrient(row),
        ]),
        0,
        'start',
      ),
      rule(inner, sizes.rules.thick),
      ...(shares
        ? [
            wrapped(
              [{ text: translate('widgets.nutrition.footnote'), size: sizes.foot, bold: false }],
              inner,
            ),
          ]
        : []),
      ingredients(sizes.ingredients, inner),
    ],
    sizes.gap,
    'start',
  );
  return onPaper(
    widened(content, inner, 'start'),
    sizes.margin + sizes.frame + sizes.pad,
    sizes.radius,
    {
      margin: sizes.margin,
      width: sizes.frame,
    },
  );
}

/** The icon of each thing a widget of equivalences compares with. */
const EQUIVALENCE_ICONS: Readonly<Record<EquivalenceId, IconId>> = {
  track: 'track',
  gibraltar: 'boat',
  manhattan: 'city',
  channel: 'boat',
  marathon: 'finish',
  madridToledo: 'route',
  sevilleCadiz: 'route',
  parisLondon: 'route',
  madridBarcelona: 'route',
  camino: 'route',
  tourDeFrance: 'ride',
  earth: 'globe',
  floor: 'stairs',
  eiffel: 'building',
  burjKhalifa: 'building',
  teide: 'mountain',
  everest: 'mountain',
  song: 'song',
  football: 'football',
  godfather: 'movie',
  lordOfTheRings: 'movie',
  beer: 'beer',
  burger: 'burger',
  pizza: 'pizza',
};

/**
 * A widget of equivalences' card, as a widget of the iPhone's home screen in dark and light mode:
 * the card, its print and the fainter print, and the disc behind each icon.
 */
const EQUIVALENCES_COLORS = {
  dark: { card: '#1C1C1E', ink: '#FFFFFF', faded: '#FFFFFF99', disc: '#FFFFFF1F' },
  light: { card: '#FFFFFF', ink: '#000000', faded: '#3C3C4399', disc: '#0000000F' },
} as const;

/**
 * The sizes of a widget of equivalences: its card's width, corners and room inside; its title;
 * each line's disc and the icon in it (a share of it), its figure, its name and what it is of,
 * the room between its parts and between lines, and the rule between them.
 */
const EQUIVALENCES_SIZES = {
  width: 760,
  radius: 44,
  pad: 40,
  title: 26,
  titleGap: 26,
  disc: 84,
  icon: 0.56,
  figure: 64,
  name: 32,
  source: 24,
  gap: 22,
  line: 26,
  rule: 2,
} as const;

/**
 * What an activity's or a period's data are equal to (see `equivalenceLines`), on a card in dark
 * or light mode: "Equal to" over a line per thing, its icon in a disc, how many times it fits big
 * and its name beside it (wrapped when long), with what it is of under it, faded; a rule between
 * lines.
 */
export function equivalencesBox(
  fonts: SkTypefaceFontProvider,
  lines: readonly EquivalenceLine[],
  layout: (typeof APP_MODES)[number],
  translate: BlockContext['translate'],
): Box {
  const sizes = EQUIVALENCES_SIZES;
  const colors = EQUIVALENCES_COLORS[layout];
  const inner = sizes.width - 2 * sizes.pad;
  const figures = lines.map((line) =>
    appTextBox(fonts, [{ text: line.times, size: sizes.figure, bold: true }], colors.ink),
  );
  // The figures in a column as wide as the widest, so the names line up.
  const figureWidth = Math.max(0, ...figures.map((figure) => figure.width));
  const room = inner - sizes.disc - figureWidth - 2 * sizes.gap;
  const rows = lines.map((line, i) =>
    row(
      [
        overlay(
          discBox(sizes.disc / 2, colors.disc),
          iconBox(EQUIVALENCE_ICONS[line.reference], sizes.disc * sizes.icon, colors.ink),
        ),
        widened(figures[i], figureWidth, 'end'),
        column(
          [
            appTextBox(fonts, [{ text: line.name, size: sizes.name, bold: true }], colors.ink, {
              wrapWidth: room,
              wrapStart: true,
            }),
            appTextBox(
              fonts,
              [{ text: line.source, size: sizes.source, bold: false }],
              colors.faded,
              {
                maxWidth: room,
              },
            ),
          ],
          4,
          'start',
        ),
      ],
      sizes.gap,
      'center',
    ),
  );
  const content = column(
    [
      appTextBox(
        fonts,
        [
          {
            text: translate('widgets.equivalences.title').toLocaleUpperCase(),
            size: sizes.title,
            bold: true,
            spacing: 0.06,
          },
        ],
        colors.faded,
      ),
      column(
        rows.flatMap((line, i) =>
          i === 0 ? [line] : [fillBox(inner, sizes.rule, 0, colors.disc, {}), line],
        ),
        sizes.line,
        'start',
      ),
    ],
    sizes.titleGap,
    'start',
  );
  return panel(widened(content, inner, 'start'), colors.card, sizes.pad, sizes.pad, sizes.radius);
}
