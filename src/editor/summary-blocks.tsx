import { Skia } from '@shopify/react-native-skia';

import type { Activity } from '@/core/activity';
import { bigMetrics, sportIcon, type SportIconId } from '@/core/activity-block';
import { familyTotals } from '@/core/summary';
import { gridColumns, isSummaryReplica, mainFamily } from '@/core/summary-block';
import { periodTotals, summaryMetricValue } from '@/core/summary-metrics';
import type { Layer } from '@/core/template';
import { formatActivityDate } from '@/ui/format';

import {
  type BlockContext,
  type Box,
  capitalsBox,
  column,
  FADED_ALPHA,
  fillBox,
  finishBlock,
  hairlineBox,
  iconBox,
  justified,
  overlay,
  placed,
  type PreparedBlock,
  quotationBox,
  routeBox,
  row,
} from './activity-blocks';
import {
  familyCard,
  periodTable,
  periodName,
  periodTitle,
  plainMetricText,
  plainSummaryText,
  type SummaryData,
  summaryTotalText,
  type TextContext,
} from './editor-data';
import { CAP_HEIGHTS } from './fonts';
import { softBackdrop } from './scene-text';
import {
  periodBoardingPassBox,
  periodCalendarBox,
  periodGrandPrixBox,
  periodLapsBox,
  periodNotesBox,
  periodPlaylistBox,
  periodReceiptBox,
  periodSentenceBox,
  periodWrappedBox,
  routesBox,
} from './summary-creatives';

/**
 * The data widgets of a period summary (R2c), laid out from measured texts as the activities'
 * data widgets are (see `activity-blocks.tsx`), in the user's lettering: the period's name over
 * its main totals, its table of days, weeks or months, its total per sport (written, with icons or
 * on cards), its days' activities with their icons, and its activities with their routes.
 */

type SummaryBlockLayer = Extract<Layer, { kind: 'summaryBlock' }>;

/**
 * Base sizes of each design's texts, in canvas pixels before the layer's scale, chosen for a story
 * (other formats scale the whole block, see `newLayer`), and the room between them as shares of
 * their sizes.
 */
const SIZES = {
  /**
   * One datum big, or two or three in a line; the period's name over them, a share of their size,
   * and the room under it; the room between data.
   */
  periodData: {
    one: 120,
    many: 64,
    title: { one: 0.34, many: 0.55 },
    titleGap: { one: 0.14, many: 0.3 },
    gap: 0.7,
  },
  /**
   * The names of the rows and the header's texts, small, and their values, big; the narrowest
   * the table gets; the rules' width and the room around them; the least room between a name and
   * its value.
   */
  periodTable: {
    name: 28,
    value: 64,
    minWidth: 560,
    rule: 2,
    ruleGap: 0.3,
    minGap: 1.5,
  },
  /** The period's name and each sport's name and total; the room under a name and each sport. */
  periodSports: { text: 60, nameGap: 0.15, sportGap: 0.6 },
  /**
   * The totals beside their icons, and, shares of their size: the period's name and the room
   * under it, each day's name and the room under it, the room between lines, between days and
   * beside an icon, and an icon's size, a share of the totals' capitals.
   */
  periodIcons: {
    value: 80,
    title: 0.55,
    titleGap: 0.35,
    day: 0.45,
    dayGap: 0.12,
    lineGap: 0.18,
    dayBlockGap: 0.5,
    iconGap: 0.3,
    icon: 1.4,
  },
  /**
   * Each activity of the grid: its main datum and its other data, small beside its route as in
   * the example, so each is about square; its route's box (shares of the main datum's size), the
   * room under it and its line's width; the size of a sport's icon in its place, a share of the
   * route's box's height; the least room between the small data; the room between columns and
   * rows; the widest the grid gets, smaller when it would be wider.
   */
  periodRoutes: {
    value: 34,
    data: 13,
    routeWidth: 6.4,
    routeHeight: 5.4,
    routeGap: 0.35,
    stroke: 6,
    icon: 0.6,
    minGap: 0.8,
    columnGap: 1.2,
    rowGap: 1.1,
    maxWidth: 1000,
  },
  /**
   * The period's routes overlaid over its totals, as an activity's route over its big datum: the
   * main total and the others under it; the routes' box, at least as wide as a share of the main
   * total's size and as tall as a share of its width; the room under it and the lines' width;
   * without routes, the main sport's icon, a share of the main total's size.
   */
  periodOverlay: {
    value: 110,
    data: 36,
    minWidth: 5,
    height: 0.85,
    gap: 0.3,
    stroke: 3,
    icon: 2.4,
    minGap: 0.8,
  },
  /**
   * A sport's card, airy as the example it copies: its name, total and detail, close in size;
   * its icon, a share of the total's capitals, as tall as the total and the detail; the room
   * under the name, beside the icon, over the detail and between cards; inside a card, its
   * narrowest and its corners.
   */
  periodCards: {
    name: 34,
    total: 48,
    detail: 25,
    icon: 1.9,
    nameGap: 0.7,
    iconGap: 0.5,
    detailGap: 0.45,
    cardGap: 26,
    padX: 46,
    padY: 42,
    minWidth: 480,
    radius: 38,
  },
} as const;

/**
 * A card behind texts of `color`: a light grey see-through one behind light texts, lighter than a
 * text's backdrop, as the cards of the example; a light one behind dark texts.
 */
function cardFill(color: string): string {
  return softBackdrop(color) === 'rgba(0, 0, 0, 0.5)'
    ? 'rgba(118, 118, 128, 0.55)'
    : 'rgba(255, 255, 255, 0.75)';
}

/** Room under a value's baseline for a comma's tail, a share of its size. */
const BELOW = 0.12;

/** `color` as faded as a block's secondary texts, for its rules. */
function fadedColor(color: string): string {
  const [r, g, b, a] = Skia.Color(color);
  const channel = (value: number) => Math.round(value * 255);
  return `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${a * FADED_ALPHA})`;
}

/**
 * Lays out a summary's data widget, or `null` when the period can't fill it (no activities, fewer
 * totals than it writes, a single sport for the sports' one).
 */
export function prepareSummaryBlock(
  layer: SummaryBlockLayer,
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): PreparedBlock | null {
  const { block, style } = layer;
  /** `text` on one line at `size`, cut to its letters (or to all of `shared`'s, see `capitalsBox`). */
  const line = (
    text: string,
    size: number,
    below: number,
    shared?: string,
    bold = style.bold,
  ): Box => capitalsBox(fonts, [{ text, size, bold }], size, below, 1, style, {}, shared);
  /** The text context with a time's units at their shortest ("7h 18min"). */
  const compact: TextContext = {
    ...textContext,
    durationUnits: {
      hours: translate('compactDurationUnits.hours'),
      minutes: translate('compactDurationUnits.minutes'),
      seconds: translate('compactDurationUnits.seconds'),
    },
  };
  const title = periodTitle(data, textContext, translate);
  if (data.summary.activityCount === 0) {
    return null;
  }

  const body = ((): Box | null => {
    switch (block.design) {
      case 'periodData': {
        // The period's name small and centered over its data, one big or a few in a line, all on
        // one baseline.
        const sizes = SIZES.periodData;
        const metrics = periodTotals(data.summary).slice(0, block.count);
        if (metrics.length < block.count) {
          return null;
        }
        const values = metrics.map((metric) =>
          summaryTotalText(
            metric,
            summaryMetricValue(data.summary, metric) ?? 0,
            compact,
            translate,
          ),
        );
        const size = block.count === 1 ? sizes.one : sizes.many;
        const shared = values.join(' ');
        const totals = row(
          values.map((value) => line(value, size, size * BELOW, shared)),
          size * sizes.gap,
          'end',
        );
        const name = line(
          title,
          size * sizes.title[block.count === 1 ? 'one' : 'many'],
          size * sizes.titleGap[block.count === 1 ? 'one' : 'many'],
        );
        return column([name, totals], 0, 'center');
      }
      case 'periodTable': {
        // A row per day, week or month with some, its name small at the start and its value big
        // at the end, under the period's name and what the values are; rules between them, and
        // the total last.
        const sizes = SIZES.periodTable;
        const table = periodTable(data, block.value, textContext, translate);
        if (table.rows.length === 0) {
          return null;
        }
        // The names, and the values, cut as one: an accent ("MIÉRCOLES") moves no line down.
        const total = translate('tableTotal');
        const names = [table.title, table.measure, ...table.rows.map((r) => r.name), total];
        const values = [...table.rows.map((r) => r.value), table.total];
        // The header and the total stand out: bold and at full strength, as big as the rows'
        // names; the rows' names are fainter, as a card's names of data.
        const small = (text: string, size: number, emphasis: boolean) =>
          capitalsBox(
            fonts,
            [{ text, size, bold: emphasis, faded: !emphasis }],
            size,
            0,
            1,
            style,
            {},
            names.join(' '),
          );
        const big = (text: string) =>
          line(text, sizes.value, sizes.value * BELOW, values.join(' '));
        const lines = [
          [small(table.title, sizes.name, true), small(table.measure, sizes.name, true)],
          ...table.rows.map(({ name, value }) => [small(name, sizes.name, false), big(value)]),
          [small(total, sizes.name, true), big(table.total)],
        ] as const;
        const width = Math.max(
          sizes.minWidth,
          ...lines.map(([name, value]) => name.width + value.width + sizes.name * sizes.minGap),
        );
        const rule = hairlineBox(width, 0, sizes.rule, fadedColor(style.color));
        // Each line's name and value start at its top, as the reference sets them.
        const laidOut = lines.map(([name, value]) =>
          placed(width, Math.max(name.height, value.height), [
            { box: name, x: 0, y: 0 },
            { box: value, x: width - value.width, y: 0 },
          ]),
        );
        return column(
          laidOut.flatMap((box, i) => (i === 0 ? [box] : [rule, box])),
          sizes.value * sizes.ruleGap,
          'start',
        );
      }
      case 'periodSports': {
        // The period's name, then each sport's name over its total: its distance, or its time
        // when it has none. The period by its name alone: a summary of one sport names it under
        // it, not after it too ("Esta semana · Carreras" over "Carreras").
        const sizes = SIZES.periodSports;
        const sports = familyTotals(data.activities);
        const period = periodName(data, textContext, translate);
        const names = sports.map((sport) => translate(`families.${sport.family}`));
        const totals = sports.map((sport) =>
          sport.distanceMeters > 0
            ? plainSummaryText('totalDistance', sport.distanceMeters, compact)
            : plainSummaryText('totalMovingTime', sport.movingTimeSeconds, compact),
        );
        // The names, and the totals, cut as one: an accent ("NATACIÓN") opens no wider gap.
        const shared = [period, ...names].join(' ');
        const text = (value: string, below: number, all: string) =>
          line(value, sizes.text, below, all);
        return column(
          [
            text(period, sizes.text * BELOW, shared),
            ...sports.map((_, i) =>
              column(
                [
                  text(names[i], sizes.text * sizes.nameGap, shared),
                  text(totals[i], sizes.text * BELOW, totals.join(' ')),
                ],
                0,
                'start',
              ),
            ),
          ],
          sizes.text * sizes.sportGap,
          'start',
        );
      }
      case 'periodIcons': {
        // The period's name, then each sport's total beside its icon (`sports`), or each day's
        // name over its activities' main datum beside their icons (`days`).
        const sizes = SIZES.periodIcons;
        const size = sizes.value;
        const iconSize = CAP_HEIGHTS[style.font] * size * sizes.icon;
        const lines: readonly IconLine[] =
          block.layout === 'sports'
            ? familyTotals(data.activities).map((sport) => ({
                icon: sport.family,
                text:
                  sport.distanceMeters > 0
                    ? plainSummaryText('totalDistance', sport.distanceMeters, compact)
                    : plainSummaryText('totalMovingTime', sport.movingTimeSeconds, compact),
                day: null,
              }))
            : sortedActivities(data.activities).flatMap((activity) => {
                const [main] = bigMetrics(activity, 'main', 1);
                return main === undefined
                  ? []
                  : [
                      {
                        icon: sportIcon(activity),
                        text: plainMetricText(activity, main, compact, 'brief'),
                        day: activity.localDate,
                      },
                    ];
              });
        if (lines.length === 0 || (block.layout === 'sports' && lines.length < 2)) {
          return null;
        }
        // The totals, and the days' names, each cut as one.
        const texts = lines.map((entry) => entry.text).join(' ');
        const dayName = (date: string) =>
          formatActivityDate(`${date}T00:00:00`, textContext.locale, 'weekday');
        const days = [
          ...new Set(lines.flatMap((entry) => (entry.day === null ? [] : [entry.day]))),
        ];
        const dayNames = days.map(dayName).join(' ');
        const item = ({ icon, text }: IconLine) =>
          row(
            [iconBox(icon, iconSize), line(text, size, 0, texts)],
            size * sizes.iconGap,
            'center',
          );
        const name = line(title, size * sizes.title, size * sizes.titleGap);
        if (block.layout === 'sports') {
          return column([name, ...lines.map(item)], size * sizes.lineGap, 'start');
        }
        return column(
          [
            name,
            ...days.map((day) =>
              column(
                [
                  line(dayName(day), size * sizes.day, size * sizes.dayGap, dayNames),
                  ...lines.filter((entry) => entry.day === day).map(item),
                ],
                size * sizes.lineGap,
                'start',
              ),
            ),
          ],
          size * sizes.dayBlockGap,
          'start',
        );
      }
      case 'periodRoutes': {
        if (block.layout === 'overlay') {
          // All the period's routes overlaid, as an activity's route over its big datum (or its
          // main sport's icon, without any): over its main total, and the other two small under
          // it, spread to its width.
          const sizes = SIZES.periodOverlay;
          const totals = periodTotals(data.summary).map((metric) =>
            summaryTotalText(
              metric,
              summaryMetricValue(data.summary, metric) ?? 0,
              compact,
              translate,
            ),
          );
          if (totals.length === 0) {
            return null;
          }
          const [first, ...rest] = totals;
          const main = line(first, sizes.value, sizes.value * BELOW);
          const stack =
            rest.length === 0
              ? main
              : column(
                  [
                    main,
                    justified(
                      rest.map((text) =>
                        line(text, sizes.data, sizes.data * BELOW, rest.join(' ')),
                      ),
                      main.width,
                      sizes.data * sizes.minGap,
                    ),
                  ],
                  0,
                  'start',
                );
          const width = Math.max(main.width, sizes.value * sizes.minWidth);
          // Without any route (a month of gym sessions), its main sport's icon in their place.
          const art =
            routesBox(data.summary.routes, width, width * sizes.height, sizes.stroke) ??
            iconBox(mainFamily(data.activities), sizes.value * sizes.icon);
          return column([art, stack], sizes.value * sizes.gap, 'center');
        }
        // Each activity as the activities' route with a big datum, small: its route (its sport's
        // icon without one) over its main datum, its other two small under it; in a grid, by date.
        const sizes = SIZES.periodRoutes;
        const activities = sortedActivities(data.activities).filter(
          (activity) => bigMetrics(activity, 'main', 1).length > 0,
        );
        if (activities.length === 0) {
          return null;
        }
        const columns = gridColumns(activities.length);
        const mains = activities.map((activity) =>
          plainMetricText(activity, bigMetrics(activity, 'main', 1)[0], textContext),
        );
        const grid = (scale: number): Box => {
          const value = sizes.value * scale;
          const small = sizes.data * scale;
          const items = activities.map((activity, i) => {
            const [, ...rest] = bigMetrics(activity, 'main', 3);
            const main = line(mains[i], value, value * BELOW, mains.join(' '));
            const under = rest.map((metric) =>
              line(plainMetricText(activity, metric, textContext), small, small * BELOW),
            );
            const stack =
              under.length === 0
                ? main
                : column([main, justified(under, main.width, small * sizes.minGap)], 0, 'start');
            const frame = { width: value * sizes.routeWidth, height: value * sizes.routeHeight };
            const art =
              (activity.routePolyline === null
                ? null
                : routeBox(activity.routePolyline, frame.width, frame.height, {
                    width: sizes.stroke * scale,
                  })) ?? iconBox(sportIcon(activity), frame.height * sizes.icon);
            // Every route in a frame as big, so the data line up across a row.
            const framed = placed(frame.width, frame.height, [
              { box: art, x: (frame.width - art.width) / 2, y: (frame.height - art.height) / 2 },
            ]);
            return column([framed, stack], value * sizes.routeGap, 'center');
          });
          const cellWidth = Math.max(...items.map((cell) => cell.width));
          const cellHeight = Math.max(...items.map((cell) => cell.height));
          const rows = Math.ceil(items.length / columns);
          const gapX = value * sizes.columnGap;
          const gapY = value * sizes.rowGap;
          return placed(
            columns * cellWidth + (columns - 1) * gapX,
            rows * cellHeight + (rows - 1) * gapY,
            items.map((cell, i) => ({
              box: cell,
              x: (i % columns) * (cellWidth + gapX) + (cellWidth - cell.width) / 2,
              y: Math.floor(i / columns) * (cellHeight + gapY),
            })),
          );
        };
        const natural = grid(1);
        // A month's grid is wide: smaller, so it fits a story.
        return natural.width <= sizes.maxWidth ? natural : grid(sizes.maxWidth / natural.width);
      }
      case 'periodCards': {
        // A see-through card per sport, as wide as each other: its name, then its icon beside its
        // total, and under the total, small and fainter, its time and pace or its sessions.
        const sizes = SIZES.periodCards;
        const cards = familyTotals(data.activities).map((sport) => ({
          family: sport.family,
          ...familyCard(sport, compact, translate),
        }));
        if (cards.length === 0) {
          return null;
        }
        const shared = (key: 'name' | 'total' | 'detail') =>
          cards.map((card) => card[key]).join(' ');
        // On a card already: no shadows.
        const text = (value: string, size: number, below: number, all: string, faded = false) =>
          capitalsBox(
            fonts,
            [{ text: value, size, bold: faded ? false : style.bold, faded }],
            size,
            below,
            1,
            style,
            { shadow: false },
            all,
          );
        const contents = cards.map((card) =>
          column(
            [
              text(card.name, sizes.name, sizes.name * sizes.nameGap, shared('name')),
              row(
                [
                  iconBox(card.family, CAP_HEIGHTS[style.font] * sizes.total * sizes.icon),
                  column(
                    [
                      text(card.total, sizes.total, sizes.total * BELOW, shared('total')),
                      text(card.detail, sizes.detail, sizes.detail * BELOW, shared('detail'), true),
                    ],
                    sizes.detail * sizes.detailGap,
                    'start',
                  ),
                ],
                sizes.total * sizes.iconGap,
                'center',
              ),
            ],
            0,
            'start',
          ),
        );
        const width = Math.max(
          sizes.minWidth,
          Math.max(...contents.map((content) => content.width)) + 2 * sizes.padX,
        );
        return column(
          contents.map((content) =>
            overlay(
              fillBox(width, content.height + 2 * sizes.padY, sizes.radius, cardFill(style.color)),
              placed(width, content.height, [{ box: content, x: sizes.padX, y: 0 }]),
            ),
          ),
          sizes.cardGap,
          'start',
        );
      }
      case 'quote':
        return quotationBox(
          fonts,
          style,
          translate,
          translate(`widgets.quotes.${block.quote}.text`),
          translate(`widgets.quotes.${block.quote}.author`),
        );
      case 'verse':
        return quotationBox(
          fonts,
          style,
          translate,
          translate(`widgets.verses.${block.verse}.text`),
          translate(`widgets.verses.${block.verse}.source`),
        );
      case 'periodSentence':
        return periodSentenceBox(data, { fonts, textContext, translate });
      case 'periodPlaylist':
        return periodPlaylistBox(block, data, { fonts, textContext: compact, translate });
      case 'periodWrapped':
        return periodWrappedBox(block, data, { fonts, textContext, translate });
      case 'periodLaps':
        return periodLapsBox(block, data, { fonts, textContext, translate });
      case 'periodGrandPrix':
        return periodGrandPrixBox(data, { fonts, textContext, translate });
      case 'periodReceipt':
        return periodReceiptBox(data, { fonts, textContext, translate });
      case 'periodBoardingPass':
        return periodBoardingPassBox(block, data, { fonts, textContext, translate });
      case 'periodCalendar':
        return periodCalendarBox(block, data, { fonts, textContext: compact, translate });
      case 'periodNotes':
        return periodNotesBox(block, data, { fonts, textContext: compact, translate });
    }
  })();
  // A replica is the app's own view: no signature.
  return body === null ? null : finishBlock(body, layer, !isSummaryReplica(block.design));
}

/** A line of the widget with icons: an icon beside a total, under a day's name when it has one. */
interface IconLine {
  readonly icon: SportIconId;
  readonly text: string;
  readonly day: string | null;
}

/** A period's activities from the first to start to the last. */
function sortedActivities(activities: readonly Activity[]): Activity[] {
  return [...activities].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}
