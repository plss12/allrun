import type { BlockLettering } from './activity-block';
import { type DateRange, rangeLength } from './dates';
import { bucketCount } from './periods';
import type { BucketSize, PeriodSummary } from './summary';
import { periodTotals, summaryHasDistance } from './summary-metrics';
import type { SummaryBlock } from './template';

/**
 * The data widgets of a period summary (R2c): its name over its main totals, a table of its days,
 * weeks or months, its total per sport (written, with icons or on cards), its days' activities and
 * its activities with their routes. They write the period's own data only, as its charts do, for
 * a week, a month, a year or a custom range alike, but those listing activities one by one.
 */

/** Longest period whose activities are drawn one by one with their routes: a month. */
export const MAX_ROUTES_DAYS = 31;

/** Longest period whose days are listed with their activities: a week. */
export const MAX_DAYS_LISTED = 7;

/** Most columns of a grid of activities. */
export const MAX_GRID_COLUMNS = 6;

/** Most rows a grid of activities has before it takes another column. */
const ROWS_PER_COLUMN = 3;

/**
 * Columns of a grid of `count` activities: two for a few (up to six), then one more for each
 * three more (3 for 7, 4 for 10, 5 for 13), up to {@link MAX_GRID_COLUMNS}, after which the rows
 * grow (a month of 30 has 6 columns of 5); one alone has one. Time and space O(1).
 */
export function gridColumns(count: number): number {
  if (count <= 1) {
    return 1;
  }
  return Math.min(MAX_GRID_COLUMNS, Math.max(2, Math.ceil(count / ROWS_PER_COLUMN)));
}

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
 * some) and of time; its total per sport, written and with icons, only when it mixes two sports or
 * more (with one, it would repeat the first); its days with their activities' icons, only for a
 * week or shorter; its activities with their routes, one by one only up to a month (a year has
 * too many) and overlaid (its main sport's icon, without any route); and a card per sport. None for a period without activities. Time O(1).
 */
export function summaryBlocks(summary: PeriodSummary): SummaryBlock[] {
  if (summary.activityCount === 0) {
    return [];
  }
  const totals = periodTotals(summary).length;
  const mixed = summary.families.length >= 2;
  const days = rangeLength(summary.range);
  const values = summaryHasDistance(summary)
    ? (['distance', 'movingTime'] as const)
    : (['movingTime'] as const);
  return [
    ...([1, 2, 3] as const)
      .filter((count) => count <= totals)
      .map((count): SummaryBlock => ({ design: 'periodData', count })),
    ...values.map((value): SummaryBlock => ({ design: 'periodTable', value })),
    ...(mixed ? [{ design: 'periodSports' } as const] : []),
    ...(mixed ? [{ design: 'periodIcons', layout: 'sports' } as const] : []),
    ...(days <= MAX_DAYS_LISTED ? [{ design: 'periodIcons', layout: 'days' } as const] : []),
    ...(days <= MAX_ROUTES_DAYS ? [{ design: 'periodRoutes', layout: 'grid' } as const] : []),
    { design: 'periodRoutes', layout: 'overlay' },
    { design: 'periodCards' },
  ];
}

/**
 * The lettering each summary widget starts in, one its own among them, picked by drawing
 * candidates: the period's data in a wide, heavy letter (Unbounded, as the example it copies), its
 * table in a clean one that reads well in a column of numbers (Inter), its sports in a heavy one,
 * low and wide and drawn taller (Bowlby One SC, the user's pick), and with icons in a wide, low one
 * (Unbounded, as the examples it copies: Anton was too tall and coarse); its activities with
 * their routes as the activities' route with a big datum (Unbounded, the user's pick); its cards in the wide one of the example they copy (Unbounded, in small letters).
 */
export function summaryBlockLettering(block: SummaryBlock): BlockLettering {
  switch (block.design) {
    case 'periodData':
      return { font: 'unbounded', bold: true, italic: false, uppercase: true };
    case 'periodTable':
      return { font: 'inter', bold: true, italic: false, uppercase: true };
    case 'periodSports':
      return { font: 'bowlbyOneSC', bold: false, italic: false, uppercase: true };
    case 'periodIcons':
      return { font: 'unbounded', bold: true, italic: false, uppercase: true };
    case 'periodRoutes':
      return { font: 'unbounded', bold: true, italic: false, uppercase: true };
    case 'periodCards':
      return { font: 'unbounded', bold: false, italic: false, uppercase: false };
  }
}
