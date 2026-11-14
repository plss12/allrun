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
import { generateStravaActivityZones, generateStravaZones } from './zones';

/** An activity as a list gives it: without its calories. */
const listed = (activity: Activity): Activity => ({ ...activity, calories: null });

/**
 * {@link ActivitySource} backed by synthetic Strava-shaped data. The data goes through the same
 * validation and mapping as real Strava responses, so swapping in the Strava source later
 * changes nothing downstream. As Strava's, its lists have no calories: only an activity asked for
 * alone (its detail, `getActivity`) has them, so that nothing works here that can't with Strava.
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
    return this.activities
      .slice(Math.max(0, this.activities.length - limit))
      .reverse()
      .map(listed);
  }

  async listBefore(startUtc: string, limit: number): Promise<Activity[]> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(`Invalid limit: ${limit}`);
    }
    const older = this.activities.filter((activity) => activity.startUtc < startUtc);
    return older
      .slice(Math.max(0, older.length - limit))
      .reverse()
      .map(listed);
  }

  async listInRange(range: DateRange): Promise<Activity[]> {
    return selectActivities(this.activities, range).map(listed);
  }

  async getActivity(id: string): Promise<Activity | null> {
    return this.activities.find((activity) => activity.id === id) ?? null;
  }

  /** Synthetic streams, splits and laps, the same for an activity every time (seeded by its id). */
  async getActivityDetail(id: string): Promise<ActivityDetail | null> {
    const activity = await this.getActivity(id);
    if (activity === null) {
      return null;
    }
    // Through the same validation and mapping as Strava's responses.
    const { streams, detailed } = generateStravaDetail(activity, seedOf(id));
    return parseStravaDetail(
      JSON.parse(JSON.stringify(streams)),
      detailed,
      generateStravaActivityZones(activity, streams),
    );
  }

  /** The synthetic athlete's zones, through the same validation as Strava's. */
  async getHeartRateZones(): Promise<HeartRateZones | null> {
    return parseStravaZones(generateStravaZones());
  }

  /** The synthetic athlete has no photo: the button shows the initial. */
  async getAthletePhoto(): Promise<string | null> {
    return null;
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
