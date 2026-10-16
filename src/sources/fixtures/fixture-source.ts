import type { Activity } from '@/core/activity';
import type { DateRange } from '@/core/dates';
import { selectActivities } from '@/core/summary';
import type { ActivitySource } from '@/sources/activity-source';
import { parseStravaActivities } from '@/sources/strava/schema';

import { type FixtureOptions, generateStravaFixtures } from './generate';

/**
 * {@link ActivitySource} backed by synthetic Strava-shaped data. The data goes through the same
 * validation and mapping as real Strava responses, so swapping in the Strava source later
 * changes nothing downstream.
 */
export class FixtureActivitySource implements ActivitySource {
  private readonly activities: readonly Activity[];

  constructor(options: FixtureOptions) {
    this.activities = parseStravaActivities(generateStravaFixtures(options)).sort((a, b) =>
      a.startUtc.localeCompare(b.startUtc),
    );
  }

  /** @throws RangeError if `limit` is not a non-negative integer. */
  async listRecent(limit: number): Promise<Activity[]> {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError(`Invalid limit: ${limit}`);
    }
    return this.activities.slice(Math.max(0, this.activities.length - limit)).reverse();
  }

  async listInRange(range: DateRange): Promise<Activity[]> {
    return selectActivities(this.activities, range);
  }
}
