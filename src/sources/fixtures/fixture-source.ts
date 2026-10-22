import type { Activity } from '@/core/activity';
import type { ActivityDetail } from '@/core/activity-detail';
import type { HeartRateZones } from '@/core/heart-rate-zones';
import type { DateRange } from '@/core/dates';
import { selectActivities } from '@/core/summary';
import type { ActivitySource } from '@/sources/activity-source';
import { parseStravaDetail } from '@/sources/strava/detail';
import { parseStravaActivities } from '@/sources/strava/schema';
import { parseStravaZones } from '@/sources/strava/zones';

import { generateStravaDetail } from './detail';

import { type FixtureOptions, generateStravaFixtures } from './generate';
import { generateStravaZones } from './zones';

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

  async getActivity(id: string): Promise<Activity | null> {
    return this.activities.find((activity) => activity.id === id) ?? null;
  }

  /** Synthetic streams and splits, the same for an activity every time (seeded by its id). */
  async getActivityDetail(id: string): Promise<ActivityDetail | null> {
    const activity = await this.getActivity(id);
    if (activity === null) {
      return null;
    }
    // Through the same validation and mapping as Strava's responses.
    const { streams, splits } = generateStravaDetail(activity, seedOf(id));
    return parseStravaDetail(JSON.parse(JSON.stringify(streams)), splits);
  }

  /** The synthetic athlete's zones, through the same validation as Strava's. */
  async getHeartRateZones(): Promise<HeartRateZones | null> {
    return parseStravaZones(generateStravaZones());
  }
}

/** A seed from an id: the same id always gives the same seed (FNV-1a). Time O(id length). */
function seedOf(id: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16_777_619);
  }
  return hash >>> 0;
}
