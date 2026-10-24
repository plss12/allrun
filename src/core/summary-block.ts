import type { Activity } from './activity';
import type { BlockLettering } from './activity-block';
import { type DateRange, rangeLength } from './dates';
import { bucketCount } from './periods';
import type { SportFamily } from './sports';
import type { BucketSize, PeriodSummary } from './summary';
import { periodTotals, summaryHasDistance } from './summary-metrics';
import { APP_MODES, QUOTES, type SummaryBlock, type SummaryBlockDesign, VERSES } from './template';

/**
 * The widgets of a period summary (R2c): its data widgets (its name over its main totals, a table
 * of its days, weeks or months, its total per sport (written, with icons or on cards), its days'
 * activities and its activities with their routes) and its creative ones (phrases and replicas of
 * apps), in the order of an activity's. They write the period's own data only, as its charts do,
 * for a week, a month, a year or a custom range alike, but those listing activities one by one.
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

/** Most activities a note lists one by one: a week's or a month's, rarely a year's. */
export const MAX_NOTES_ACTIVITIES = 16;

/** Designs that recreate an app: its colors, font and icons are the app's (see `isAppReplica`). */
const SUMMARY_REPLICAS: ReadonlySet<SummaryBlockDesign> = new Set([
  'periodSentence',
  'periodNotes',
]);

/** A summary's data widgets: its data in a lettering the user can change. */
const SUMMARY_DATA_WIDGETS: ReadonlySet<SummaryBlockDesign> = new Set([
  'periodData',
  'periodTable',
  'periodSports',
  'periodIcons',
  'periodCards',
  'periodRoutes',
]);

/**
 * Whether a summary's design is a data widget, as an activity's (see `isDataWidget`), as opposed
 * to the creative ones (phrases and replicas of apps), which the gallery shows apart.
 */
export function isSummaryDataWidget(design: SummaryBlockDesign): boolean {
  return SUMMARY_DATA_WIDGETS.has(design);
}

/**
 * Whether a period's note lists its activities one by one: only a week's (or a shorter range's),
 * and only up to {@link MAX_NOTES_ACTIVITIES}; a month lists its weeks and a year its months,
 * whatever its sport and however few its activities. Time O(1).
 */
export function listsNoteActivities(summary: PeriodSummary): boolean {
  return (
    rangeLength(summary.range) <= MAX_DAYS_LISTED && summary.activityCount <= MAX_NOTES_ACTIVITIES
  );
}

/**
 * Whether a summary's design recreates another app, as an activity's replicas do: only its
 * opacity can change, and the gallery shows it with the creative widgets.
 */
export function isSummaryReplica(design: SummaryBlockDesign): boolean {
  return SUMMARY_REPLICAS.has(design);
}

/**
 * How a period's highlighted sentence opens, after the period's name: with its distance, said by
 * its sport when it has one (`run`: "94,23 kilómetros corriendo"), or with its time without a
 * distance (`training`: "3h 20min entrenando").
 */
export type PeriodSentenceLead =
  'run' | 'ride' | 'walk' | 'swim' | 'distance' | 'training' | 'time';

/** What a period's highlighted sentence says after its lead, in this order. */
export type PeriodSentenceClause = 'time' | 'count';

/** A period's highlighted sentence: its lead, then its clauses. */
export interface PeriodSentencePlan {
  readonly lead: PeriodSentenceLead;
  readonly clauses: readonly PeriodSentenceClause[];
}

/** How a period of one family opens its sentence with its distance: by its verb when it has one. */
const DISTANCE_LEADS: Readonly<Record<SportFamily, PeriodSentenceLead>> = {
  run: 'run',
  ride: 'ride',
  walk: 'walk',
  swim: 'swim',
  training: 'distance',
  other: 'distance',
};

/**
 * The sentence that tells a period, as an activity's (see `sentencePlan`): "Esta semana: 94,23
 * kilómetros y 7h 18min en movimiento en 6 actividades." It opens with its distance, said by its
 * sport when it has only one that says it ("corriendo"), and its time; or with its time alone
 * without any distance ("entrenando" for gym sessions alone); then how many activities. Never its
 * elevation gain, which means little over sports as different as a ride and a swim. Time O(1).
 */
export function periodSentencePlan(summary: PeriodSummary): PeriodSentencePlan {
  const [sport] = summary.families;
  const single = summary.families.length === 1 ? sport : null;
  if (summaryHasDistance(summary)) {
    return {
      lead: single === null ? 'distance' : DISTANCE_LEADS[single],
      clauses: [...(summary.totalMovingTimeSeconds > 0 ? (['time'] as const) : []), 'count'],
    };
  }
  return {
    lead: single === 'training' ? 'training' : 'time',
    clauses: ['count'],
  };
}

/** A line of a note listing a period's activities, and whether it stands out in the accent. */
export interface NoteActivity {
  readonly activity: Activity;
  readonly highlighted: boolean;
}

/**
 * Whether `a` went further than `b`, or longer when neither went any distance (a gym session), so
 * a sport's longest activity is found as the summary finds the period's.
 */
function longer(a: Activity, b: Activity): boolean {
  return a.distanceMeters !== b.distanceMeters
    ? a.distanceMeters > b.distanceMeters
    : a.movingTimeSeconds > b.movingTimeSeconds;
}

/**
 * A period's activities as its note lists them, oldest first, with the longest of each sport that
 * has two or more highlighted, as the example the note copies (its longest run and workout): a
 * sport done once has nothing to beat. Time O(n log n) for n activities, space O(n).
 */
export function noteActivities(activities: readonly Activity[]): NoteActivity[] {
  const ordered = [...activities].sort((a, b) => a.startLocal.localeCompare(b.startLocal));
  const longest = new Map<string, Activity>();
  const count = new Map<string, number>();
  for (const activity of ordered) {
    const best = longest.get(activity.sportFamily);
    if (best === undefined || longer(activity, best)) {
      longest.set(activity.sportFamily, activity);
    }
    count.set(activity.sportFamily, (count.get(activity.sportFamily) ?? 0) + 1);
  }
  return ordered.map((activity) => ({
    activity,
    highlighted:
      (count.get(activity.sportFamily) ?? 0) >= 2 && longest.get(activity.sportFamily) === activity,
  }));
}

/**
 * The data widgets a period fills, in the gallery's order: its name over one, two and three of its
 * main totals (as many as it has, see `periodTotals`); its table of distance (only when it has
 * some) and of time; its total per sport, written and with icons, only when it mixes two sports or
 * more (with one, it would repeat the first); its days with their activities' icons, only for a
 * week or shorter; its activities with their routes, one by one only up to a month (a year has
 * too many) and overlaid (its main sport's icon, without any route), after its card per sport, as
 * an activity's card comes before its widgets with the route. Then its creative ones, in the order
 * of an activity's: the first quote and verse (the others are chosen from their lists); its
 * highlighted sentence; its note,
 * in dark and light mode, of its activities (only a week's, see `listsNoteActivities`) and of its
 * days, weeks or months. None for a period without activities. Time O(1).
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
    { design: 'periodCards' },
    ...(days <= MAX_ROUTES_DAYS ? [{ design: 'periodRoutes', layout: 'grid' } as const] : []),
    { design: 'periodRoutes', layout: 'overlay' },
    { design: 'quote', quote: QUOTES[0] },
    { design: 'verse', verse: VERSES[0] },
    { design: 'periodSentence' },
    ...(['activities', 'buckets'] as const)
      .filter((rows) => rows === 'buckets' || listsNoteActivities(summary))
      .flatMap((rows) =>
        APP_MODES.map((layout): SummaryBlock => ({ design: 'periodNotes', layout, rows })),
      ),
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
    case 'quote':
    case 'verse':
      // A quotation, in a serif italic, as an activity's.
      return { font: 'playfairDisplay', bold: false, italic: true, uppercase: false };
    // A replica writes in its app's font whatever the layer's.
    case 'periodSentence':
    case 'periodNotes':
      return { font: 'inter', bold: false, italic: false, uppercase: false };
  }
}
