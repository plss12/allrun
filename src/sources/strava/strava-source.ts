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
import { parseStravaDetail, stravaDetailedActivitySchema, stravaStreamsSchema } from './detail';
import { type StravaActivity, stravaActivitySchema, stravaToActivity } from './schema';
import { parseStravaZones, stravaZonesSchema } from './zones';

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
const STREAM_KEYS = 'time,distance,altitude,velocity_smooth,heartrate,watts';

const RECENT_KEY = 'recent';
const ZONES_KEY = 'zones';
const yearKey = (year: string) => `year-${year}`;
const detailKey = (id: number) => `detail-${id}`;

const activitiesSchema = z.array(stravaActivitySchema);
const fetchedAtSchema = z.number().int().nonnegative();

const recentSchema = z.object({
  fetchedAt: fetchedAtSchema,
  pageSize: z.number().int().positive(),
  activities: activitiesSchema,
});
type KeptRecent = z.infer<typeof recentSchema>;

const yearSchema = z.object({
  months: z.record(
    z.string().regex(/^\d{4}-\d{2}$/),
    z.object({ fetchedAt: fetchedAtSchema, activities: activitiesSchema }),
  ),
});

/** An activity's detail as kept: the fields AllRun reads of it, its streams if it has them. */
const detailedSchema = stravaActivitySchema.extend(stravaDetailedActivitySchema.shape);
const keptDetailSchema = z.object({
  fetchedAt: fetchedAtSchema,
  activity: detailedSchema.nullable(),
  streams: stravaStreamsSchema.nullable(),
});
type KeptDetail = z.infer<typeof keptDetailSchema>;

const keptZonesSchema = z.object({
  fetchedAt: fetchedAtSchema,
  zones: stravaZonesSchema.nullable(),
});

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
 * - An activity's detail and streams, and the athlete's zones: when first needed.
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
  private readonly details = new Map<number, Promise<KeptDetail>>();
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
      const { activity } = await this.detail(stravaId);
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
    const { activity, streams } = await this.detail(stravaId);
    return activity === null ? null : parseStravaDetail(streams, activity);
  }

  /** `null` when Strava has none, or the athlete didn't grant `profile:read_all`. */
  async getHeartRateZones(): Promise<HeartRateZones | null> {
    await this.ready();
    const kept = await this.readKept(ZONES_KEY, keptZonesSchema);
    if (kept !== null && isCacheFresh(kept.fetchedAt, this.now())) {
      return kept.zones === null ? null : parseStravaZones(kept.zones);
    }
    const answer = await this.api.get('/athlete/zones', {}, { absentOn: [403, 404] });
    const zones = answer === null ? null : stravaZonesSchema.parse(answer);
    await this.keep(ZONES_KEY, { fetchedAt: this.now(), zones });
    return zones === null ? null : parseStravaZones(zones);
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
      const kept = await this.store.read(key);
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
    const kept = await this.store.read(key);
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

  private async fetchActivities(query: Record<string, number>): Promise<StravaActivity[]> {
    return activitiesSchema.parse(await this.api.get('/athlete/activities', query));
  }

  private fetchRecent(pageSize: number): Promise<KeptRecent> {
    this.refreshing ??= (async () => {
      try {
        const fetchedAt = this.now();
        const activities = (await this.fetchActivities({ per_page: pageSize, page: 1 })).sort(
          byStartDescending,
        );
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
      const found = await this.fetchActivities({
        after: window.after,
        before: window.before,
        per_page: PAGE_SIZE,
        page,
      });
      activities.push(...found);
      if (found.length < PAGE_SIZE) {
        break;
      }
    }
    for (const [month, kept] of monthsFromWindow(window, activities, fetchedAt)) {
      this.months.set(month, kept);
    }
    await this.keepYears(window.months.map((month) => month.slice(0, 4)));
  }

  /** An activity's detail: kept, or asked for once however many ask at the same time. */
  private detail(id: number): Promise<KeptDetail> {
    let loading = this.details.get(id);
    if (loading === undefined) {
      loading = (async () => {
        const kept = await this.readKept(detailKey(id), keptDetailSchema);
        if (kept !== null && isCacheFresh(kept.fetchedAt, this.now())) {
          return kept;
        }
        const fetchedAt = this.now();
        const [activity, streams] = await Promise.all([
          this.api.get(`/activities/${id}`),
          this.api.get(`/activities/${id}/streams`, { keys: STREAM_KEYS, key_by_type: 'true' }),
        ]);
        const fresh: KeptDetail = {
          fetchedAt,
          activity: activity === null ? null : detailedSchema.parse(activity),
          streams: hasStreams(streams) ? stravaStreamsSchema.parse(streams) : null,
        };
        await this.keep(detailKey(id), fresh);
        return fresh;
      })();
      this.details.set(id, loading);
      // A failure is asked again next time.
      loading.catch(() => {
        if (this.details.get(id) === loading) {
          this.details.delete(id);
        }
      });
    }
    return loading;
  }

  /** The activity as a list gave it, if the source has it in memory. */
  private findListed(id: number): StravaActivity | null {
    const inRecent = this.recent?.activities.find((activity) => activity.id === id);
    if (inRecent !== undefined) {
      return inRecent;
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
