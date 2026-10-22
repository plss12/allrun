import type { Activity } from '@/core/activity';
import type { ActivityDetail } from '@/core/activity-detail';
import type { DateRange } from '@/core/dates';
import type { HeartRateZones } from '@/core/heart-rate-zones';

/**
 * Where activities come from: synthetic fixtures during development, Strava in production, and
 * watch-brand APIs later. Data is fetched on demand: the recent list first, a whole month or
 * year only when the user builds a summary (Strava forbids caching its data beyond 7 days).
 */
export interface ActivitySource {
  /** The `limit` most recent activities, newest first. */
  listRecent(limit: number): Promise<Activity[]>;
  /** Every activity whose local start date falls within `range`, oldest first. */
  listInRange(range: DateRange): Promise<Activity[]>;
  /** The activity with this `Activity.id`, or `null` if the source has none. */
  getActivity(id: string): Promise<Activity | null>;
  /**
   * What the activity recorded along the way (streams and splits), for its charts; fetched only
   * when an activity is opened in the editor. `null` if the source has no such activity.
   */
  getActivityDetail(id: string): Promise<ActivityDetail | null>;
  /**
   * The athlete's heart rate zones, for the zones of a heart rate chart; `null` when the source
   * has none (an athlete without a heart rate monitor).
   */
  getHeartRateZones(): Promise<HeartRateZones | null>;
}
