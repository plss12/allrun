import { z } from 'zod';

import type { Activity } from '@/core/activity';
import type { ActivityDetail } from '@/core/activity-detail';
import type { DateRange, LocalDate } from '@/core/dates';
import type { HeartRateZones } from '@/core/heart-rate-zones';
import {
  type CachedMonth,
  fetchWindows,
  type FetchWindow,
  isCacheFresh,
  mergeRecent,
  monthsFromWindow,
  monthsIn,
  monthsToFetch,
  type YearMonth,
} from '@/core/strava-cache';
import { selectActivities } from '@/core/summary';
import type { ActivitySource } from '@/sources/activity-source';

import type { StravaApi } from './api';
import { athletePhoto, stravaAthleteSchema } from './athlete';
import { parseStravaDetail, stravaDetailedActivitySchema, stravaStreamsSchema } from './detail';
import { type StravaActivity, stravaActivitySchema, stravaToActivity } from './schema';
import { parseStravaZones, type StravaZones, stravaZonesSchema } from './zones';
import { stravaActivityZonesSchema } from './activity-zones';

/**
 * Where the source keeps what Strava gave: JSON by key, on the phone in the app, in memory in
 * tests. Never shared between accounts: the app empties it when Strava is disconnected or the
 * user signs out.
 */
export interface StravaCacheStore {
  /** What was written under `key`, or `null` if nothing was. */
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** How often the newest activities are asked for again, at most. */
export const RECENT_REFRESH_MS = 5 * 60 * 1000;

/** Strava's largest page. */
const PAGE_SIZE = 200;
/** The newest activities are asked for in one page at least this long. */
const RECENT_PAGE = 50;
/** What the charts read of an activity's streams. */
const STREAM_KEYS = 'time,distance,altitude,velocity_smooth,heartrate,watts,cadence,moving';

const RECENT_KEY = 'recent';
const ZONES_KEY = 'zones';
const ATHLETE_KEY = 'athlete';
/**
 * How long the athlete's profile (photo, subscription) and zones are kept: a day, so that a change
 * on Strava shows the day after; a request a day each, of the app's quota.
 */
const PROFILE_KEPT_MS = 24 * 60 * 60 * 1000;
/**
 * How long after asking for them a pull to refresh asks again for the newest activities, and for
 * the athlete's profile and zones: pulling again sooner asks nothing, so that pulling over and over
 * can't spend the app's quota, which every user shares.
 */
const PULLED_LIST_MS = 2 * 60 * 1000;
const PULLED_PROFILE_MS = 15 * 60 * 1000;
const yearKey = (year: string) => `year-${year}`;
/**
 * An activity is kept in two parts, each asked for only when needed: its detail (one request: a
 * home card asks for it for the calories the lists lack) and, for its charts, its streams and
 * zones (two more). Kept under keys of their own: the `detail-` and `detail2-` of earlier versions,
 * which kept the three together, go as they get old.
 */
const activityKey = (id: number) => `activity-${id}`;
const streamsKey = (id: number) => `streams-${id}`;
const olderKey = (before: number, limit: number) => `before-${before}-${limit}`;

const activitiesSchema = z.array(stravaActivitySchema);
const fetchedAtSchema = z.number().int().nonnegative();

const recentSchema = z.object({
  fetchedAt: fetchedAtSchema,
  pageSize: z.number().int().positive(),
  activities: activitiesSchema,
});
type KeptRecent = z.infer<typeof recentSchema>;

/** A page of older activities (see `listBefore`). */
const olderSchema = z.object({ fetchedAt: fetchedAtSchema, activities: activitiesSchema });

const yearSchema = z.object({
  months: z.record(
    z.string().regex(/^\d{4}-\d{2}$/),
    z.object({ fetchedAt: fetchedAtSchema, activities: activitiesSchema }),
  ),
});

/** An activity's detail as kept: the fields AllRun reads of it; `null` if Strava hasn't it. */
const detailedSchema = stravaActivitySchema.extend(stravaDetailedActivitySchema.shape);
const keptActivitySchema = z.object({
  fetchedAt: fetchedAtSchema,
  activity: detailedSchema.nullable(),
});
type KeptActivity = z.infer<typeof keptActivitySchema>;

/** What an activity's charts read, as kept: its streams if it has them, and its zones. */
const keptStreamsSchema = z.object({
  fetchedAt: fetchedAtSchema,
  streams: stravaStreamsSchema.nullable(),
  /** Its time in zones; `null` without them (Strava gives them only to its subscribers). */
  zones: stravaActivityZonesSchema.nullable(),
});
type KeptStreams = z.infer<typeof keptStreamsSchema>;

const keptZonesSchema = z.object({
  fetchedAt: fetchedAtSchema,
  zones: stravaZonesSchema.nullable(),
});

const keptAthleteSchema = z.object({
  fetchedAt: fetchedAtSchema,
  photo: z.string().nullable(),
  /**
   * Whether they pay Strava, `null` if Strava didn't say; set to `false` when Strava refuses an
   * activity's zones, until the profile is asked for again. Absent in what earlier versions kept.
   */
  summit: z.boolean().nullable().optional(),
});
type KeptAthlete = z.infer<typeof keptAthleteSchema>;

/** Whether what was kept at `fetchedAt` is still the profile's, a day at most. */
function isProfileFresh(fetchedAt: number, now: number): boolean {
  return now - fetchedAt < PROFILE_KEPT_MS && fetchedAt <= now;
}

/** The numeric Strava id of an `Activity.id` (`strava:123`), or `null` if it isn't one. */
function stravaIdOf(id: string): number | null {
  const match = /^strava:(\d+)$/.exec(id);
  return match === null ? null : Number(match[1]);
}

/** Whether Strava sent streams: an activity without them (added by hand) gets none, or no `time`. */
function hasStreams(json: unknown): boolean {
  return typeof json === 'object' && json !== null && !Array.isArray(json) && 'time' in json;
}

function byStartDescending(a: StravaActivity, b: StravaActivity): number {
  return b.start_date.localeCompare(a.start_date);
}

/**
 * {@link ActivitySource} backed by Strava's API (ADR 020), with a cache on the phone of less
 * than 7 days, Strava's limit:
 *
 * - The newest activities: one page, shown at once from the cache and asked again in the
 *   background when it is more than {@link RECENT_REFRESH_MS} old; what changed is merged into
 *   the kept months, and `onChange` tells the app to load again.
 * - A range (the summaries): by local month, asking only for the months missing or 7 days old,
 *   one paged query per run of consecutive months (`core/strava-cache.ts`). Months still to come
 *   are empty without asking.
 * - Older activities (the home, past its newest): a page at a time, asked for with Strava's
 *   `before` and kept a week under where it starts, as the rest.
 * - An activity's detail (one request) and, apart, its streams and zones (two), and the
 *   athlete's zones: each when first needed.
 *
 * What fails to load from the cache is logged and asked again of Strava.
 */
export class StravaActivitySource implements ActivitySource {
  private readonly api: StravaApi;
  private readonly store: StravaCacheStore;
  private readonly now: () => number;
  private readonly today: () => LocalDate;
  private readonly onError: (context: string, error: unknown) => void;

  private pruned: Promise<void> | null = null;
  private recent: KeptRecent | null | undefined;
  private readonly months = new Map<YearMonth, CachedMonth<StravaActivity>>();
  private readonly loadedYears = new Map<string, Promise<void>>();
  private readonly pendingMonths = new Map<YearMonth, Promise<void>>();
  private refreshing: Promise<KeptRecent> | null = null;
  /** The athlete's profile being read or asked for (see `athlete`). */
  private profile: Promise<KeptAthlete> | null = null;
  /** Activities' details and streams being asked for or read, by id (see `once`). */
  private readonly activities = new Map<number, Promise<KeptActivity>>();
  private readonly streams = new Map<number, Promise<KeptStreams>>();
  /** The older activities listed in this session, for `findListed`. */
  private readonly older = new Map<number, StravaActivity>();
  private readonly listeners = new Set<() => void>();

  constructor(options: {
    readonly api: StravaApi;
    readonly store: StravaCacheStore;
    readonly now?: () => number;
    /** The phone's local date, which says which months are still to come. */
    readonly today: () => LocalDate;
    readonly onError: (context: string, error: unknown) => void;
  }) {
    this.api = options.api;
    this.store = options.store;
    this.now = options.now ?? Date.now;
    this.today = options.today;
    this.onError = options.onError;
  }

  /** Calls `listener` when what the source gives has changed: load again. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Asks Strava for the newest activities if the last time was a while ago (app in front). */
  refresh(): void {
    void this.ready()
      .then(() => this.loadRecent())
      .then((recent) => {
        if (recent !== null && this.now() - recent.fetchedAt < RECENT_REFRESH_MS) {
          return;
        }
        return this.refreshInBackground(recent?.pageSize ?? RECENT_PAGE);
      })
      .catch((error: unknown) => this.onError('Could not refresh the Strava activities', error));
  }

  /** @throws RangeError if `limit` is not a non-negative integer. */
  async listRecent(limit: number): Promise<Activity[]> {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError(`Invalid limit: ${limit}`);
    }
    await this.ready();
    const pageSize = Math.min(PAGE_SIZE, Math.max(limit, RECENT_PAGE));
    let recent = await this.loadRecent();
    if (recent === null || recent.pageSize < pageSize) {
      recent = await this.fetchRecent(pageSize);
    } else if (this.now() - recent.fetchedAt >= RECENT_REFRESH_MS) {
      void this.refreshInBackground(pageSize);
    }
    return recent.activities.slice(0, limit).map(stravaToActivity);
  }

  /**
   * The `limit` activities that started before `startUtc`, newest first: one query to Strava
   * (`before`, in whole seconds) unless the same page was kept less than a week ago.
   *
   * @throws RangeError for a `limit` outside 1..200 or a `startUtc` that isn't a date.
   */
  async listBefore(startUtc: string, limit: number): Promise<Activity[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_SIZE) {
      throw new RangeError(`Invalid limit: ${limit}`);
    }
    const before = Math.floor(Date.parse(startUtc) / 1000);
    if (!Number.isFinite(before)) {
      throw new RangeError(`Invalid start: ${startUtc}`);
    }
    await this.ready();
    const key = olderKey(before, limit);
    const kept = await this.readKept(key, olderSchema);
    let activities = kept?.activities;
    if (kept === null || !isCacheFresh(kept.fetchedAt, this.now())) {
      const fetchedAt = this.now();
      activities = (await this.fetchFullPage(before, limit)).sort(byStartDescending);
      await this.keep(key, { fetchedAt, activities });
    }
    const page = activities ?? [];
    for (const activity of page) {
      this.older.set(activity.id, activity);
    }
    return page.map(stravaToActivity);
  }

  async listInRange(range: DateRange): Promise<Activity[]> {
    await this.ready();
    const current = this.today().slice(0, 7);
    const months = monthsIn(range).filter((month) => month <= current);
    await this.ensureMonths(months);
    const activities = months.flatMap((month) => this.months.get(month)?.activities ?? []);
    return selectActivities(activities.map(stravaToActivity), range);
  }

  async getActivity(id: string): Promise<Activity | null> {
    const stravaId = stravaIdOf(id);
    if (stravaId === null) {
      return null;
    }
    await this.ready();
    try {
      const { activity } = await this.activityOf(stravaId);
      return activity === null ? null : stravaToActivity(activity);
    } catch (error) {
      // Without its detail (no connection), the activity as the lists gave it still opens.
      const listed = this.findListed(stravaId);
      if (listed === null) {
        throw error;
      }
      this.onError('Could not load an activity from Strava: using it as listed', error);
      return stravaToActivity(listed);
    }
  }

  async getActivityDetail(id: string): Promise<ActivityDetail | null> {
    const stravaId = stravaIdOf(id);
    if (stravaId === null) {
      return null;
    }
    await this.ready();
    const [{ activity }, { streams, zones }] = await Promise.all([
      this.activityOf(stravaId),
      this.streamsOf(stravaId),
    ]);
    return activity === null ? null : parseStravaDetail(streams, activity, zones);
  }

  /**
   * `null` when Strava has none, or the athlete didn't grant `profile:read_all`. Kept a day, as
   * the profile.
   */
  async getHeartRateZones(): Promise<HeartRateZones | null> {
    await this.ready();
    const kept = await this.readKept(ZONES_KEY, keptZonesSchema);
    if (kept !== null && isProfileFresh(kept.fetchedAt, this.now())) {
      return kept.zones === null ? null : parseStravaZones(kept.zones);
    }
    const zones = await this.fetchHeartRateZones();
    return zones === null ? null : parseStravaZones(zones);
  }

  /**
   * Pulled to refresh: asks again for the newest activities, if last asked over
   * {@link PULLED_LIST_MS} ago, and for the athlete's profile and zones, over
   * {@link PULLED_PROFILE_MS} ago (one changed on Strava shows at once); sooner, nothing. Resolves
   * once done; what changed is told by `onChange`, and failures are logged.
   */
  async pull(): Promise<void> {
    await this.ready();
    const now = this.now();
    const [recent, athlete, zones] = await Promise.all([
      this.loadRecent(),
      this.readKept(ATHLETE_KEY, keptAthleteSchema),
      this.readKept(ZONES_KEY, keptZonesSchema),
    ]);
    const due = (kept: { readonly fetchedAt: number } | null, after: number) =>
      kept === null || now - kept.fetchedAt >= after || kept.fetchedAt > now;
    const asked: Promise<unknown>[] = [];
    if (due(recent, PULLED_LIST_MS)) {
      asked.push(this.refreshInBackground(recent?.pageSize ?? RECENT_PAGE));
    }
    if (due(athlete, PULLED_PROFILE_MS)) {
      asked.push(
        this.athlete(true).then((fresh) => {
          if (fresh.photo !== athlete?.photo) {
            this.listeners.forEach((listener) => listener());
          }
        }),
      );
    }
    if (due(zones, PULLED_PROFILE_MS)) {
      asked.push(this.fetchHeartRateZones());
    }
    for (const result of await Promise.allSettled(asked)) {
      if (result.status === 'rejected') {
        this.onError('Could not refresh from Strava', result.reason);
      }
    }
  }

  /** The athlete's heart rate zones, asked of Strava and kept. */
  private async fetchHeartRateZones(): Promise<StravaZones | null> {
    const answer = await this.api.get('/athlete/zones', {}, { absentOn: [403, 404] });
    const zones = answer === null ? null : stravaZonesSchema.parse(answer);
    await this.keep(ZONES_KEY, { fetchedAt: this.now(), zones });
    return zones;
  }

  /** The athlete's photo, from their profile (see `athlete`). */
  async getAthletePhoto(): Promise<string | null> {
    await this.ready();
    return (await this.athlete()).photo;
  }

  /**
   * The athlete's profile: their photo and whether they pay Strava, kept a day (or asked for again
   * when `fresh`); asked for once however many ask at the same time.
   */
  private athlete(fresh = false): Promise<KeptAthlete> {
    this.profile ??= (async () => {
      const kept = fresh ? null : await this.readKept(ATHLETE_KEY, keptAthleteSchema);
      if (
        kept !== null &&
        kept.summit !== undefined &&
        isProfileFresh(kept.fetchedAt, this.now())
      ) {
        return kept;
      }
      const athlete = stravaAthleteSchema.parse(await this.api.get('/athlete'));
      const asked: KeptAthlete = {
        fetchedAt: this.now(),
        photo: athletePhoto(athlete),
        summit: athlete.summit ?? null,
      };
      await this.keep(ATHLETE_KEY, asked);
      return asked;
    })().finally(() => {
      this.profile = null;
    });
    return this.profile;
  }

  /**
   * Whether to ask for an activity's zones: unless the athlete is known not to pay Strava, who
   * alone has them (a refused request counts against the app's quota too). Asked anyway when the
   * profile can't be had.
   */
  private async mayHaveZones(): Promise<boolean> {
    try {
      return (await this.athlete()).summit !== false;
    } catch (error) {
      this.onError("Could not read the athlete's profile: asking for the zones anyway", error);
      return true;
    }
  }

  /** Notes, until the profile is asked for again, that Strava refused an activity's zones. */
  private async zonesRefused(): Promise<void> {
    const kept = await this.readKept(ATHLETE_KEY, keptAthleteSchema);
    if (kept !== null) {
      await this.keep(ATHLETE_KEY, { ...kept, summit: false });
    }
  }

  // The cache ------------------------------------------------------------------------------------

  /** Deletes, once, what may no longer be kept; everything waits for it. */
  private ready(): Promise<void> {
    this.pruned ??= this.prune().catch((error: unknown) =>
      this.onError('Could not clear the expired Strava cache', error),
    );
    return this.pruned;
  }

  private async prune(): Promise<void> {
    const now = this.now();
    for (const key of await this.store.keys()) {
      let kept: unknown;
      try {
        kept = await this.store.read(key);
      } catch (error) {
        // Cut short or unreadable: gone, as an invalid one is, and asked for again when needed.
        this.onError(`The Strava cache "${key}" is damaged`, error);
        await this.store.remove(key);
        continue;
      }
      if (key.startsWith('year-')) {
        const year = yearSchema.safeParse(kept);
        if (!year.success) {
          await this.store.remove(key);
          continue;
        }
        const fresh = Object.entries(year.data.months).filter(([, month]) =>
          isCacheFresh(month.fetchedAt, now),
        );
        if (fresh.length === 0) {
          await this.store.remove(key);
        } else if (fresh.length < Object.keys(year.data.months).length) {
          await this.store.write(key, { months: Object.fromEntries(fresh) });
        }
        continue;
      }
      const fetchedAt = z.object({ fetchedAt: fetchedAtSchema }).safeParse(kept);
      if (!fetchedAt.success || !isCacheFresh(fetchedAt.data.fetchedAt, now)) {
        await this.store.remove(key);
      }
    }
  }

  /** What was kept under `key`, if it is still valid; damaged, it is logged and asked again. */
  private async readKept<T>(key: string, schema: z.ZodType<T>): Promise<T | null> {
    let kept: unknown;
    try {
      kept = await this.store.read(key);
    } catch (error) {
      // Cut short or unreadable (the app closed while writing it): asked for again and rewritten,
      // as a damaged one is; left as it is, it would fail every time.
      this.onError(`The Strava cache "${key}" is damaged`, error);
      return null;
    }
    if (kept === null) {
      return null;
    }
    const parsed = schema.safeParse(kept);
    if (!parsed.success) {
      this.onError(`The Strava cache "${key}" is damaged`, parsed.error);
      return null;
    }
    return parsed.data;
  }

  /** Keeps `value`; if it can't be written the app goes on, asking Strava again next time. */
  private async keep(key: string, value: unknown): Promise<void> {
    try {
      await this.store.write(key, value);
    } catch (error) {
      this.onError(`Could not keep "${key}" of Strava on the phone`, error);
    }
  }

  private async loadRecent(): Promise<KeptRecent | null> {
    if (this.recent === undefined) {
      const kept = await this.readKept(RECENT_KEY, recentSchema);
      // Another load may have asked Strava meanwhile.
      if (this.recent === undefined) {
        this.recent = kept !== null && isCacheFresh(kept.fetchedAt, this.now()) ? kept : null;
      }
    }
    return this.recent;
  }

  private loadYear(year: string): Promise<void> {
    let loading = this.loadedYears.get(year);
    if (loading === undefined) {
      loading = this.readKept(yearKey(year), yearSchema).then((kept) => {
        const now = this.now();
        for (const [month, cached] of Object.entries(kept?.months ?? {})) {
          if (!this.months.has(month) && isCacheFresh(cached.fetchedAt, now)) {
            this.months.set(month, cached);
          }
        }
      });
      this.loadedYears.set(year, loading);
    }
    return loading;
  }

  private async keepYears(years: Iterable<string>): Promise<void> {
    for (const year of new Set(years)) {
      const months = Object.fromEntries(
        [...this.months].filter(([month]) => month.startsWith(`${year}-`)),
      );
      await this.keep(yearKey(year), { months });
    }
  }

  // Strava ---------------------------------------------------------------------------------------

  /**
   * A page of Strava's activities, each validated alone: one it can't read is left out and logged,
   * and the rest still listed. `sent` is how many Strava sent, which says whether more follow.
   */
  private async fetchActivities(
    query: Record<string, number>,
  ): Promise<{ readonly activities: StravaActivity[]; readonly sent: number }> {
    const page = z.array(z.unknown()).parse(await this.api.get('/athlete/activities', query));
    const activities = page.flatMap((json) => {
      const parsed = stravaActivitySchema.safeParse(json);
      if (parsed.success) {
        return [parsed.data];
      }
      const id = z.object({ id: z.number() }).safeParse(json);
      this.onError(
        `Leaving out activity ${id.success ? id.data.id : '?'}, which Strava sent unreadable`,
        parsed.error,
      );
      return [];
    });
    return { activities, sent: page.length };
  }

  /**
   * `limit` activities before `before` (seconds), fewer only at the athlete's first: a page with
   * one left out (see `fetchActivities`) is filled from the next, so that a short page still
   * means there are no more. Time O(p) requests for p pages, one but for activities left out.
   */
  private async fetchFullPage(before: number, limit: number): Promise<StravaActivity[]> {
    const found: StravaActivity[] = [];
    for (let page = 1; found.length < limit; page++) {
      const { activities, sent } = await this.fetchActivities({ before, per_page: limit, page });
      found.push(...activities);
      if (sent < limit) {
        break;
      }
    }
    return found.slice(0, limit);
  }

  private fetchRecent(pageSize: number): Promise<KeptRecent> {
    this.refreshing ??= (async () => {
      try {
        const fetchedAt = this.now();
        const { activities } = await this.fetchActivities({ per_page: pageSize, page: 1 });
        activities.sort(byStartDescending);
        const recent: KeptRecent = { fetchedAt, pageSize, activities };
        this.recent = recent;
        await this.keep(RECENT_KEY, recent);
        await this.mergeIntoMonths(recent);
        return recent;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async refreshInBackground(pageSize: number): Promise<void> {
    const before = this.recent ?? null;
    try {
      const after = await this.fetchRecent(pageSize);
      if (
        before === null ||
        JSON.stringify(before.activities) !== JSON.stringify(after.activities)
      ) {
        this.listeners.forEach((listener) => listener());
      }
    } catch (error) {
      this.onError('Could not ask Strava for the newest activities', error);
    }
  }

  /** The newest activities into the months kept, so that the summaries see them too. */
  private async mergeIntoMonths(recent: KeptRecent): Promise<void> {
    const years = new Set(
      recent.activities.map((activity) => activity.start_date_local.slice(0, 4)),
    );
    await Promise.all([...years].map((year) => this.loadYear(year)));
    const merged = mergeRecent(
      this.months,
      recent.activities,
      recent.activities.length < recent.pageSize,
    );
    const changed: string[] = [];
    for (const [month, kept] of merged) {
      const before = this.months.get(month);
      if (JSON.stringify(before?.activities) !== JSON.stringify(kept.activities)) {
        this.months.set(month, kept);
        changed.push(month.slice(0, 4));
      }
    }
    await this.keepYears(changed);
  }

  private async ensureMonths(months: readonly YearMonth[]): Promise<void> {
    await Promise.all(
      [...new Set(months.map((month) => month.slice(0, 4)))].map((year) => this.loadYear(year)),
    );
    const missing = monthsToFetch(months, this.months, this.now()).filter(
      (month) => !this.pendingMonths.has(month),
    );
    for (const window of fetchWindows(missing)) {
      const fetching = this.fetchWindow(window);
      for (const month of window.months) {
        this.pendingMonths.set(month, fetching);
      }
      // A failure reaches every caller through the `await` below; this chain only clears it.
      void fetching
        .finally(() => {
          for (const month of window.months) {
            if (this.pendingMonths.get(month) === fetching) {
              this.pendingMonths.delete(month);
            }
          }
        })
        .catch(() => undefined);
    }
    await Promise.all(months.map((month) => this.pendingMonths.get(month)));
  }

  /** Every page of a window, into its months. */
  private async fetchWindow(window: FetchWindow): Promise<void> {
    const fetchedAt = this.now();
    const activities: StravaActivity[] = [];
    for (let page = 1; ; page++) {
      const { activities: found, sent } = await this.fetchActivities({
        after: window.after,
        before: window.before,
        per_page: PAGE_SIZE,
        page,
      });
      activities.push(...found);
      if (sent < PAGE_SIZE) {
        break;
      }
    }
    for (const [month, kept] of monthsFromWindow(window, activities, fetchedAt)) {
      this.months.set(month, kept);
    }
    await this.keepYears(window.months.map((month) => month.slice(0, 4)));
  }

  /** An activity's detail: kept, or asked for once however many ask at the same time. */
  private activityOf(id: number): Promise<KeptActivity> {
    return this.once(this.activities, id, async () => {
      const kept = await this.readKept(activityKey(id), keptActivitySchema);
      if (kept !== null && isCacheFresh(kept.fetchedAt, this.now())) {
        return kept;
      }
      const fetchedAt = this.now();
      const activity = await this.api.get(`/activities/${id}`);
      const fresh: KeptActivity = {
        fetchedAt,
        activity: activity === null ? null : detailedSchema.parse(activity),
      };
      await this.keep(activityKey(id), fresh);
      return fresh;
    });
  }

  /** An activity's streams and zones, for its charts: kept, or asked for once, as its detail. */
  private streamsOf(id: number): Promise<KeptStreams> {
    return this.once(this.streams, id, async () => {
      const kept = await this.readKept(streamsKey(id), keptStreamsSchema);
      if (kept !== null && isCacheFresh(kept.fetchedAt, this.now())) {
        return kept;
      }
      const fetchedAt = this.now();
      const [streams, zones] = await Promise.all([
        this.api.get(`/activities/${id}/streams`, { keys: STREAM_KEYS, key_by_type: 'true' }),
        // A subscriber's: anyone else is refused (402 or 403), and has no zones.
        (async () => {
          if (!(await this.mayHaveZones())) {
            return null;
          }
          const answer = await this.api.get(
            `/activities/${id}/zones`,
            {},
            {
              absentOn: [402, 403, 404],
            },
          );
          if (answer === null) {
            await this.zonesRefused();
          }
          return answer;
        })(),
      ]);
      const fresh: KeptStreams = {
        fetchedAt,
        streams: hasStreams(streams) ? stravaStreamsSchema.parse(streams) : null,
        zones: zones === null ? null : stravaActivityZonesSchema.parse(zones),
      };
      await this.keep(streamsKey(id), fresh);
      return fresh;
    });
  }

  /**
   * What `load` gives for `id`, loaded once however many ask for it at the same time, and asked
   * again after a failure.
   */
  private once<T>(
    loading: Map<number, Promise<T>>,
    id: number,
    load: () => Promise<T>,
  ): Promise<T> {
    let pending = loading.get(id);
    if (pending === undefined) {
      pending = load();
      loading.set(id, pending);
      pending.catch(() => {
        if (loading.get(id) === pending) {
          loading.delete(id);
        }
      });
    }
    return pending;
  }

  /** The activity as a list gave it, if the source has it in memory. */
  private findListed(id: number): StravaActivity | null {
    const inRecent = this.recent?.activities.find((activity) => activity.id === id);
    if (inRecent !== undefined) {
      return inRecent;
    }
    const inOlder = this.older.get(id);
    if (inOlder !== undefined) {
      return inOlder;
    }
    for (const month of this.months.values()) {
      const found = month.activities.find((activity) => activity.id === id);
      if (found !== undefined) {
        return found;
      }
    }
    return null;
  }
}
