import type { Activity } from './activity';
import { addDays, type DateRange, isInRange, monthRange, toEpochDay } from './dates';
import { SPORT_FAMILIES, type SportFamily, type SportModality } from './sports';

/**
 * Which sports a summary includes: an activity passes when its family or its modality is listed,
 * so "all running" and "running plus hikes" are both expressible. Without either list, every
 * activity is included.
 */
export interface SummaryFilter {
  readonly families?: readonly SportFamily[];
  readonly modalities?: readonly SportModality[];
}

/** Aggregated totals for a period: what a weekly, monthly or yearly summary widget shows. */
export interface PeriodSummary {
  readonly range: DateRange;
  readonly activityCount: number;
  readonly totalDistanceMeters: number;
  readonly totalMovingTimeSeconds: number;
  readonly totalElevationGainMeters: number;
  /**
   * Distance over moving time of the activities that have distance, so a gym session doesn't
   * drag the pace down; `null` when none has distance.
   */
  readonly averageSpeed: number | null;
  /** Longest by distance, or by moving time when no activity has distance. */
  readonly longestActivity: Activity | null;
  /** Encoded routes of the included activities, oldest first, for the overlaid-routes widget. */
  readonly routes: readonly string[];
  /** The sport families of its activities, in the usual order (see `familiesOf`). */
  readonly families: readonly SportFamily[];
}

/** What a period's activities of one sport family add up to. */
export interface FamilyTotals {
  readonly family: SportFamily;
  readonly activityCount: number;
  readonly distanceMeters: number;
  readonly movingTimeSeconds: number;
  /** Their calories, `null` when none of them has any. */
  readonly calories: number | null;
}

/** Totals of one bar in the per-day, per-week or per-month chart. */
export interface SummaryBucket {
  readonly range: DateRange;
  readonly activityCount: number;
  readonly distanceMeters: number;
  readonly movingTimeSeconds: number;
}

/**
 * Bar size of the summary chart:
 * - `day`: one bar per day.
 * - `week`: consecutive 7-day blocks counted from the range start, so week 1 of a training block
 *   starts on the block's first day; the last block may be shorter.
 * - `month`: calendar months, clipped to the range.
 */
export type BucketSize = 'day' | 'week' | 'month';

/** Activities inside `range` that pass `filter`, oldest first. */
export function selectActivities(
  activities: readonly Activity[],
  range: DateRange,
  filter: SummaryFilter = {},
): Activity[] {
  return activities
    .filter((activity) => isInRange(activity.localDate, range) && matchesSport(activity, filter))
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

function matchesSport(activity: Activity, { families, modalities }: SummaryFilter): boolean {
  if (families === undefined && modalities === undefined) {
    return true;
  }
  return (
    (families?.includes(activity.sportFamily) ?? false) ||
    (modalities?.includes(activity.sportModality) ?? false)
  );
}

/**
 * The families the activities belong to, in the usual order (running, cycling, walking,
 * swimming, training, other), each once. Time O(n), space O(1).
 */
export function familiesOf(activities: readonly Activity[]): SportFamily[] {
  const present = new Set(activities.map((activity) => activity.sportFamily));
  return SPORT_FAMILIES.filter((family) => present.has(family));
}

/** A page of a period's summary card: all sports together, or one family. */
export type SummaryPage = 'all' | SportFamily;

/**
 * The pages a period's summary card scrolls through: all sports first, then each family done in
 * the period. With a single family, only its page, since "all" would repeat it; with none, the
 * empty "all". Time O(n), space O(1).
 */
export function summaryPages(activities: readonly Activity[], range: DateRange): SummaryPage[] {
  const families = familiesOf(selectActivities(activities, range));
  return families.length === 1 ? families : ['all', ...families];
}

/**
 * Summarizes the activities of a period (week, month, year or custom range).
 *
 * Time O(n log n) for the chronological sort, space O(n).
 */
export function summarize(
  activities: readonly Activity[],
  range: DateRange,
  filter: SummaryFilter = {},
): PeriodSummary {
  const selected = selectActivities(activities, range, filter);
  const withDistance = selected.filter((activity) => activity.distanceMeters > 0);
  const distanceTime = sum(withDistance, (activity) => activity.movingTimeSeconds);
  const totalDistanceMeters = sum(selected, (activity) => activity.distanceMeters);

  return {
    range,
    activityCount: selected.length,
    totalDistanceMeters,
    totalMovingTimeSeconds: sum(selected, (activity) => activity.movingTimeSeconds),
    totalElevationGainMeters: sum(selected, (activity) => activity.elevationGainMeters),
    averageSpeed: distanceTime > 0 ? totalDistanceMeters / distanceTime : null,
    longestActivity: longest(selected),
    routes: selected.flatMap((activity) =>
      activity.routePolyline ? [activity.routePolyline] : [],
    ),
    families: familiesOf(selected),
  };
}

/**
 * The totals of each sport family among `activities`, in the usual order of the families (see
 * `familiesOf`). Time O(n · f) for n activities and f families, space O(f).
 */
export function familyTotals(activities: readonly Activity[]): FamilyTotals[] {
  return familiesOf(activities).map((family) => {
    const ofFamily = activities.filter((activity) => activity.sportFamily === family);
    const burned = ofFamily.filter((activity) => activity.calories !== null);
    return {
      family,
      activityCount: ofFamily.length,
      distanceMeters: sum(ofFamily, (activity) => activity.distanceMeters),
      movingTimeSeconds: sum(ofFamily, (activity) => activity.movingTimeSeconds),
      calories: burned.length === 0 ? null : sum(burned, (activity) => activity.calories ?? 0),
    };
  });
}

/**
 * Splits a period into chart bars, including empty ones so the chart keeps its time axis.
 *
 * Time O(b + n) for b buckets and n activities, space O(b).
 */
export function bucketize(
  activities: readonly Activity[],
  range: DateRange,
  size: BucketSize,
  filter: SummaryFilter = {},
): SummaryBucket[] {
  const ranges = bucketRanges(range, size);
  const firstDay = toEpochDay(range.start);
  // Index of the bucket for each day of the range, so each activity is placed in O(1).
  const bucketOfDay: number[] = [];
  ranges.forEach((bucket, index) => {
    for (let day = toEpochDay(bucket.start); day <= toEpochDay(bucket.end); day++) {
      bucketOfDay[day - firstDay] = index;
    }
  });

  const totals = ranges.map((bucket) => ({
    range: bucket,
    activityCount: 0,
    distanceMeters: 0,
    movingTimeSeconds: 0,
  }));
  for (const activity of selectActivities(activities, range, filter)) {
    const bucket = totals[bucketOfDay[toEpochDay(activity.localDate) - firstDay]];
    bucket.activityCount += 1;
    bucket.distanceMeters += activity.distanceMeters;
    bucket.movingTimeSeconds += activity.movingTimeSeconds;
  }
  return totals;
}

function bucketRanges(range: DateRange, size: BucketSize): DateRange[] {
  const ranges: DateRange[] = [];
  let start = range.start;
  while (start <= range.end) {
    const naturalEnd =
      size === 'day' ? start : size === 'week' ? addDays(start, 6) : monthRange(start).end;
    const end = naturalEnd < range.end ? naturalEnd : range.end;
    ranges.push({ start, end });
    start = addDays(end, 1);
  }
  return ranges;
}

function longest(activities: readonly Activity[]): Activity | null {
  const byDistance = activities.some((activity) => activity.distanceMeters > 0);
  const length = (activity: Activity) =>
    byDistance ? activity.distanceMeters : activity.movingTimeSeconds;
  return activities.reduce<Activity | null>(
    (best, activity) => (best === null || length(activity) > length(best) ? activity : best),
    null,
  );
}

function sum(activities: readonly Activity[], value: (activity: Activity) => number): number {
  return activities.reduce((total, activity) => total + value(activity), 0);
}
