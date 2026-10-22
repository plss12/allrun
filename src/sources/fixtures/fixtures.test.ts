import { customRange } from '@/core/dates';
import { pathLengthMeters } from '@/core/geo';
import { decodePolyline } from '@/core/polyline';
import { parseStravaActivities } from '@/sources/strava/schema';

import { FixtureActivitySource } from './fixture-source';
import { generateStravaFixtures } from './generate';

const options = { endDate: '2026-10-18', days: 365, seed: 42 } as const;

describe('generateStravaFixtures', () => {
  it('is deterministic for a given seed', () => {
    expect(generateStravaFixtures(options)).toEqual(generateStravaFixtures(options));
    expect(generateStravaFixtures({ ...options, seed: 7 })).not.toEqual(
      generateStravaFixtures(options),
    );
  });

  it('produces valid Strava payloads within the requested days', () => {
    const activities = parseStravaActivities(generateStravaFixtures(options));
    expect(activities.length).toBeGreaterThan(150);
    for (const activity of activities) {
      expect(activity.localDate >= '2025-10-19' && activity.localDate <= '2026-10-18').toBe(true);
    }
  });

  it('mixes sports, including sessions without distance or GPS', () => {
    const activities = parseStravaActivities(generateStravaFixtures(options));
    const groups = new Set(activities.map((activity) => activity.sportFamily));
    expect([...groups].sort()).toEqual(['other', 'ride', 'run', 'swim', 'training', 'walk']);
    expect(activities.some((a) => a.sportType === 'WeightTraining' && a.distanceMeters === 0)).toBe(
      true,
    );
    expect(activities.some((a) => a.sportType === 'Swim' && a.routePolyline === null)).toBe(true);
  });

  it('draws routes whose length matches the activity distance', () => {
    const activities = parseStravaActivities(generateStravaFixtures(options));
    for (const activity of activities.filter((a) => a.routePolyline !== null)) {
      const length = pathLengthMeters(decodePolyline(activity.routePolyline ?? ''));
      expect(Math.abs(length - activity.distanceMeters) / activity.distanceMeters).toBeLessThan(
        0.02,
      );
    }
  });

  it('rejects an invalid number of days', () => {
    expect(() => generateStravaFixtures({ endDate: '2026-10-18', days: 0 })).toThrow(RangeError);
  });
});

describe('FixtureActivitySource', () => {
  const source = new FixtureActivitySource(options);

  it('lists the most recent activities, newest first', async () => {
    const recent = await source.listRecent(5);
    expect(recent).toHaveLength(5);
    const starts = recent.map((activity) => activity.startUtc);
    expect(starts).toEqual([...starts].sort().reverse());
  });

  it('returns every activity when asking for more than exist', async () => {
    const small = new FixtureActivitySource({ endDate: '2026-10-18', days: 7, seed: 3 });
    const all = await small.listInRange(customRange('2026-10-12', '2026-10-18'));
    expect(all.length).toBeGreaterThan(1);
    // One more than exist: a negative slice index would return only the last activity.
    expect(await small.listRecent(all.length + 1)).toHaveLength(all.length);
    expect(await small.listRecent(0)).toEqual([]);
    await expect(small.listRecent(-1)).rejects.toThrow(RangeError);
  });

  it('finds an activity by id, or null', async () => {
    const [latest] = await source.listRecent(1);
    expect(await source.getActivity(latest.id)).toEqual(latest);
    expect(await source.getActivity('strava:0')).toBeNull();
  });

  it('lists a period oldest first', async () => {
    const october = await source.listInRange(customRange('2026-10-01', '2026-10-18'));
    expect(october.length).toBeGreaterThan(5);
    expect(october.every((a) => a.localDate >= '2026-10-01' && a.localDate <= '2026-10-18')).toBe(
      true,
    );
    expect(october[0].startUtc < october[october.length - 1].startUtc).toBe(true);
  });
});
