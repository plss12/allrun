import type { Activity } from '@/core/activity';
import type { ActivityDetail } from '@/core/activity-detail';

import { FixtureActivitySource } from './fixture-source';

const source = new FixtureActivitySource({ endDate: '2026-10-18', days: 120, seed: 42 });

async function detailOf(activity: Activity): Promise<ActivityDetail> {
  const detail = await source.getActivityDetail(activity.id);
  if (detail === null) {
    throw new Error(`No detail for ${activity.id}`);
  }
  return detail;
}

const last = (values: readonly number[]) => values[values.length - 1];
const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

describe('FixtureActivitySource.getActivityDetail', () => {
  it("agrees with every activity's totals", async () => {
    const activities = await source.listRecent(120);
    expect(activities.length).toBeGreaterThan(50);
    for (const activity of activities) {
      const { streams, splits } = await detailOf(activity);
      if (streams === null) {
        throw new Error(`No streams for ${activity.id}`);
      }
      const length = streams.time.length;
      for (const stream of [
        streams.distance,
        streams.altitude,
        streams.speed,
        streams.heartRate,
        streams.power,
      ]) {
        expect(stream === null || stream.length === length).toBe(true);
      }
      expect(last(streams.time)).toBeCloseTo(activity.movingTimeSeconds, -1);
      if (activity.distanceMeters > 0) {
        expect(last(streams.distance ?? [0])).toBeCloseTo(activity.distanceMeters, 0);
        const covered = splits.metric.reduce((sum, split) => sum + split.distanceMeters, 0);
        expect(covered).toBeCloseTo(activity.distanceMeters, -1);
        expect(splits.metric).toHaveLength(Math.ceil(activity.distanceMeters / 1000 - 0.001));
      } else {
        expect(streams.distance).toBeNull();
        expect(splits.metric).toEqual([]);
      }
      if (streams.altitude !== null) {
        const climbed = streams.altitude.reduce(
          (sum, value, i, all) => sum + (i > 0 ? Math.max(0, value - all[i - 1]) : 0),
          0,
        );
        expect(climbed / activity.elevationGainMeters).toBeGreaterThan(0.97);
        expect(climbed / activity.elevationGainMeters).toBeLessThan(1.03);
      }
      if (activity.averageHeartRate !== null && streams.heartRate !== null) {
        expect(Math.abs(mean(streams.heartRate) - activity.averageHeartRate)).toBeLessThan(1);
      }
      expect(streams.power === null).toBe(activity.averagePowerWatts === null);
    }
  });

  it('records no altitude without a route, and the same detail every time', async () => {
    const activities = await source.listRecent(120);
    const indoor = activities.find((activity) => activity.routePolyline === null);
    if (indoor === undefined) {
      throw new Error('No indoor activity in the fixtures');
    }
    expect((await detailOf(indoor)).streams?.altitude).toBeNull();
    expect(await detailOf(activities[0])).toEqual(await detailOf(activities[0]));
  });

  it('has no detail for an unknown activity', async () => {
    expect(await source.getActivityDetail('strava:0')).toBeNull();
  });
});
