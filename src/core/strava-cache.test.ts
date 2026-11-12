import {
  type CachedActivity,
  type CachedMonth,
  expiredKeys,
  fetchWindows,
  isCacheFresh,
  mergeRecent,
  monthsFromWindow,
  monthsIn,
  monthsToFetch,
  STRAVA_CACHE_MS,
} from './strava-cache';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 13, 12);

function run(id: number, local: string, utc = local): CachedActivity {
  return { id, start_date: `${utc}Z`, start_date_local: `${local}Z` };
}

function month(activities: CachedActivity[], fetchedAt = NOW): CachedMonth<CachedActivity> {
  return { fetchedAt, activities };
}

describe('isCacheFresh', () => {
  it('keeps for less than 7 days', () => {
    expect(isCacheFresh(NOW - STRAVA_CACHE_MS + 1, NOW)).toBe(true);
    expect(isCacheFresh(NOW - STRAVA_CACHE_MS, NOW)).toBe(false);
  });

  it('does not trust a time in the future (a clock moved back)', () => {
    expect(isCacheFresh(NOW + DAY, NOW)).toBe(false);
  });
});

describe('monthsIn', () => {
  it('lists every month a range touches, across a year', () => {
    expect(monthsIn({ start: '2025-11-28', end: '2026-02-03' })).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('gives one month for a week inside it', () => {
    expect(monthsIn({ start: '2026-11-09', end: '2026-11-15' })).toEqual(['2026-11']);
  });

  it('refuses an invalid date', () => {
    expect(() => monthsIn({ start: '2026-02-30', end: '2026-03-01' })).toThrow(RangeError);
  });
});

describe('monthsToFetch', () => {
  it('asks for the months missing or 7 days old', () => {
    const cached = new Map([
      ['2026-09', month([], NOW - 8 * DAY)],
      ['2026-10', month([], NOW - DAY)],
    ]);
    expect(monthsToFetch(['2026-08', '2026-09', '2026-10', '2026-11'], cached, NOW)).toEqual([
      '2026-08',
      '2026-09',
      '2026-11',
    ]);
  });
});

describe('fetchWindows', () => {
  it('asks for each run of consecutive months once, a day wider on each side', () => {
    const windows = fetchWindows(['2026-11', '2026-08', '2026-09', '2026-12', '2026-09']);
    expect(windows.map((window) => window.months)).toEqual([
      ['2026-08', '2026-09'],
      ['2026-11', '2026-12'],
    ]);
    expect(windows[0].after).toBe(Date.UTC(2026, 6, 31) / 1000);
    expect(windows[0].before).toBe(Date.UTC(2026, 9, 2) / 1000);
    expect(windows[1].after).toBe(Date.UTC(2026, 9, 31) / 1000);
    expect(windows[1].before).toBe(Date.UTC(2027, 0, 2) / 1000);
  });

  it('runs across a new year', () => {
    expect(fetchWindows(['2026-12', '2027-01']).map((window) => window.months)).toEqual([
      ['2026-12', '2027-01'],
    ]);
  });

  it('asks for nothing when no month is missing', () => {
    expect(fetchWindows([])).toEqual([]);
  });
});

describe('monthsFromWindow', () => {
  it('fills each month of the run by local start, sorted, empty ones too', () => {
    const [window] = fetchWindows(['2026-09', '2026-10']);
    const months = monthsFromWindow(
      window,
      [
        run(3, '2026-10-05T08:00:00'),
        run(1, '2026-09-01T00:30:00', '2026-08-31T22:30:00'),
        // In the window's margin: a month the run doesn't fill.
        run(9, '2026-08-31T23:00:00'),
        run(2, '2026-09-02T08:00:00'),
      ],
      NOW,
    );
    expect([...months.keys()]).toEqual(['2026-09', '2026-10']);
    expect(months.get('2026-09')?.activities.map((activity) => activity.id)).toEqual([1, 2]);
    expect(months.get('2026-10')).toEqual({
      fetchedAt: NOW,
      activities: [run(3, '2026-10-05T08:00:00')],
    });
  });

  it('keeps a month with no activities as empty', () => {
    const [window] = fetchWindows(['2026-07']);
    expect(monthsFromWindow(window, [], NOW).get('2026-07')).toEqual({
      fetchedAt: NOW,
      activities: [],
    });
  });
});

describe('mergeRecent', () => {
  const kept = new Map([
    [
      '2026-11',
      month(
        [
          run(1, '2026-11-01T08:00:00'),
          run(2, '2026-11-05T08:00:00'),
          run(3, '2026-11-09T08:00:00'),
        ],
        NOW - DAY,
      ),
    ],
    ['2026-10', month([run(0, '2026-10-20T08:00:00')], NOW - DAY)],
  ]);

  it('adds new activities, replaces changed ones and drops deleted ones in the span covered', () => {
    const changed = { ...run(3, '2026-11-09T08:00:00'), name: 'renamed' };
    const merged = mergeRecent(
      kept,
      [run(4, '2026-11-12T08:00:00'), changed, run(1, '2026-11-01T08:00:00')],
      false,
    );
    // 2 was within the span (after 1) and is gone: deleted on Strava.
    expect(merged.get('2026-11')?.activities).toEqual([
      run(1, '2026-11-01T08:00:00'),
      changed,
      run(4, '2026-11-12T08:00:00'),
    ]);
    expect(merged.get('2026-11')?.fetchedAt).toBe(NOW - DAY);
    // Older than the span: kept as it was.
    expect(merged.get('2026-10')?.activities).toEqual([run(0, '2026-10-20T08:00:00')]);
  });

  it('moves an activity whose date changed to its new month', () => {
    const moved = run(2, '2026-10-30T08:00:00');
    const merged = mergeRecent(
      kept,
      [run(3, '2026-11-09T08:00:00'), run(1, '2026-11-01T08:00:00'), moved],
      false,
    );
    expect(merged.get('2026-11')?.activities.map((activity) => activity.id)).toEqual([1, 3]);
    expect(merged.get('2026-10')?.activities.map((activity) => activity.id)).toEqual([0, 2]);
  });

  it('leaves out new activities of months the phone does not keep', () => {
    const merged = mergeRecent(kept, [run(7, '2026-12-01T08:00:00')], false);
    expect([...merged.keys()]).toEqual(['2026-11', '2026-10']);
  });

  it('with the whole history, drops anything not in it', () => {
    const merged = mergeRecent(kept, [run(3, '2026-11-09T08:00:00')], true);
    expect(merged.get('2026-11')?.activities.map((activity) => activity.id)).toEqual([3]);
    expect(merged.get('2026-10')?.activities).toEqual([]);
  });

  it('changes nothing with an empty page of a longer history', () => {
    expect(mergeRecent(kept, [], false)).toEqual(kept);
  });
});

describe('expiredKeys', () => {
  it('lists what is 7 days old', () => {
    const at = new Map([
      ['year-2026', NOW - DAY],
      ['detail-1', NOW - 7 * DAY],
      ['zones', NOW - 10 * DAY],
    ]);
    expect(expiredKeys(at, NOW)).toEqual(['detail-1', 'zones']);
  });
});
