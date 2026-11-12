import { type DateRange, type LocalDate, toEpochDay } from './dates';

/**
 * What the phone keeps of Strava and when to ask again (ADR 020). Strava allows caching its data
 * for at most 7 days, and its rate limits are per app, so the phone keeps activities by the local
 * month they started in, asks only for the months it lacks or that are 7 days old, and asks for
 * a run of consecutive months in one paged query. Pure: `sources/strava` does the requests and
 * `data/` the files.
 *
 * Every function here is O(n) in the activities or months it is given.
 */

/** How long anything from Strava may be kept: Strava's API terms allow at most 7 days. */
export const STRAVA_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

/** A local month, `YYYY-MM`. */
export type YearMonth = string;

/** What the planner needs of a Strava activity (its `SummaryActivity` fields). */
export interface CachedActivity {
  readonly id: number;
  /** UTC, ISO 8601. */
  readonly start_date: string;
  /** Local wall-clock time, ISO 8601 (Strava suffixes it with "Z"). */
  readonly start_date_local: string;
}

/** A month as the phone keeps it: its activities and when Strava gave them. */
export interface CachedMonth<T extends CachedActivity> {
  /** Milliseconds since the epoch. */
  readonly fetchedAt: number;
  readonly activities: readonly T[];
}

/** Whether something Strava gave at `fetchedAt` may still be kept at `now`. */
export function isCacheFresh(fetchedAt: number, now: number): boolean {
  return now - fetchedAt < STRAVA_CACHE_MS && fetchedAt <= now;
}

/** The local month an activity started in. */
export function monthOfActivity(activity: CachedActivity): YearMonth {
  return activity.start_date_local.slice(0, 7);
}

function monthIndex(month: YearMonth): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

function monthAt(index: number): YearMonth {
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * Every month `range` touches, oldest first.
 *
 * @throws RangeError when a date of `range` isn't a valid `YYYY-MM-DD`.
 */
export function monthsIn(range: DateRange): YearMonth[] {
  toEpochDay(range.start);
  toEpochDay(range.end);
  const months: YearMonth[] = [];
  for (let at = monthIndex(range.start); at <= monthIndex(range.end); at++) {
    months.push(monthAt(at));
  }
  return months;
}

/** The months of `months` the phone lacks, or keeps from 7 days ago or more. */
export function monthsToFetch<T extends CachedActivity>(
  months: readonly YearMonth[],
  cached: ReadonlyMap<YearMonth, CachedMonth<T>>,
  now: number,
): YearMonth[] {
  return months.filter((month) => {
    const kept = cached.get(month);
    return kept === undefined || !isCacheFresh(kept.fetchedAt, now);
  });
}

/** One query for a run of consecutive months: Strava's `after` and `before`, in UTC seconds. */
export interface FetchWindow {
  readonly months: readonly YearMonth[];
  readonly after: number;
  readonly before: number;
}

const DAY_SECONDS = 86_400;

/** The UTC midnight a local date names, in seconds. */
function utcSeconds(date: LocalDate): number {
  return toEpochDay(date) * DAY_SECONDS;
}

/**
 * The queries for `months`: one per run of consecutive months. A local month starts and ends at
 * a different UTC time wherever the athlete was (up to 14 hours either way), so each window
 * reaches a day past it on both sides; what falls in a month outside the run is left out
 * (see {@link monthsFromWindow}).
 */
export function fetchWindows(months: readonly YearMonth[]): FetchWindow[] {
  const sorted = [...new Set(months)].sort((a, b) => monthIndex(a) - monthIndex(b));
  const runs: YearMonth[][] = [];
  for (const month of sorted) {
    const run = runs[runs.length - 1];
    if (run !== undefined && monthIndex(run[run.length - 1]) + 1 === monthIndex(month)) {
      run.push(month);
    } else {
      runs.push([month]);
    }
  }
  return runs.map((run) => {
    const next = monthAt(monthIndex(run[run.length - 1]) + 1);
    return {
      months: run,
      after: utcSeconds(`${run[0]}-01`) - DAY_SECONDS,
      before: utcSeconds(`${next}-01`) + DAY_SECONDS,
    };
  });
}

/**
 * The months a window's answer fills, each with its activities sorted by start and the time it
 * was fetched; a month with none is kept empty, which is also an answer.
 */
export function monthsFromWindow<T extends CachedActivity>(
  window: FetchWindow,
  activities: readonly T[],
  fetchedAt: number,
): Map<YearMonth, CachedMonth<T>> {
  const byMonth = new Map<YearMonth, T[]>(window.months.map((month) => [month, []]));
  for (const activity of activities) {
    byMonth.get(monthOfActivity(activity))?.push(activity);
  }
  return new Map(
    [...byMonth].map(([month, found]) => [
      month,
      { fetchedAt, activities: [...found].sort(byStart) },
    ]),
  );
}

function byStart(a: CachedActivity, b: CachedActivity): number {
  return a.start_date.localeCompare(b.start_date);
}

/**
 * Brings the kept months up to date with the newest activities (`recent`, newest first, as
 * Strava lists them without `after`): new and changed ones go into their month if the phone keeps
 * it, and one the phone keeps within the time `recent` covers but that is no longer there was
 * deleted on Strava. `complete` says `recent` is the athlete's whole history. Months keep the time
 * they were fetched: only a full fetch renews it.
 */
export function mergeRecent<T extends CachedActivity>(
  cached: ReadonlyMap<YearMonth, CachedMonth<T>>,
  recent: readonly T[],
  complete: boolean,
): Map<YearMonth, CachedMonth<T>> {
  if (recent.length === 0 && !complete) {
    return new Map(cached);
  }
  const covered = complete
    ? ''
    : recent.reduce(
        (oldest, activity) => (activity.start_date < oldest ? activity.start_date : oldest),
        recent[0].start_date,
      );
  const fresh = new Map(recent.map((activity) => [activity.id, activity]));
  const merged = new Map<YearMonth, CachedMonth<T>>();
  for (const [month, kept] of cached) {
    const staying = kept.activities.filter(
      (activity) => !fresh.has(activity.id) && activity.start_date < covered,
    );
    const arriving = recent.filter((activity) => monthOfActivity(activity) === month);
    merged.set(month, {
      fetchedAt: kept.fetchedAt,
      activities: [...staying, ...arriving].sort(byStart),
    });
  }
  return merged;
}

/** The keys of what may no longer be kept at `now`. */
export function expiredKeys(fetchedAt: ReadonlyMap<string, number>, now: number): string[] {
  return [...fetchedAt].filter(([, at]) => !isCacheFresh(at, now)).map(([key]) => key);
}
