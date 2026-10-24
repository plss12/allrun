import { listsNoteActivities, periodSentencePlan } from '@/core/summary-block';
import { toDisplaySummaryMetric } from '@/core/summary-metrics';
import { durationParts } from '@/core/units';
import { formatMetric } from '@/ui/format';
import type { SummaryBlock } from '@/core/template';

import {
  appTextBox,
  type BlockContext,
  type Box,
  discBox,
  highlightedSentenceBox,
  markedPart,
  noteBox,
  NOTES_COLORS,
  NOTES_SIZES,
  noteSportBox,
  iconBox,
  overlay,
  row,
  type SentencePart,
  sentenceParts,
  symbolBox,
} from './activity-blocks';
import { periodName, periodNoteLines, type SummaryData } from './editor-data';

/**
 * The creative widgets of a period summary (R2c): replicas of apps, as an activity's (see
 * `activity-blocks.tsx`), in the apps' own fonts and colors, with the period's data.
 */

/**
 * A checklist's box beside each line of a note: its diameter, a share of the line's size; an
 * empty one's ring, a share of its diameter; the room after it, a share of the line's size. A
 * day's sports' icons after it, and the room before and between them, shares of its size too.
 */
const NOTE_CHECK = { size: 0.95, ring: 0.08, gap: 0.45, icon: 0.95, iconGap: 0.2 } as const;

/** The ring of a box not ticked off yet, in the Notes' dark and light mode. */
const NOTE_RING = { dark: '#5E5E62', light: '#C7C7CC' } as const;

/**
 * A period's note of the iPhone's Notes, as a checklist of what it got done (see
 * `periodNoteLines`): its name as the title (and its sport at the end of the bar, as an activity's
 * note, when it is of one), and a line per activity, or per day, week or month, each ticked off in
 * the accent's round box or left empty, the longest in the accent, a day with its sports' icons. A
 * period
 * whose activities a note doesn't list (see `listsNoteActivities`) lists its days, weeks or months
 * instead (a design saved with a week's activities, used for a year).
 */
export function periodNotesBox(
  block: Extract<SummaryBlock, { design: 'periodNotes' }>,
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box {
  const colors = NOTES_COLORS[block.layout];
  const size = NOTES_SIZES.row;
  const diameter = size * NOTE_CHECK.size;
  const rows =
    block.rows === 'activities' && listsNoteActivities(data.summary) ? 'activities' : 'buckets';
  const lines = periodNoteLines(data, rows, textContext, translate).map((line) => {
    const check = line.checked
      ? overlay(discBox(diameter / 2, colors.accent), symbolBox('check', diameter, colors.page))
      : discBox(diameter / 2, NOTE_RING[block.layout], diameter * NOTE_CHECK.ring);
    const ink = line.highlighted ? colors.accent : colors.ink;
    const text = appTextBox(fonts, [{ text: line.text, size, bold: false }], ink);
    const icons = line.sports.map((sport) => iconBox(sport, size * NOTE_CHECK.icon, ink));
    return row(
      [
        check,
        icons.length === 0
          ? text
          : row([text, row(icons, size * NOTE_CHECK.iconGap, 'center')], size * 0.3, 'center'),
      ],
      size * NOTE_CHECK.gap,
      'center',
    );
  });
  const [sport] = data.families;
  return noteBox(
    fonts,
    block.layout,
    periodName(data, textContext, translate),
    lines,
    data.families.length === 1
      ? noteSportBox(fonts, block.layout, translate(`families.${sport}`), sport)
      : undefined,
  );
}

/**
 * A period as a sentence typed on paper, as an activity's, its totals highlighted (see
 * `periodSentencePlan`): "Esta semana: 94,23 kilómetros y 7h 18min en movimiento en 6
 * actividades." Its distance in words, and its time down to its minutes.
 */
export function periodSentenceBox(
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box {
  const { summary } = data;
  const plan = periodSentencePlan(summary);
  const distance = formatMetric(
    toDisplaySummaryMetric('totalDistance', summary.totalDistanceMeters, textContext.unit),
    textContext.locale,
  );
  const values: Readonly<Record<string, SentencePart>> = {
    period: { text: periodName(data, textContext, translate), marked: false },
    distance: markedPart(
      distance.unit === 'km' || distance.unit === 'mi'
        ? translate(`widgets.verified.${distance.unit}`, { value: distance.value })
        : distance.value,
    ),
    time: markedPart(
      durationParts(summary.totalMovingTimeSeconds, 'minutes')
        .map(({ amount, unit }) => `${amount}${textContext.durationUnits[unit]}`)
        .join(' '),
    ),
    count: markedPart(
      summary.activityCount === 1
        ? translate('widgets.periodSentence.activityOne')
        : translate('widgets.periodSentence.activities', { number: String(summary.activityCount) }),
    ),
  };
  return highlightedSentenceBox(
    fonts,
    sentenceParts(
      (holders) => [
        translate('widgets.periodSentence.opening', holders),
        translate(`widgets.periodSentence.leads.${plan.lead}`, holders),
        ...plan.clauses.map((clause) =>
          translate(`widgets.periodSentence.clauses.${clause}`, holders),
        ),
        translate('widgets.sentence.end'),
      ],
      values,
    ),
  );
}
