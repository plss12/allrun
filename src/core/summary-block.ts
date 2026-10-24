import type { BlockLettering } from './activity-block';
import type { DateRange } from './dates';
import { bucketCount } from './periods';
import type { BucketSize, PeriodSummary } from './summary';
import { periodTotals, summaryHasDistance } from './summary-metrics';
import type { SummaryBlock } from './template';

/**
 * The data widgets of a period summary (R2c): its name over its main totals, a table of its days,
 * weeks or months, and its total per sport. They write the period's own data only, as its charts
 * do, for a week, a month, a year or a custom range alike.
 */

/** Most rows a period's table holds: a year's months. */
export const MAX_TABLE_ROWS = 12;

/**
 * What each row of a period's table is: the finest of days, weeks or months that gives at most
 * {@link MAX_TABLE_ROWS} rows, so a week's rows are its days, a month's its weeks and a year's its
 * months. Time and space O(1).
 */
export function tableBucket(range: DateRange): BucketSize {
  return (
    (['day', 'week'] as const).find((size) => bucketCount(range, size) <= MAX_TABLE_ROWS) ?? 'month'
  );
}

/**
 * The data widgets a period fills, in the gallery's order: its name over one, two and three of its
 * main totals (as many as it has, see `periodTotals`); its table of distance (only when it has
 * some) and of time; and its total per sport, only when it mixes two sports or more (with one, it
 * would repeat the first). None for a period without activities. Time O(1).
 */
export function summaryBlocks(summary: PeriodSummary): SummaryBlock[] {
  if (summary.activityCount === 0) {
    return [];
  }
  const totals = periodTotals(summary).length;
  const values = summaryHasDistance(summary)
    ? (['distance', 'movingTime'] as const)
    : (['movingTime'] as const);
  return [
    ...([1, 2, 3] as const)
      .filter((count) => count <= totals)
      .map((count): SummaryBlock => ({ design: 'periodData', count })),
    ...values.map((value): SummaryBlock => ({ design: 'periodTable', value })),
    ...(summary.families.length >= 2 ? [{ design: 'periodSports' } as const] : []),
  ];
}

/**
 * The lettering each summary widget starts in, one its own among them, picked by drawing
 * candidates: the period's data in a wide, heavy letter (Unbounded, as the example it copies), its
 * table in a clean one that reads well in a column of numbers (Inter), and its sports in a heavy
 * one, low and wide and drawn taller (Bowlby One SC, the user's pick).
 */
export function summaryBlockLettering(block: SummaryBlock): BlockLettering {
  switch (block.design) {
    case 'periodData':
      return { font: 'unbounded', bold: true, italic: false, uppercase: true };
    case 'periodTable':
      return { font: 'inter', bold: true, italic: false, uppercase: true };
    case 'periodSports':
      return { font: 'bowlbyOneSC', bold: false, italic: false, uppercase: true };
  }
}
