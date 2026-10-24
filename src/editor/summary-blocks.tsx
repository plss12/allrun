import { Skia } from '@shopify/react-native-skia';

import { familyTotals } from '@/core/summary';
import { periodTotals, summaryMetricValue } from '@/core/summary-metrics';
import type { Layer } from '@/core/template';

import {
  type BlockContext,
  type Box,
  capitalsBox,
  column,
  FADED_ALPHA,
  finishBlock,
  hairlineBox,
  placed,
  type PreparedBlock,
  row,
} from './activity-blocks';
import {
  periodTable,
  periodTitle,
  plainSummaryText,
  type SummaryData,
  type TextContext,
} from './editor-data';

/**
 * The data widgets of a period summary (R2c), laid out from measured texts as the activities'
 * data widgets are (see `activity-blocks.tsx`), in the user's lettering: the period's name over
 * its main totals, its table of days, weeks or months, and its total per sport.
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
} as const;

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
          plainSummaryText(metric, summaryMetricValue(data.summary, metric) ?? 0, compact),
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
        // The header and the total stand out: bold and at full strength, as big as the rows' names; the
        // rows' names are fainter, as a card's names of data.
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
        // when it has none.
        const sizes = SIZES.periodSports;
        const sports = familyTotals(data.activities);
        if (sports.length < 2) {
          return null;
        }
        const names = sports.map((sport) => translate(`families.${sport.family}`));
        const totals = sports.map((sport) =>
          sport.distanceMeters > 0
            ? plainSummaryText('totalDistance', sport.distanceMeters, compact)
            : plainSummaryText('totalMovingTime', sport.movingTimeSeconds, compact),
        );
        // The names, and the totals, cut as one: an accent ("NATACIÓN") opens no wider gap.
        const shared = [title, ...names].join(' ');
        const text = (value: string, below: number, all: string) =>
          line(value, sizes.text, below, all);
        return column(
          [
            text(title, sizes.text * BELOW, shared),
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
    }
  })();
  return body === null ? null : finishBlock(body, layer, true);
}
