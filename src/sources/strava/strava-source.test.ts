import type { StravaApi } from './api';
import { RECENT_REFRESH_MS, type StravaCacheStore, StravaActivitySource } from './strava-source';

const DAY = 86_400_000;
const MINUTE = 60_000;
const PHOTO = 'https://dgalywyr863hv.cloudfront.net/pictures/athletes/1/1/large.jpg';
const START = Date.UTC(2026, 10, 13, 12);

/** A Strava `SummaryActivity`, run at `local` (also its UTC time, for simplicity). */
function stravaRun(id: number, local: string) {
  return {
    id,
    name: `Run ${id}`,
    sport_type: 'Run',
    start_date: `${local}Z`,
    start_date_local: `${local}Z`,
    distance: 10_000,
    moving_time: 3000,
    elapsed_time: 3100,
    total_elevation_gain: 50,
    average_speed: 3.33,
    max_speed: 4.5,
  };
}

type Run = ReturnType<typeof stravaRun>;

function memoryStore(): StravaCacheStore & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    read: async (key) => {
      const value = data.get(key);
      return value === undefined ? null : (JSON.parse(value) as unknown);
    },
    write: async (key, value) => {
      data.set(key, JSON.stringify(value));
    },
    remove: async (key) => {
      data.delete(key);
    },
    keys: async () => [...data.keys()],
  };
}

/** Strava's API over `runs`, as it pages and filters them, counting every call. */
function fakeStrava(initial: Run[]) {
  let runs = initial;
  const calls: string[] = [];
  const detailed = new Map<number, unknown>();
  const streams = new Map<number, unknown>();
  /** Each activity's zones; without them, Strava refuses as it does anyone but a subscriber. */
  const activityZones = new Map<number, unknown>();
  let failing = false;
  /** Whether the athlete pays Strava (`summit`); `undefined` leaves it out, as an older answer. */
  let summit: boolean | undefined = true;
  let zones: unknown = {
    heart_rate: {
      zones: [
        { min: 0, max: 120 },
        { min: 120, max: -1 },
      ],
    },
  };
  const api: StravaApi = {
    async get(path, query = {}, { absentOn = [404] } = {}) {
      calls.push(`${path}${Object.keys(query).length === 0 ? '' : ` ${JSON.stringify(query)}`}`);
      if (failing) {
        throw new Error('offline');
      }
      if (path === '/athlete/activities') {
        const after = Number(query.after ?? -Infinity);
        const before = Number(query.before ?? Infinity);
        const perPage = Number(query.per_page);
        const page = Number(query.page);
        return runs
          .filter((run) => {
            const at = Date.parse(run.start_date) / 1000;
            return at > after && at < before;
          })
          .sort((a, b) => b.start_date.localeCompare(a.start_date))
          .slice((page - 1) * perPage, page * perPage);
      }
      if (path === '/athlete/zones') {
        return zones === 403 && absentOn.includes(403) ? null : zones;
      }
      if (path === '/athlete') {
        return { id: 1, firstname: 'Ana', profile: PHOTO, summit };
      }
      const zonesOf = /^\/activities\/(\d+)\/zones$/.exec(path);
      if (zonesOf !== null) {
        const kept = activityZones.get(Number(zonesOf[1]));
        if (kept === undefined && absentOn.includes(402)) {
          return null;
        }
        return kept ?? [];
      }
      const detail = /^\/activities\/(\d+)(\/streams)?$/.exec(path);
      if (detail !== null) {
        const id = Number(detail[1]);
        const run = runs.find((candidate) => candidate.id === id);
        if (run === undefined) {
          return null;
        }
        return detail[2] === undefined
          ? (detailed.get(id) ?? { ...run, calories: 700, splits_metric: [], laps: [] })
          : (streams.get(id) ?? {});
      }
      throw new Error(`Unexpected path ${path}`);
    },
  };
  return {
    api,
    calls,
    setRuns: (next: Run[]) => {
      runs = next;
    },
    setStreams: (id: number, value: unknown) => streams.set(id, value),
    setActivityZones: (id: number, value: unknown) => activityZones.set(id, value),
    fail: (on: boolean) => {
      failing = on;
    },
    setZones: (value: unknown) => {
      zones = value;
    },
    setSummit: (value: boolean | undefined) => {
      summit = value;
    },
  };
}

function source(
  strava: ReturnType<typeof fakeStrava>,
  store: StravaCacheStore,
  clock: { t: number },
) {
  const errors: string[] = [];
  const made = new StravaActivitySource({
    api: strava.api,
    store,
    now: () => clock.t,
    today: () => new Date(clock.t).toISOString().slice(0, 10),
    onError: (context) => errors.push(context),
  });
  return { source: made, errors };
}

/** Lets the background work that a call started finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

const RUNS = [
  stravaRun(1, '2026-09-10T08:00:00'),
  stravaRun(2, '2026-10-02T08:00:00'),
  stravaRun(3, '2026-11-01T08:00:00'),
  stravaRun(4, '2026-11-12T08:00:00'),
];

describe('StravaActivitySource, the newest activities', () => {
  it('asks for one page, newest first, then keeps it a few minutes', async () => {
    const strava = fakeStrava(RUNS);
    const clock = { t: START };
    const { source: made } = source(strava, memoryStore(), clock);
    const recent = await made.listRecent(3);
    expect(recent.map((activity) => activity.id)).toEqual(['strava:4', 'strava:3', 'strava:2']);
    await made.listRecent(3);
    expect(strava.calls).toEqual(['/athlete/activities {"per_page":50,"page":1}']);
  });

  it('asks Strava again when what it kept was cut short, and writes it anew', async () => {
    const strava = fakeStrava(RUNS);
    const store = memoryStore();
    // A write the app was closed in the middle of.
    store.data.set('recent', '{"fetchedAt":17');
    const { source: made, errors } = source(strava, store, { t: START });
    const recent = await made.listRecent(3);
    expect(recent.map((activity) => activity.id)).toEqual(['strava:4', 'strava:3', 'strava:2']);
    expect(errors).toEqual(['The Strava cache "recent" is damaged']);
    expect(() => JSON.parse(store.data.get('recent') ?? '') as unknown).not.toThrow();
  });

  it('asks again for what was cut short while the app was open', async () => {
    const strava = fakeStrava(RUNS);
    const store = memoryStore();
    const { source: made, errors } = source(strava, store, { t: START });
    const zones = await made.getHeartRateZones();
    store.data.set('zones', '{"fetchedAt":17');
    expect(await made.getHeartRateZones()).toEqual(zones);
    expect(errors).toEqual(['The Strava cache "zones" is damaged']);
  });

  it('shows what it kept at once and asks again in the background, telling of a change', async () => {
    const strava = fakeStrava(RUNS);
    const store = memoryStore();
    const clock = { t: START };
    await source(strava, store, clock).source.listRecent(50);

    // The next launch, later: the kept page shows without waiting for Strava.
    clock.t += RECENT_REFRESH_MS;
    strava.setRuns([...RUNS, stravaRun(5, '2026-11-13T07:00:00')]);
    const { source: later } = source(strava, store, clock);
    const changed = jest.fn();
    later.onChange(changed);
    expect((await later.listRecent(50)).map((activity) => activity.id)[0]).toBe('strava:4');
    await settle();
    expect(changed).toHaveBeenCalledTimes(1);
    expect((await later.listRecent(50)).map((activity) => activity.id)[0]).toBe('strava:5');
    expect(strava.calls).toHaveLength(2);
  });

  it('does not tell of a change when nothing changed', async () => {
    const strava = fakeStrava(RUNS);
    const clock = { t: START };
    const { source: made } = source(strava, memoryStore(), clock);
    await made.listRecent(50);
    const changed = jest.fn();
    made.onChange(changed);
    clock.t += RECENT_REFRESH_MS;
    made.refresh();
    await settle();
    expect(strava.calls).toHaveLength(2);
    expect(changed).not.toHaveBeenCalled();
  });

  it('refresh asks nothing if it asked a moment ago', async () => {
    const strava = fakeStrava(RUNS);
    const clock = { t: START };
    const { source: made } = source(strava, memoryStore(), clock);
    await made.listRecent(50);
    made.refresh();
    await settle();
    expect(strava.calls).toHaveLength(1);
  });
});

describe('StravaActivitySource, a range', () => {
  it('asks once per run of months, a day wider, and never for months to come', async () => {
    const strava = fakeStrava(RUNS);
    const clock = { t: START };
    const { source: made } = source(strava, memoryStore(), clock);
    const year = await made.listInRange({ start: '2026-01-01', end: '2026-12-31' });
    expect(year.map((activity) => activity.id)).toEqual([
      'strava:1',
      'strava:2',
      'strava:3',
      'strava:4',
    ]);
    expect(strava.calls).toEqual([
      `/athlete/activities ${JSON.stringify({
        after: Date.UTC(2025, 11, 31) / 1000,
        before: Date.UTC(2026, 11, 2) / 1000,
        per_page: 200,
        page: 1,
      })}`,
    ]);
    // Inside what it keeps: nothing more to ask.
    await made.listInRange({ start: '2026-11-01', end: '2026-11-30' });
    expect(strava.calls).toHaveLength(1);
  });

  it('shares a query between ranges asked at once', async () => {
    const strava = fakeStrava(RUNS);
    const { source: made } = source(strava, memoryStore(), { t: START });
    const [week, month] = await Promise.all([
      made.listInRange({ start: '2026-11-09', end: '2026-11-15' }),
      made.listInRange({ start: '2026-11-01', end: '2026-11-30' }),
    ]);
    expect(week.map((activity) => activity.id)).toEqual(['strava:4']);
    expect(month.map((activity) => activity.id)).toEqual(['strava:3', 'strava:4']);
    expect(strava.calls).toHaveLength(1);
  });

  it('pages through more than 200 activities', async () => {
    const many = Array.from({ length: 450 }, (_, i) =>
      stravaRun(100 + i, `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T0${i % 10}:00:00`),
    );
    const strava = fakeStrava(many);
    const { source: made } = source(strava, memoryStore(), { t: START });
    const october = await made.listInRange({ start: '2026-10-01', end: '2026-10-31' });
    expect(october).toHaveLength(450);
    expect(strava.calls).toHaveLength(3);
  });

  it('sees the newest activities in the months it keeps, and what was deleted', async () => {
    const strava = fakeStrava(RUNS);
    const clock = { t: START };
    const { source: made } = source(strava, memoryStore(), clock);
    await made.listInRange({ start: '2026-11-01', end: '2026-11-30' });
    await made.listRecent(50);
    clock.t += RECENT_REFRESH_MS;
    strava.setRuns([RUNS[0], RUNS[1], RUNS[3], stravaRun(5, '2026-11-13T07:00:00')]);
    made.refresh();
    await settle();
    const november = await made.listInRange({ start: '2026-11-01', end: '2026-11-30' });
    expect(november.map((activity) => activity.id)).toEqual(['strava:4', 'strava:5']);
  });

  it('asks again for a month kept 7 days, and deletes it from the phone first', async () => {
    const strava = fakeStrava(RUNS);
    const store = memoryStore();
    const clock = { t: START };
    await source(strava, store, clock).source.listInRange({
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(store.data.has('year-2026')).toBe(true);

    clock.t += 7 * DAY;
    const { source: later } = source(strava, store, clock);
    await later.getHeartRateZones();
    expect(store.data.has('year-2026')).toBe(false);
    await later.listInRange({ start: '2026-10-01', end: '2026-10-31' });
    expect(strava.calls.filter((call) => call.startsWith('/athlete/activities'))).toHaveLength(2);
  });

  it('fails when Strava does, and asks again next time', async () => {
    const strava = fakeStrava(RUNS);
    const { source: made } = source(strava, memoryStore(), { t: START });
    strava.fail(true);
    await expect(made.listInRange({ start: '2026-11-01', end: '2026-11-30' })).rejects.toThrow(
      'offline',
    );
    strava.fail(false);
    expect(await made.listInRange({ start: '2026-11-01', end: '2026-11-30' })).toHaveLength(2);
  });
});

describe('StravaActivitySource, an activity', () => {
  it('asks for its detail and streams once, and gives the calories of its detail', async () => {
    const strava = fakeStrava(RUNS);
    strava.setStreams(4, {
      time: { data: [0, 1, 2], series_type: 'distance', original_size: 3, resolution: 'high' },
      distance: { data: [0, 3, 6] },
    });
    const { source: made } = source(strava, memoryStore(), { t: START });
    const [activity, detail] = await Promise.all([
      made.getActivity('strava:4'),
      made.getActivityDetail('strava:4'),
    ]);
    expect(activity?.calories).toBe(700);
    expect(detail).not.toBeNull();
    await made.getActivityDetail('strava:4');
    expect(strava.calls).toEqual([
      '/activities/4',
      `/activities/4/streams ${JSON.stringify({
        keys: 'time,distance,altitude,velocity_smooth,heartrate,watts,cadence,moving',
        key_by_type: 'true',
      })}`,
      // Whether the athlete pays, before asking for the zones only they have.
      '/athlete',
      '/activities/4/zones',
    ]);
    // Refused: no zones.
    expect(detail?.zones).toBeNull();
  });

  it('asks only for the activity when that is all it needs, and its streams when opened', async () => {
    const strava = fakeStrava(RUNS);
    const store = memoryStore();
    const { source: made } = source(strava, store, { t: START });
    expect((await made.getActivity('strava:4'))?.calories).toBe(700);
    expect(strava.calls).toEqual(['/activities/4']);
    // Opened later, its detail asks only for what it lacks.
    expect(await made.getActivityDetail('strava:4')).not.toBeNull();
    expect(strava.calls.filter((call) => call === '/activities/4')).toHaveLength(1);
    // Its streams, the profile and its zones.
    expect(strava.calls).toHaveLength(4);
    // Both kept: a new source asks nothing.
    const again = source(strava, store, { t: START + 1000 }).source;
    await again.getActivity('strava:4');
    await again.getActivityDetail('strava:4');
    expect(strava.calls).toHaveLength(4);
  });

  it("gives a subscriber's pace zones with its detail", async () => {
    const strava = fakeStrava(RUNS);
    strava.setActivityZones(4, [
      { type: 'heartrate', distribution_buckets: [{ min: 0, max: 120, time: 60 }] },
      {
        type: 'pace',
        distribution_buckets: [
          { min: 0, max: 3, time: 100 },
          { min: 3, max: -1, time: 200 },
        ],
      },
    ]);
    const { source: made } = source(strava, memoryStore(), { t: START });
    const detail = await made.getActivityDetail('strava:4');
    expect(detail?.zones).toEqual({
      heartRate: null,
      pace: {
        zones: [
          { min: 0, max: 3 },
          { min: 3, max: null },
        ],
        seconds: [100, 200],
      },
      power: null,
    });
  });

  it('opens an activity without streams', async () => {
    const { source: made } = source(fakeStrava(RUNS), memoryStore(), { t: START });
    expect(await made.getActivityDetail('strava:3')).not.toBeNull();
  });

  it('is null for one Strava does not have, or an id that is not Strava', async () => {
    const { source: made } = source(fakeStrava(RUNS), memoryStore(), { t: START });
    expect(await made.getActivity('strava:99')).toBeNull();
    expect(await made.getActivity('fixture:1')).toBeNull();
  });

  it('opens as listed when its detail fails, and says so', async () => {
    const strava = fakeStrava(RUNS);
    const { source: made, errors } = source(strava, memoryStore(), { t: START });
    await made.listRecent(50);
    strava.fail(true);
    expect((await made.getActivity('strava:4'))?.name).toBe('Run 4');
    expect(errors).toEqual(['Could not load an activity from Strava: using it as listed']);
  });
});

describe('StravaActivitySource, the zones', () => {
  it('keeps the athlete zones a day, so that a change in them shows the day after', async () => {
    const strava = fakeStrava(RUNS);
    const clock = { t: START };
    const { source: made } = source(strava, memoryStore(), clock);
    expect(await made.getHeartRateZones()).not.toBeNull();
    await made.getHeartRateZones();
    expect(strava.calls).toEqual(['/athlete/zones']);
    clock.t += DAY;
    await made.getHeartRateZones();
    expect(strava.calls).toEqual(['/athlete/zones', '/athlete/zones']);
  });

  it("asks for an activity's zones only of an athlete who pays Strava, who alone has them", async () => {
    const strava = fakeStrava(RUNS);
    strava.setSummit(false);
    const { source: made } = source(strava, memoryStore(), { t: START });
    expect((await made.getActivityDetail('strava:4'))?.zones).toBeNull();
    expect(strava.calls.some((call) => call.endsWith('/zones'))).toBe(false);
  });

  it('remembers until the next day that Strava refused the zones, though it said it pays', async () => {
    const strava = fakeStrava(RUNS);
    const clock = { t: START };
    const { source: made } = source(strava, memoryStore(), clock);
    // No zones of activity 4: Strava refuses them, as to anyone who doesn't pay.
    await made.getActivityDetail('strava:4');
    await made.getActivityDetail('strava:3');
    expect(strava.calls.filter((call) => call.endsWith('/zones'))).toEqual(['/activities/4/zones']);
    clock.t += DAY;
    await made.getActivityDetail('strava:2');
    expect(strava.calls.filter((call) => call.endsWith('/zones'))).toHaveLength(2);
  });

  it('is null without the permission to read them', async () => {
    const strava = fakeStrava(RUNS);
    strava.setZones(403);
    const { source: made } = source(strava, memoryStore(), { t: START });
    expect(await made.getHeartRateZones()).toBeNull();
  });
});

describe('StravaActivitySource, pulled to refresh', () => {
  it('asks again for the newest activities, the profile and the zones, and tells of a change', async () => {
    const strava = fakeStrava(RUNS);
    const clock = { t: START };
    const { source: made } = source(strava, memoryStore(), clock);
    await made.listRecent(3);
    await made.getAthletePhoto();
    await made.getHeartRateZones();
    const changes: number[] = [];
    made.onChange(() => changes.push(clock.t));
    strava.setRuns([...RUNS, stravaRun(5, '2026-11-13T08:00:00')]);
    clock.t += 15 * MINUTE;
    await made.pull();
    expect(strava.calls.slice(3)).toEqual([
      '/athlete/activities {"per_page":50,"page":1}',
      '/athlete',
      '/athlete/zones',
    ]);
    expect(changes).toHaveLength(1);
  });

  it('asks nothing pulled again soon: the list at most every 2 minutes, the profile every 15', async () => {
    const strava = fakeStrava(RUNS);
    const clock = { t: START };
    const { source: made } = source(strava, memoryStore(), clock);
    await made.listRecent(3);
    await made.getAthletePhoto();
    await made.getHeartRateZones();
    const asked = strava.calls.length;
    clock.t += MINUTE;
    await made.pull();
    expect(strava.calls).toHaveLength(asked);
    clock.t += 2 * MINUTE;
    await made.pull();
    expect(strava.calls.slice(asked)).toEqual(['/athlete/activities {"per_page":50,"page":1}']);
  });
});

describe("StravaActivitySource, the athlete's photo", () => {
  it('keeps it a day, then asks again', async () => {
    const strava = fakeStrava(RUNS);
    const clock = { t: START };
    const { source: made } = source(strava, memoryStore(), clock);
    expect(await made.getAthletePhoto()).toBe(PHOTO);
    expect(await made.getAthletePhoto()).toBe(PHOTO);
    expect(strava.calls).toEqual(['/athlete']);
    clock.t += DAY;
    expect(await made.getAthletePhoto()).toBe(PHOTO);
    expect(strava.calls).toEqual(['/athlete', '/athlete']);
  });
});

describe('StravaActivitySource, older activities', () => {
  it('lists those before a start, newest first, and keeps the page for a week', async () => {
    const strava = fakeStrava(RUNS);
    const clock = { t: START };
    const { source: made } = source(strava, memoryStore(), clock);
    const page = await made.listBefore('2026-11-01T08:00:00Z', 2);
    expect(page.map((activity) => activity.id)).toEqual(['strava:2', 'strava:1']);
    await made.listBefore('2026-11-01T08:00:00Z', 2);
    const before = Date.parse('2026-11-01T08:00:00Z') / 1000;
    expect(strava.calls).toEqual([
      `/athlete/activities ${JSON.stringify({ before, per_page: 2, page: 1 })}`,
    ]);
    clock.t += 7 * DAY;
    await made.listBefore('2026-11-01T08:00:00Z', 2);
    expect(strava.calls).toHaveLength(2);
  });

  it('leaves out an activity it cannot read, and fills the page from the next', async () => {
    // Run 3 comes with a heart rate of 0, which isn't one: left out, the rest still listed.
    const broken = { ...stravaRun(3, '2026-11-01T08:00:00'), average_heartrate: 0 };
    const strava = fakeStrava([...RUNS.filter((run) => run.id !== 3), broken]);
    const { source: made, errors } = source(strava, memoryStore(), { t: START });
    expect((await made.listRecent(50)).map((activity) => activity.id)).toEqual([
      'strava:4',
      'strava:2',
      'strava:1',
    ]);
    expect(errors).toEqual(['Leaving out activity 3, which Strava sent unreadable']);
    // A full page with it left out is filled from the next, so it isn't taken for the last one.
    const page = await made.listBefore('2026-11-13T08:00:00Z', 2);
    expect(page.map((activity) => activity.id)).toEqual(['strava:4', 'strava:2']);
    // The months of a summary go on past it too.
    const month = await made.listInRange({ start: '2026-11-01', end: '2026-11-30' });
    expect(month.map((activity) => activity.id)).toEqual(['strava:4']);
  });

  it('gives fewer than asked at the first activity, and none past it', async () => {
    const strava = fakeStrava(RUNS);
    const { source: made } = source(strava, memoryStore(), { t: START });
    expect(await made.listBefore('2026-10-02T08:00:00Z', 50)).toHaveLength(1);
    expect(await made.listBefore('2026-09-10T08:00:00Z', 50)).toEqual([]);
  });

  it('opens an older activity as listed when its detail fails', async () => {
    const strava = fakeStrava(RUNS);
    const { source: made } = source(strava, memoryStore(), { t: START });
    await made.listBefore('2026-10-02T08:00:00Z', 50);
    strava.fail(true);
    expect((await made.getActivity('strava:1'))?.name).toBe('Run 1');
  });

  it('refuses a limit out of 1..200 and a start that is no date', async () => {
    const { source: made } = source(fakeStrava(RUNS), memoryStore(), { t: START });
    await expect(made.listBefore('2026-11-01T08:00:00Z', 0)).rejects.toThrow(RangeError);
    await expect(made.listBefore('2026-11-01T08:00:00Z', 201)).rejects.toThrow(RangeError);
    await expect(made.listBefore('yesterday', 50)).rejects.toThrow(RangeError);
  });
});
