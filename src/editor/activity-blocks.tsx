import type { SkTypefaceFontProvider } from '@shopify/react-native-skia';
import type { ReactElement } from 'react';

import {
  blockDataCount,
  blockMetrics,
  dataWidgetMetrics,
  fastestIndex,
  isAppReplica,
  isDataWidget,
  recordRows,
  sentencePlan,
  sportIcon,
  tyreCompounds,
} from '@/core/activity-block';
import { lineLevel, splitRows } from '@/core/activity-charts';
import { activityEquivalences } from '@/core/equivalences';
import { type MetricId, metricValue } from '@/core/metrics';
import { type Phrase, phraseLanguage, phraseWords } from '@/core/phrases';
import { BUILT_IN_PHRASES } from '@/core/phrases-built-in';
import { formatPlace } from '@/core/place';
import type { HitHole } from '@/core/layer-transform';
import type { Size } from '@/core/photo-placement';
import type { Layer } from '@/core/template';
import { durationParts, formatDuration } from '@/core/units';
import { formatActivityDate, formatShortWeekday, formatTimeAfter } from '@/ui/format';

import {
  type ActivityData,
  activityNutrition,
  bestEffortName,
  equivalenceLines,
  type LabelKey,
  metricText,
  plainMetricParts,
  plainMetricText,
  speedMeasure,
  splitGapText,
  splitRowTexts,
  type TextContext,
} from './editor-data';
import { CAP_HEIGHTS } from './fonts';
import { softBackdrop } from './scene-text';
import { finishBlock } from './blocks/art';
import {
  type Box,
  column,
  columnWidths,
  justified,
  overlay,
  placed,
  row,
  spread,
  tableRow,
  turned,
  widened,
} from './blocks/layout';
import { boardingPassBox, equivalencesBox, nutritionLabelBox, receiptBox } from './blocks/paper';
import {
  type AppLettering,
  appTextBox,
  capitalsBox,
  centeredAt,
  discBox,
  fillBox,
  iconBox,
  mapBox,
  markBox,
  messageBubble,
  panel,
  paragraph,
  quotationBox,
  routeBox,
  routeStrokeFor,
  type Run,
  STRETCHED_FONTS,
  symbolBox,
  textBox,
  type TextLook,
} from './blocks/pieces';
import {
  ALARM,
  ALARM_COLORS,
  BRAND_COVER_COLORS,
  cameraBox,
  CHAT,
  COVER_ROUTE,
  highlightedSentenceBox,
  LOCATION,
  LOCATION_COLORS,
  markedPart,
  MESSAGE_COLORS,
  MESSAGE_SIZES,
  MUSIC,
  MUSIC_COLORS,
  MUSIC_PLAYED,
  noteBox,
  NOTES_COLORS,
  NOTES_ROWS,
  noteSportBox,
  type SentencePart,
  sentenceParts,
  SPLIT_BARS,
  SPLIT_BARS_ROWS,
  SPLIT_LADDER,
  SPLIT_LADDER_ROWS,
  VERIFIED,
  VERIFIED_COLORS,
} from './blocks/replicas';
import { BIG, BIG_HEADER, CARD_COLUMNS, DATE, FIT_SIZE, SIZES } from './blocks/sizes';
import { GRAND_PRIX_ROWS, LAPS_ROWS, lapsTableBox, timingTowerBox } from './blocks/tables';

/**
 * The mixed widgets of an activity (ADR 009): several of its data in one designed block, laid out
 * from measured texts. Each design is a composition of boxes (texts, columns, rows, rules, the
 * sport's icon), measured first and then placed, so a block is exactly as big as what it holds in
 * any font. Its content is centered on (0, 0), like every layer's.
 */

type BlockLayer = Extract<Layer, { kind: 'activityBlock' }>;
export type BlockStyle = BlockLayer['style'];

/** What a block needs besides its activity: fonts, how to write data, and translations. */
export interface BlockContext {
  readonly fonts: SkTypefaceFontProvider;
  readonly textContext: TextContext;
  /** Translates a label; `values` fill its placeholders ("{{unit}}"). */
  readonly translate: (key: LabelKey, values?: Readonly<Record<string, string>>) => string;
  /** Size of the canvas, which the camera frames whole. */
  readonly canvas: Size;
  /** The verses, quotes and chat phrases to read a widget's words from; by default, the built-in. */
  readonly phrases?: readonly Phrase[];
}

/**
 * A block laid out: its size before the layer's scale, in canvas pixels, and its drawing; and
 * the see-through part a touch goes through (the camera's view of the photo), if any.
 */
export interface PreparedBlock {
  readonly width: number;
  readonly height: number;
  readonly content: ReactElement;
  readonly hole?: HitHole;
  /** The size of its words, in a widget whose words are chosen from a list. */
  readonly wordsSize?: number;
}

/**
 * Lays out a mixed widget with the data of `data`'s activity, or `null` when the activity has no
 * datum to show. Time O(d) for the d data of the block, each text laid out once.
 */
export function prepareActivityBlock(
  layer: BlockLayer,
  data: ActivityData,
  { fonts, textContext, translate, canvas, phrases = BUILT_IN_PHRASES }: BlockContext,
): PreparedBlock | null {
  const { activity, map: routeMap } = data;
  const { block, style } = layer;
  const metrics = isDataWidget(block.design)
    ? dataWidgetMetrics(activity, block)
    : blockMetrics(activity, blockDataCount(block));
  // A verse or a quote shows no data: it is drawn for any activity.
  if (metrics.length === 0 && blockDataCount(block) > 0) {
    return null;
  }
  /** A replica's text in `color` (see `appTextBox`). */
  const appText = (runs: readonly Run[], color: string, options: TextLook & AppLettering = {}) =>
    appTextBox(fonts, runs, color, options);
  /** `runs` cut to their letters (see `capitalsBox`), in the block's lettering by default. */
  const capitals = (
    runs: readonly Run[],
    size: number,
    below: number,
    taller = 1,
    lettering: BlockStyle = style,
    look: TextLook = {},
    shared?: string,
  ): Box => capitalsBox(fonts, runs, size, below, taller, lettering, look, shared);
  /**
   * `text` on one line at `size` in the block's lettering, cut to its letters, or to all of
   * `shared`'s when it sits on one baseline with others (see `capitals`).
   */
  const line = (text: string, size: number, below: number, taller = 1, shared?: string): Box =>
    capitals([{ text, size, bold: style.bold }], size, below, taller, style, {}, shared);
  /** The size `text` is written at to be `width` wide (its width grows with its size). */
  const sizeFor = (text: string, width: number): number =>
    (FIT_SIZE * width) /
    textBox(paragraph([{ text, size: FIT_SIZE, bold: style.bold }], fonts, style)).width;
  /**
   * Lines of `size` one under another, `gap` (a share of the size) apart and aligned to `align`,
   * shrunk as one so that `columns` of them fit in `width` with `minGap` between them.
   */
  const fitted = (columns: readonly (readonly string[])[], size: number, width: number): Box => {
    const laid = (at: number) =>
      columns.map((lines, i) =>
        column(
          lines.map((text) => line(text, at, at * DATE.lineGap)),
          0,
          i === 0 ? 'start' : i === columns.length - 1 ? 'end' : 'start',
        ),
      );
    const room = (boxes: readonly Box[], at: number) =>
      boxes.reduce((sum, box) => sum + box.width, 0) + at * DATE.minGap * (boxes.length - 1);
    const wanted = laid(size);
    const fits = room(wanted, size) <= width;
    const at = fits ? size : (size * width) / room(wanted, size);
    return justified(fits ? wanted : laid(at), width, at * DATE.minGap);
  };
  /** The weekday's full name, and the short one ("Mié"). */
  const weekdayName = formatActivityDate(activity.startLocal, textContext.locale, 'weekday');
  const shortWeekdayName = formatShortWeekday(activity.startLocal, textContext.locale);
  /** When the activity started ("10:00"), and its sport's name. */
  const startTime = formatActivityDate(activity.startLocal, textContext.locale, 'time');
  const sportWord = translate(`modalities.${activity.sportModality}`);
  /** The text context with a time's units at their shortest ("1h 5min 5s"), for tight widgets. */
  const compactContext: TextContext = {
    ...textContext,
    durationUnits: {
      hours: translate('compactDurationUnits.hours'),
      minutes: translate('compactDurationUnits.minutes'),
      seconds: translate('compactDurationUnits.seconds'),
    },
  };
  /** A datum as a data widget without names writes it (see `plainMetricText`). */
  const plain = (metric: MetricId) => plainMetricText(activity, metric, textContext);
  /** A datum as one text, its unit after it: "11,34 km". */
  const written = (metric: MetricId): string => {
    const { value: amount, unit } = metricText(activity, metric, textContext);
    return unit === null ? amount : `${amount} ${textContext.unitLabel(unit)}`;
  };
  /**
   * A datum in words: a time in units ("1h 5min 22s"), a distance with its unit's name, as the
   * verified badge writes it ("11,34 kilometers") or before a sport's word ("11.34 kilometer
   * run"); any other datum as written.
   */
  const inWords = (metric: MetricId, words: 'verified' | 'sentence'): string => {
    const seconds =
      metric === 'movingTime' || metric === 'elapsedTime' ? metricValue(activity, metric) : null;
    if (seconds !== null) {
      return durationParts(seconds, 'seconds')
        .map(({ amount, unit }) => `${amount}${textContext.durationUnits[unit]}`)
        .join(' ');
    }
    const { value, unit } = metricText(activity, metric, textContext);
    if (unit !== 'km' && unit !== 'mi') {
      return written(metric);
    }
    return words === 'verified'
      ? translate(`widgets.verified.${unit}`, { value })
      : translate(`widgets.sentence.units.${unit}`, { value });
  };
  /** The splits in the user's unit, kilometers or miles; none without a detail. */
  const splits =
    data.detail === null
      ? []
      : textContext.unit === 'mi'
        ? data.detail.splits.imperial
        : data.detail.splits.metric;
  let wordsSize: number | undefined;
  const quotation = (kind: 'verse' | 'quote', id: string): Box => {
    const words = phraseWords(phrases, kind, id, phraseLanguage(textContext.locale));
    const box = quotationBox(fonts, style, translate, words.text, words.source);
    wordsSize = box.wordsSize;
    return box;
  };

  let hole: HitHole | undefined;
  const body = ((): Box | null => {
    switch (block.design) {
      case 'bigTrio':
      case 'bigPair':
      case 'bigSolo': {
        // A datum big, unit and all (stretched upwards in its stretched looks), and the others
        // small under it, spread across its width: the first at its start, the last at its end.
        const sizes = SIZES.big[block.layout];
        const [first, ...rest] = metrics;
        const main = capitals(
          [{ text: plain(first), size: sizes.value, bold: style.bold }],
          sizes.value,
          sizes.value * BIG.below,
          sizes.stretch,
        );
        const under = (size: number) =>
          rest.map((metric) =>
            capitals([{ text: plain(metric), size, bold: style.bold }], size, size * BIG.below),
          );
        // Smaller when they don't fit under it (a short time over three long data).
        const room = (data: readonly Box[], size: number) =>
          data.reduce((sum, box) => sum + box.width, 0) + size * BIG.minGap * (data.length - 1);
        const wanted = under(sizes.data);
        const fits = room(wanted, sizes.data) <= main.width;
        const size = fits ? sizes.data : (sizes.data * main.width) / room(wanted, sizes.data);
        const data = fits ? wanted : under(size);
        const stack =
          data.length === 0
            ? main
            : column([main, justified(data, main.width, size * BIG.minGap)], 0, 'start');
        if (block.layout === 'day' || block.layout === 'stretchedDay') {
          // The weekday as wide as the big datum, written at the size that makes it so. Not
          // stretched with it: an accent stretched upwards would float off its letter.
          const day = line(
            weekdayName,
            sizeFor(weekdayName, main.width),
            sizes.value * BIG_HEADER.dayGap,
          );
          return column([day, stack], 0, 'start');
        }
        if (block.layout === 'smallDay') {
          // The weekday small and centered over it.
          const day = line(
            weekdayName,
            sizes.value * BIG_HEADER.smallDay,
            sizes.value * BIG_HEADER.smallDayGap,
          );
          return column([day, stack], 0, 'center');
        }
        if (block.layout === 'map' && routeMap !== undefined && routeMap !== null) {
          // The route on its map over it, in a square as wide as the big datum; until the map
          // loads, the route alone, as below.
          const map = mapBox(activity, main.width, routeMap, routeStrokeFor(main.width));
          if (map !== null) {
            return column([map, stack], sizes.value * BIG_HEADER.routeGap, 'center');
          }
        }
        if (
          (block.layout === 'route' || block.layout === 'map') &&
          activity.routePolyline !== null
        ) {
          // The route over it, centered, a little narrower than the big datum.
          const route = routeBox(
            activity.routePolyline,
            main.width * BIG_HEADER.routeWidth,
            main.width * BIG_HEADER.routeHeight,
            { width: routeStrokeFor(main.width) },
          );
          return route === null
            ? stack
            : column([route, stack], sizes.value * BIG_HEADER.routeGap, 'center');
        }
        return stack;
      }
      case 'dayRoute': {
        // The weekday and the big datum as wide as each other, the route between them.
        const sizes = SIZES.dayRoute;
        const main = capitals(
          [{ text: plain(metrics[0]), size: sizes.value, bold: style.bold }],
          sizes.value,
          0,
        );
        const day = line(weekdayName, sizeFor(weekdayName, main.width), 0);
        const route =
          activity.routePolyline === null
            ? null
            : routeBox(
                activity.routePolyline,
                main.width * BIG_HEADER.routeWidth,
                main.width * BIG_HEADER.routeHeight,
                { width: routeStrokeFor(main.width) },
              );
        return column(
          route === null ? [day, main] : [day, route, main],
          sizes.value * sizes.gap,
          'center',
        );
      }
      case 'dayBetween': {
        // The short weekday between its data, half on each side, one under another: one level
        // band, the weekday's capitals as tall as two lines of data and the room between them.
        // With a datum on each side, it keeps that size, squashed to their one line.
        const sizes = SIZES.dayBetween;
        const cells = metrics.map((metric) => line(plain(metric), sizes.data, 0));
        const half = Math.ceil(cells.length / 2);
        const side = (boxes: readonly Box[]) => column(boxes, sizes.data * sizes.rowGap, 'start');
        const left = side(cells.slice(0, half));
        const capital = CAP_HEIGHTS[style.font] * (STRETCHED_FONTS[style.font] ?? 1);
        const twoLines = sizes.data * (2 * capital + sizes.rowGap);
        const weekdaySize = twoLines / capital;
        const day = line(shortWeekdayName, weekdaySize, 0, left.height / twoLines);
        // Their baselines lined up at the bottom: an accent rises over the band, not under it.
        return row([left, day, side(cells.slice(half))], sizes.data * sizes.sideGap, 'end');
      }
      case 'dayOver': {
        // The weekday wide, and under it, as wide, the sport and start time, then the data, in
        // columns of two lines.
        const sizes = SIZES.dayOver[block.layout];
        const day = line(weekdayName, sizes.weekday, sizes.weekday * DATE.headGap);
        const texts = metrics.map(plain);
        const columns: string[][] = [[sportWord, startTime]];
        for (let i = 0; i < texts.length; i += 2) {
          columns.push(texts.slice(i, i + 2));
        }
        return column([day, fitted(columns, sizes.data, day.width)], 0, 'start');
      }
      case 'dayColumns': {
        // The date on the left, the data on the right, a line each.
        const sizes = SIZES.dayColumns;
        const date = formatActivityDate(activity.startLocal, textContext.locale, 'short');
        const left = [
          weekdayName,
          date,
          startTime,
          ...(block.layout === 'four' ? [sportWord] : []),
        ];
        const lines = (texts: readonly string[]) =>
          texts.map((text) => line(text, sizes.text, sizes.text * DATE.lineGap));
        const lefts = lines(left);
        // With more text around them, a pace keeps its unit and a time is written in units.
        const rights = lines(
          metrics.map((metric) => plainMetricText(activity, metric, compactContext, 'words')),
        );
        const width =
          Math.max(...lefts.map((box) => box.width)) +
          Math.max(...rights.map((box) => box.width)) +
          sizes.text * sizes.gap;
        return column(
          lefts.map((box, i) => spread(box, rights[i], width)),
          0,
          'start',
        );
      }
      case 'dataStack': {
        // The data big, one under another, over the short weekday and start time.
        const sizes = SIZES.dataStack;
        const data = column(
          metrics.map((metric) => line(plain(metric), sizes.value, sizes.value * DATE.stackGap)),
          0,
          'center',
        );
        const footer = line(
          translate('widgets.dayAndTime', { day: shortWeekdayName, time: startTime }),
          sizes.value * sizes.footer,
          0,
        );
        return column([data, footer], sizes.value * DATE.stackGap, 'center');
      }
      case 'tower': {
        // The big datum's amount, its unit and the sport's word, one under another, tall and
        // narrow; the other two small beside the word, on their side, read upwards from its foot
        // and as long as it is tall, in the widget's letters too (but never bold); or the big
        // datum alone.
        const sizes = SIZES.tower;
        const [first, ...rest] = metrics;
        const letters =
          sizes.value *
          CAP_HEIGHTS[style.font] *
          (STRETCHED_FONTS[style.font] ?? 1) *
          sizes.stretch;
        const big = (text: string, size: number, below: number) =>
          line(text, size, below, (sizes.stretch * sizes.value) / size);
        // Short, to stay narrow: a distance to its hundreds of meters (or tenths of a mile).
        const { amount, unit } = plainMetricParts(activity, first, textContext, 1);
        const over = [amount, ...(unit === null ? [] : [textContext.unitLabel(unit)])].map((text) =>
          big(text, sizes.value, letters * sizes.gap),
        );
        // A staircase, to sit in a corner: the sport's word is the widest step, as wide as it is
        // written ("RUN" wider than "KM"). Only a long one ("CARRERA") is squeezed, up to a point,
        // to `spread` times the lines over it: written smaller and drawn taller, its capitals as
        // tall as theirs.
        const word = translate(`widgets.tower.sports.${activity.sportModality}`);
        const natural = big(word, sizes.value, 0).width;
        const widest = Math.max(...over.map((box) => box.width));
        const squeeze = Math.min(1, Math.max(sizes.squeeze, (widest * sizes.spread) / natural));
        const sport = big(word, sizes.value * squeeze, 0);
        if (block.layout === 'plain') {
          return column([...over, sport], 0, 'start');
        }
        const caption: BlockStyle = { ...style, bold: false };
        const captions = rest.map((metric) =>
          plainMetricText(activity, metric, compactContext, 'tight'),
        );
        const captionCap = CAP_HEIGHTS[style.font];
        const longest = Math.max(
          ...captions.map(
            (text) =>
              textBox(paragraph([{ text, size: FIT_SIZE, bold: false }], fonts, caption)).width,
          ),
        );
        const size = Math.min((FIT_SIZE * letters) / longest, sizes.value * sizes.sideMax);
        const lines = captions.map((text) =>
          capitals([{ text, size, bold: false }], size, size * BIG.below, 1, caption, {
            turned: true,
          }),
        );
        const data = turned(column(lines, size * captionCap * sizes.sideGap, 'start'));
        return column(
          [...over, row([sport, data], size * captionCap * sizes.sideGap, 'end')],
          0,
          'start',
        );
      }
      case 'dataLine': {
        // The data in a line, briefly: a time without its seconds. Named, as Strava writes them:
        // each under its name, aligned to their start, a pace with its unit.
        // The names, and the data, each on one baseline: cut as one, whatever their letters.
        const sizes = SIZES.dataLine;
        if (block.layout === 'namedThree' || block.layout === 'namedTwo') {
          const names = metrics.map((metric) => translate(`metrics.${metric}`));
          const values = metrics.map((metric) =>
            plainMetricText(activity, metric, compactContext, 'tight'),
          );
          return row(
            names.map((name, i) =>
              column(
                [
                  line(
                    name,
                    sizes.text * sizes.name,
                    sizes.text * sizes.nameGap,
                    1,
                    names.join(' '),
                  ),
                  line(values[i], sizes.text, 0, 1, values.join(' ')),
                ],
                0,
                'start',
              ),
            ),
            sizes.text * sizes.namedGap,
            'start',
          );
        }
        const values = metrics.map((metric) =>
          plainMetricText(activity, metric, compactContext, 'brief'),
        );
        return row(
          values.map((value) => line(value, sizes.text, 0, 1, values.join(' '))),
          sizes.text * sizes.gap,
          'start',
        );
      }
      case 'card': {
        // The data with their short names over them, three a row, on a see-through card with
        // square corners, under the activity's name in its two looks with one.
        const sizes = SIZES.card;
        const unshaded = (runs: readonly Run[], look: TextLook = {}) =>
          textBox(paragraph(runs, fonts, style, { shadow: false, ...look }));
        const cells = metrics.map((metric) =>
          column(
            [
              unshaded([
                {
                  text: translate(`widgets.cardLabels.${metric}`),
                  size: sizes.label,
                  bold: false,
                  faded: true,
                },
              ]),
              unshaded([
                {
                  text: plainMetricText(activity, metric, compactContext, 'words'),
                  size: sizes.value,
                  bold: style.bold,
                },
              ]),
            ],
            sizes.label * sizes.labelGap,
            'start',
          ),
        );
        const rows: Box[][] = [];
        for (let i = 0; i < cells.length; i += CARD_COLUMNS) {
          rows.push(cells.slice(i, i + CARD_COLUMNS));
        }
        const widths = columnWidths(rows);
        const rowHeight = Math.max(...cells.map((cell) => cell.height));
        const grid = column(
          rows.map((cellsOfRow) => tableRow(cellsOfRow, widths, sizes.columnGap, 0, rowHeight)),
          sizes.value * sizes.rowGap,
          'start',
        );
        const named = block.layout === 'nameThree' || block.layout === 'nameSix';
        const name = activity.name.trim();
        const content = named
          ? column(
              [
                unshaded(
                  [
                    {
                      text: name === '' ? sportWord : name,
                      size: sizes.title,
                      bold: true,
                    },
                  ],
                  { maxWidth: grid.width },
                ),
                grid,
              ],
              sizes.value * sizes.titleGap,
              'start',
            )
          : grid;
        return overlay(
          fillBox(
            content.width + 2 * sizes.padX,
            content.height + 2 * sizes.padY,
            0,
            softBackdrop(style.color),
            {},
          ),
          content,
        );
      }
      case 'notes': {
        // The splits as a note of the iPhone's Notes, in its font and colors.
        const rows = splitRows(splits, NOTES_ROWS);
        if (rows.length === 0) {
          return null;
        }
        const colors = NOTES_COLORS[block.layout];
        const sizes = SIZES.notes;
        const speed = speedMeasure(activity.sportFamily);
        const unit = textContext.unitLabel(textContext.unit);
        const fastest = rows.reduce(
          (best, split, i) => (split.speed > rows[best].speed ? i : best),
          0,
        );
        const written = rows.map((split, i) => {
          const texts = splitRowTexts(split, speed, textContext);
          const ink = i === fastest ? colors.accent : colors.ink;
          return {
            name: appText([{ text: `${unit} ${texts.number}`, size: sizes.row, bold: false }], ink),
            pace: appText([{ text: `- ${texts.value}`, size: sizes.row, bold: false }], ink),
          };
        });
        // Every "km n" as wide as the widest, so the dashes and the paces line up.
        const nameWidth = Math.max(...written.map((line) => line.name.width));
        const lines = written.map((line) =>
          row([widened(line.name, nameWidth, 'start'), line.pace], sizes.row * 0.25, 'start'),
        );
        const distance = metricText(activity, 'distance', textContext);
        const sport = noteSportBox(
          fonts,
          block.layout,
          translate(`modalities.${activity.sportModality}`),
          sportIcon(activity),
        );
        return noteBox(
          fonts,
          block.layout,
          distance.unit === null
            ? distance.value
            : `${distance.value} ${textContext.unitLabel(distance.unit)}`,
          lines,
          sport,
        );
      }
      case 'music': {
        // The activity as the song playing: the route as its cover, its name as the song's, and
        // its distance and time at the ends of the progress bar.
        const colors = MUSIC_COLORS[block.layout];
        const { cover, text: song, wave, bar, time, controls } = MUSIC;
        const glass = { edge: colors.edge };
        const route =
          activity.routePolyline === null
            ? null
            : routeBox(activity.routePolyline, cover.size * 0.7, cover.size * 0.7, {
                color: COVER_ROUTE,
                width: cover.route,
              });
        const art = overlay(
          fillBox(cover.size, cover.size, cover.radius, BRAND_COVER_COLORS[block.cover], {}),
          route ?? iconBox(sportIcon(activity), cover.size * 0.5, COVER_ROUTE),
        );
        // As far from the sound wave as from the cover.
        const textWidth = wave.x - song.x - (song.x - cover.x - cover.size);
        const sport = translate(`modalities.${activity.sportModality}`);
        const day = formatActivityDate(activity.startLocal, textContext.locale, 'short');
        const name = activity.name.trim();
        const texts = column(
          [
            appText(
              [{ text: name === '' ? sport : name, size: song.size, bold: true }],
              colors.ink,
              { maxWidth: textWidth },
            ),
            appText([{ text: `${sport} · ${day}`, size: song.size, bold: false }], colors.faded, {
              maxWidth: textWidth,
            }),
          ],
          0,
          'start',
        );
        const [first, second] = metrics.map((metric) =>
          appText([{ text: written(metric), size: time.size, bold: false }], colors.faded),
        );
        const hasSecond = metrics.length > 1;
        // The bar between the times, `gap` away from each, however long they are.
        const barLeft = Math.max(bar.left, time.inset + first.width + bar.gap);
        const barRight = hasSecond
          ? Math.min(bar.right, MUSIC.width - time.inset - second.width - bar.gap)
          : bar.right;
        const barWidth = barRight - barLeft;
        const barMiddle = bar.y + bar.height / 2;
        const middle = MUSIC.width / 2;
        return placed(MUSIC.width, MUSIC.height, [
          { box: fillBox(MUSIC.width, MUSIC.height, MUSIC.radius, colors.card, glass), x: 0, y: 0 },
          { box: art, x: cover.x, y: cover.y },
          { box: texts, x: song.x, y: cover.y + (cover.size - texts.height) / 2 },
          { box: symbolBox('waveform', wave.size, colors.faded), x: wave.x, y: wave.y },
          {
            box: fillBox(barWidth, bar.height, bar.height / 2, colors.track, {}),
            x: barLeft,
            y: bar.y,
          },
          {
            box: fillBox(barWidth * MUSIC_PLAYED, bar.height, bar.height / 2, colors.played, {}),
            x: barLeft,
            y: bar.y,
          },
          centeredAt(first, time.inset + first.width / 2, barMiddle),
          ...(hasSecond
            ? [centeredAt(second, MUSIC.width - time.inset - second.width / 2, barMiddle)]
            : []),
          centeredAt(
            symbolBox('backward', controls.skip, colors.dimmed),
            middle - controls.skipOffset,
            controls.y,
          ),
          centeredAt(symbolBox('pause', controls.pause, colors.ink), middle, controls.y),
          centeredAt(
            symbolBox('forward', controls.skip, colors.ink),
            middle + controls.skipOffset,
            controls.y,
          ),
          {
            box: symbolBox('airplay', controls.airplay, colors.faded),
            x: controls.airplayX,
            y: controls.y - controls.airplay / 2,
          },
        ]);
      }
      case 'camera': {
        // The sport's icon on its f button, and the route as the last photo's thumbnail; without
        // one, nothing.
        const camera = cameraBox(fonts, translate, canvas, {
          values: metrics.map(written),
          lens: (size, color) => iconBox(sportIcon(activity), size, color),
          thumbnail: (size) =>
            activity.routePolyline === null
              ? null
              : routeBox(activity.routePolyline, size, size, { color: COVER_ROUTE, width: 3 }),
          cover: block.cover ?? 'red',
        });
        hole = camera.hole;
        return camera.box;
      }
      case 'laps': {
        // The laps as a table: number, distance, time and pace (or speed).
        const rows = splitRows(data.detail?.laps ?? [], LAPS_ROWS);
        if (rows.length === 0) {
          return null;
        }
        const speed = speedMeasure(activity.sportFamily);
        const unit = textContext.unitLabel(textContext.unit);
        // "6:07/km", as AURA writes a pace; a swimmer's pace and a speed with their unit.
        const imperial = textContext.unit === 'mi';
        const after =
          speed === 'pace'
            ? `/${unit}`
            : ` ${textContext.unitLabel(speed === 'speed' ? (imperial ? 'mph' : 'km/h') : imperial ? 'min/100yd' : 'min/100m')}`;
        return lapsTableBox(fonts, block.layout, block.cover, {
          names: [
            translate('widgets.laps.lap'),
            translate('widgets.laps.distance'),
            translate('widgets.laps.time'),
            translate(speed === 'speed' ? 'widgets.laps.speed' : 'widgets.laps.pace'),
          ],
          rows: rows.map((split) => {
            const texts = splitRowTexts(split, speed, textContext);
            return { ...texts, number: texts.number.padStart(2, '0') };
          }),
          fastest: fastestIndex(rows.map((split) => split.speed)),
          unit,
          after,
          // A pace as a timing sheet writes it: 5'42".
          sheetValue: (value) => (speed === 'speed' ? value : `${value.replace(':', "'")}"`),
          title: translate('widgets.laps.title'),
        });
      }
      case 'grandPrix': {
        // The splits as a race's timing tower, in lap order: each with its pace and its gap to
        // the fastest, which carries the fastest lap's purple stopwatch instead of a tyre.
        const rows = splitRows(splits, GRAND_PRIX_ROWS);
        if (rows.length === 0) {
          return null;
        }
        const speed = speedMeasure(activity.sportFamily);
        const speeds = rows.map((split) => split.speed);
        const fastest = fastestIndex(speeds);
        const tyres = tyreCompounds(speeds);
        return timingTowerBox(fonts, {
          icon: sportIcon(activity),
          title: translate(`modalities.${activity.sportModality}`),
          // How far the race went, exactly, where TV writes the lap.
          subtitle: written('distance'),
          rows: rows.map((split, i) => {
            const texts = splitRowTexts(split, speed, textContext);
            return {
              number: texts.number,
              value: texts.value,
              gap:
                i === fastest
                  ? translate('widgets.grandPrix.leader')
                  : splitGapText(split, rows[fastest], speed, textContext),
              mark: i === fastest ? 'fastest' : tyres[i],
            };
          }),
        });
      }
      case 'alarm': {
        // The start time as an alarm, on: the sport and the main datum as its label.
        const colors = ALARM_COLORS[block.layout];
        const clock = formatActivityDate(activity.startLocal, textContext.locale, 'time');
        // "9:31 AM": the AM or PM smaller after the time, as the Clock writes it.
        const [, time = clock, meridiem] = /^(.*?)\s*([AaPp]\.?\s?[Mm]\.?)?$/u.exec(clock) ?? [];
        const timeText = appText(
          [
            { text: time, size: ALARM.time, bold: false, light: true },
            ...(meridiem === undefined
              ? []
              : [
                  {
                    text: meridiem.replace(/[\s.]/gu, '').toLocaleUpperCase(),
                    size: ALARM.meridiem,
                    bold: false,
                    light: true,
                  },
                ]),
          ],
          colors.ink,
        );
        const label = appText(
          [
            {
              text: translate('widgets.alarmLabel', {
                sport: translate(`modalities.${activity.sportModality}`),
                datum: written(metrics[0]),
              }),
              size: ALARM.label,
              bold: false,
            },
          ],
          colors.ink,
        );
        const toggle = ALARM.toggle;
        const onSwitch = placed(toggle.width, toggle.height, [
          {
            box: fillBox(toggle.width, toggle.height, toggle.height / 2, colors.on, {}),
            x: 0,
            y: 0,
          },
          centeredAt(
            discBox(toggle.height / 2 - toggle.inset, colors.knob),
            toggle.width - toggle.height / 2,
            toggle.height / 2,
          ),
        ]);
        const texts = column([timeText, label], 0, 'start');
        const width = Math.max(ALARM.minWidth, texts.width + ALARM.gap + toggle.width);
        return panel(
          placed(width, texts.height, [
            { box: texts, x: 0, y: 0 },
            centeredAt(onSwitch, width - toggle.width / 2, texts.height / 2),
          ]),
          colors.card,
          ALARM.padX,
          ALARM.padY,
          ALARM.radius,
        );
      }
      case 'location': {
        // The place where it started and the main datum, as a location sticker.
        const place = data.place === null ? null : formatPlace(data.place, 'city');
        if (place === null) {
          return null;
        }
        const colors = LOCATION_COLORS[block.layout];
        const line = translate('widgets.locationLine', { place, datum: written(metrics[0]) });
        return panel(
          row(
            [
              symbolBox('pin', LOCATION.text * LOCATION.pin, colors.ink),
              appText([{ text: line, size: LOCATION.text, bold: false }], colors.ink, {
                font: 'spaceMono',
              }),
            ],
            LOCATION.gap,
            'center',
          ),
          colors.card,
          LOCATION.padX,
          LOCATION.padY,
          LOCATION.radius,
        );
      }
      case 'verse':
        return quotation('verse', block.verse);
      case 'quote':
        return quotation('quote', block.quote);
      case 'message': {
        // The data as a sent chat message, but the time: the sport and the activity's time go
        // where the message's time goes. Without other data, the time is the message and the
        // start time goes there.
        const colors = MESSAGE_COLORS[block.layout];
        const sizes = MESSAGE_SIZES;
        const others = metrics.filter((metric) => metric !== 'movingTime');
        const footTime =
          others.length > 0 && metrics.includes('movingTime')
            ? written('movingTime')
            : formatActivityDate(activity.startLocal, textContext.locale, 'time');
        const said = others.length > 0 ? others.slice(0, 2) : metrics;
        const message = appText(
          said.map((metric, i) => {
            const written = metricText(activity, metric, textContext);
            const unit = written.unit === null ? '' : ` ${textContext.unitLabel(written.unit)}`;
            return {
              text: `${i === 0 ? '' : ', '}${written.value}${unit}`,
              size: sizes.text,
              bold: false,
            };
          }),
          colors.ink,
        );
        const meta = row(
          [
            appText(
              [
                {
                  text: translate('widgets.chatLine', {
                    sport: translate(`modalities.${activity.sportModality}`),
                    time: footTime,
                  }),
                  size: sizes.meta,
                  bold: false,
                },
              ],
              colors.meta,
            ),
            markBox('ticks', sizes.meta * 0.8, colors.ticks),
          ],
          sizes.meta * 0.3,
          'center',
        );
        return messageBubble(
          column(
            [message, widened(meta, Math.max(message.width, meta.width), 'end')],
            sizes.meta * 0.2,
            'start',
          ),
          colors.bubble,
        );
      }
      case 'splitBars': {
        // The splits as AURA's board: a bar per split as long as it took, the totals under it.
        const rows = splitRows(splits, SPLIT_BARS_ROWS);
        if (rows.length === 0) {
          return null;
        }
        const sizes = SPLIT_BARS;
        const { colors } = sizes;
        const speed = speedMeasure(activity.sportFamily);
        const wide = (content: string, size: number, bold: boolean, shadow = false) =>
          appText([{ text: content.toLocaleUpperCase(), size, bold }], colors.ink, {
            font: 'unbounded',
            shadow,
          });
        const names = spread(
          wide(translate(`widgets.splitBars.${textContext.unit}`), sizes.header, true, true),
          wide(
            translate(speed === 'speed' ? 'widgets.laps.speed' : 'widgets.laps.pace'),
            sizes.header,
            true,
            true,
          ),
          sizes.width,
        );
        // Each bar as long as what it writes: a pace by its time per unit (the slowest the
        // longest), a speed (a ride's) by itself (the fastest the longest).
        const speeds = rows.map((split) => split.speed);
        const quickest = Math.max(...speeds);
        const slowest = Math.min(...speeds);
        const share = (splitSpeed: number) =>
          slowest === quickest
            ? (sizes.shortest + sizes.longest) / 2
            : sizes.shortest +
              (sizes.longest - sizes.shortest) *
                (speed === 'speed'
                  ? lineLevel(splitSpeed, { min: slowest, max: quickest }, 'linear', 0)
                  : 1 - lineLevel(splitSpeed, { min: slowest, max: quickest }, 'pace', 0));
        const lines = rows.map((split, i) => {
          const texts = splitRowTexts(split, speed, textContext);
          const value = wide(texts.value, sizes.value, false);
          const number = wide(
            split.first === split.last ? texts.number.padStart(2, '0') : texts.number,
            sizes.number,
            true,
          );
          // Never shorter than its time.
          const bar = Math.max(sizes.width * share(speeds[i]), value.width + 2 * sizes.pad);
          return placed(sizes.width, sizes.rowHeight, [
            { box: fillBox(sizes.width, sizes.rowHeight, 0, colors.band, {}), x: 0, y: 0 },
            { box: fillBox(bar, sizes.rowHeight, 0, colors.bar, {}), x: sizes.width - bar, y: 0 },
            { box: number, x: sizes.pad * 0.7, y: sizes.pad * 0.4 },
            {
              box: value,
              x: sizes.width - sizes.pad - value.width,
              y: (sizes.rowHeight - value.height) / 2,
            },
          ]);
        });
        const total = (metric: MetricId) =>
          appText([{ text: written(metric), size: sizes.total, bold: true }], colors.ink, {
            shadow: true,
          });
        return column(
          [
            column([names, column(lines, sizes.rowGap, 'start')], sizes.headerGap, 'start'),
            spread(total('distance'), total('movingTime'), sizes.width),
          ],
          sizes.totalGap,
          'start',
        );
      }
      case 'splitLadder': {
        // The splits as a ladder of tags, each as wide as it was fast on the scale of what it
        // writes (a pace by its pace, a ride's speed as it is), the fastest in a brand color.
        const rows = splitRows(splits, SPLIT_LADDER_ROWS);
        if (rows.length === 0) {
          return null;
        }
        const sizes = SPLIT_LADDER;
        const { colors } = sizes;
        const speed = speedMeasure(activity.sportFamily);
        const speeds = rows.map((split) => split.speed);
        const fastest = fastestIndex(speeds);
        const slowest = Math.min(...speeds);
        const mono = (content: string, color: string) =>
          appText([{ text: content, size: sizes.text, bold: false }], color, { font: 'spaceMono' });
        const cells = rows.map((split, i) => {
          const texts = splitRowTexts(split, speed, textContext);
          const ink = i === fastest ? colors.chosen : colors.ink;
          return { number: mono(texts.number, ink), value: mono(texts.value, ink) };
        });
        const narrowest =
          2 * sizes.padX +
          Math.max(...cells.map((cell) => cell.number.width)) +
          sizes.gap +
          Math.max(...cells.map((cell) => cell.value.width));
        const tags = cells.map((cell, i) => {
          const share =
            speeds[fastest] === slowest
              ? 1
              : lineLevel(
                  speeds[i],
                  { min: slowest, max: speeds[fastest] },
                  speed === 'speed' ? 'linear' : 'pace',
                  0,
                );
          const width = narrowest * (1 + (sizes.stretch - 1) * share);
          const middle = (box: Box) => (sizes.rowHeight - box.height) / 2;
          return placed(width, sizes.rowHeight, [
            {
              box: fillBox(
                width,
                sizes.rowHeight,
                sizes.radius,
                i === fastest ? BRAND_COVER_COLORS[block.cover] : colors.tag,
              ),
              x: 0,
              y: 0,
            },
            { box: cell.number, x: sizes.padX, y: middle(cell.number) },
            { box: cell.value, x: width - sizes.padX - cell.value.width, y: middle(cell.value) },
          ]);
        });
        const title = appText(
          [{ text: translate('widgets.splitLadder.title'), size: sizes.title, bold: false }],
          colors.title,
          { font: 'spaceMono', shadow: true },
        );
        return column([title, column(tags, sizes.rowGap, 'start')], sizes.titleGap, 'start');
      }
      case 'records': {
        // A run's best efforts as the ladder's tags, all as wide (and as its title): each its
        // distance and its time, and the athlete's records (first, second, third best) in a brand
        // color, their rank at the end; all of them, or the records alone on their podium.
        const efforts = recordRows(data.detail?.bestEfforts ?? [])[block.layout];
        if (efforts.length === 0) {
          return null;
        }
        const sizes = SPLIT_LADDER;
        const { colors } = sizes;
        const mono = (content: string, color: string) =>
          appText([{ text: content, size: sizes.text, bold: false }], color, { font: 'spaceMono' });
        const RANKS = { 1: 'first', 2: 'second', 3: 'third' } as const;
        const cells = efforts.map((effort) => {
          const ink = effort.prRank === null ? colors.ink : colors.chosen;
          return {
            ranked: effort.prRank !== null,
            name: mono(bestEffortName(effort, textContext, translate), ink),
            time: mono(formatDuration(effort.elapsedTimeSeconds), ink),
            rank:
              effort.prRank === null
                ? null
                : mono(translate(`widgets.records.ranks.${RANKS[effort.prRank]}`), ink),
          };
        });
        const widest = (boxes: readonly (Box | null)[]) =>
          Math.max(0, ...boxes.map((box) => box?.width ?? 0));
        const nameWidth = widest(cells.map((cell) => cell.name));
        const timeWidth = widest(cells.map((cell) => cell.time));
        const rankWidth = widest(cells.map((cell) => cell.rank));
        // The times right-aligned in their column, so their digits line up.
        const timeRight = sizes.padX + nameWidth + sizes.gap + timeWidth;
        const title = appText(
          [{ text: translate(`widgets.records.${block.layout}`), size: sizes.title, bold: false }],
          colors.title,
          { font: 'spaceMono', shadow: true },
        );
        // Never narrower than its title: a short table under a long title looked cut off.
        const width = Math.max(
          timeRight + (rankWidth > 0 ? sizes.gap + rankWidth : 0) + sizes.padX,
          title.width,
        );
        const middle = (box: Box) => (sizes.rowHeight - box.height) / 2;
        const tags = cells.map((cell) =>
          placed(width, sizes.rowHeight, [
            {
              box: fillBox(
                width,
                sizes.rowHeight,
                sizes.radius,
                cell.ranked ? BRAND_COVER_COLORS[block.cover] : colors.tag,
              ),
              x: 0,
              y: 0,
            },
            { box: cell.name, x: sizes.padX, y: middle(cell.name) },
            { box: cell.time, x: timeRight - cell.time.width, y: middle(cell.time) },
            ...(cell.rank === null
              ? []
              : [
                  { box: cell.rank, x: width - sizes.padX - cell.rank.width, y: middle(cell.rank) },
                ]),
          ]),
        );
        return column([title, column(tags, sizes.rowGap, 'start')], sizes.titleGap, 'start');
      }
      case 'verified': {
        // The main datum in words, verified.
        const color = VERIFIED_COLORS[block.layout];
        const badge = VERIFIED.text * VERIFIED.badge;
        return row(
          [
            appText(
              [{ text: inWords(metrics[0], 'verified'), size: VERIFIED.text, bold: true }],
              color,
              {
                shadow: true,
              },
            ),
            overlay(
              symbolBox('badge', badge, VERIFIED.blue),
              symbolBox('check', badge, VERIFIED.check),
            ),
          ],
          VERIFIED.text * VERIFIED.gap,
          'center',
        );
      }
      case 'chat': {
        // A phrase as a sent chat message: the second datum where the time goes, the main one by
        // the read ticks.
        wordsSize = CHAT.text;
        const colors = MESSAGE_COLORS[block.layout];
        const said = appText(
          [
            {
              text:
                typeof block.phrase === 'string'
                  ? phraseWords(phrases, 'chat', block.phrase, phraseLanguage(textContext.locale))
                      .text
                  : block.phrase.own,
              size: CHAT.text,
              bold: false,
            },
          ],
          colors.ink,
          { wrapWidth: CHAT.wrap, wrapStart: true },
        );
        const meta = (metric: MetricId) =>
          appText([{ text: written(metric), size: CHAT.meta, bold: false }], colors.meta);
        const read = row(
          [meta(metrics[0]), markBox('ticks', CHAT.meta * 0.8, colors.ticks)],
          CHAT.meta * 0.3,
          'center',
        );
        const line =
          metrics.length > 1
            ? (() => {
                const other = meta(metrics[1]);
                return spread(
                  other,
                  read,
                  Math.max(said.width, other.width + CHAT.metaGap + read.width),
                );
              })()
            : widened(read, said.width, 'end');
        return messageBubble(column([said, line], CHAT.meta * 0.2, 'start'), colors.bubble);
      }
      case 'sentence': {
        // The activity as a sentence typed on paper, its data highlighted.
        const place = data.place === null ? null : formatPlace(data.place, 'cityRegion');
        const plan = sentencePlan(activity, place !== null);
        if (plan === null) {
          return null;
        }
        const values: Readonly<Record<string, SentencePart>> = {
          // Before a sport's own word, the distance reads as one word with it ("11.34 kilometer
          // run"); before a sport's name, it is a number of kilometers.
          distance: markedPart(
            inWords('distance', plan.lead.lead === 'distance' ? 'verified' : 'sentence'),
          ),
          time: markedPart(inWords('movingTime', 'sentence')),
          sport: {
            text: translate(`modalities.${activity.sportModality}`).toLocaleLowerCase(
              textContext.locale,
            ),
            marked: false,
          },
          place: { text: place ?? '', marked: false },
          ...Object.fromEntries(
            plan.clauses.flatMap(({ clause, metric }) =>
              metric === null || clause === 'time' ? [] : [[clause, markedPart(written(metric))]],
            ),
          ),
        };
        return highlightedSentenceBox(
          fonts,
          sentenceParts(
            (holders) => [
              translate(`widgets.sentence.leads.${plan.lead.lead}`, holders),
              ...plan.clauses.map(({ clause }) =>
                translate(`widgets.sentence.clauses.${clause}`, holders),
              ),
              translate('widgets.sentence.end'),
            ],
            values,
          ),
        );
      }
      case 'receipt': {
        // The data as a shop's receipt: a line each, the main datum as the total.
        const name = activity.name.trim();
        return receiptBox(fonts, {
          header: [
            ...(name === '' ? [] : [name]),
            [
              formatActivityDate(activity.startLocal, textContext.locale, 'numeric'),
              formatActivityDate(activity.startLocal, textContext.locale, 'time'),
            ].join('  '),
          ],
          items: metrics.map((metric) => ({
            name: translate(`metrics.${metric}`),
            value: written(metric),
          })),
          totals: [{ name: translate('widgets.receipt.total'), value: written(metrics[0]) }],
          thanks: translate('widgets.receipt.thanks'),
          seed: activity.id,
        });
      }
      case 'boardingPass': {
        // The activity as a flight from its start to its finish, in the city it started in.
        const departure = formatActivityDate(activity.startLocal, textContext.locale, 'time');
        const arrival = formatTimeAfter(
          activity.startLocal,
          activity.elapsedTimeSeconds,
          textContext.locale,
        );
        const distance = metrics.includes('distance')
          ? metricText(activity, 'distance', textContext)
          : null;
        const unit =
          distance === null || distance.unit === null ? null : textContext.unitLabel(distance.unit);
        // Its band names the city it started in, as a pass names its destination; while the
        // place is unknown, it says what it is.
        const city = data.place === null ? null : formatPlace(data.place, 'city');
        return boardingPassBox(fonts, block.cover, {
          title: city ?? translate('widgets.boardingPass.title'),
          mark: sportIcon(activity),
          // From no distance at the start to all of it at the finish, under their times; without
          // a distance, the times alone.
          departure:
            distance === null
              ? { big: departure, unit: null, under: null }
              : { big: '0', unit, under: departure },
          arrival:
            distance === null
              ? { big: arrival, unit: null, under: null }
              : { big: distance.value, unit, under: arrival },
          names: {
            departure: translate('widgets.boardingPass.departure'),
            arrival: translate('widgets.boardingPass.arrival'),
          },
          fields: [
            {
              name: translate('widgets.boardingPass.date'),
              value: formatActivityDate(activity.startLocal, textContext.locale, 'short'),
            },
            ...metrics
              .filter((metric) => metric !== 'distance')
              .slice(0, 3)
              .map((metric) => ({ name: translate(`metrics.${metric}`), value: written(metric) })),
          ],
          seed: activity.id,
        });
      }
      case 'equivalences':
        // Its data as things anyone pictures: marathons, Eiffel Towers, matches, burgers.
        return equivalencesBox(
          fonts,
          equivalenceLines(activityEquivalences(activity), textContext, translate),
          block.layout,
          translate,
        );
      case 'nutrition':
        // The activity as a food's nutrition label: its calories as energy, its data as nutrients.
        return nutritionLabelBox(
          fonts,
          activityNutrition(data, textContext, translate),
          block,
          translate,
        );
    }
  })();
  if (body === null) {
    return null;
  }

  // A replica is the app's own view: no signature under it.
  const finished = finishBlock(body, layer, !isAppReplica(block.design), hole);
  return wordsSize === undefined ? finished : { ...finished, wordsSize };
}
