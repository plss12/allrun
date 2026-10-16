import type { Activity } from '@/core/activity';
import type { DateRange } from '@/core/dates';

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
}
