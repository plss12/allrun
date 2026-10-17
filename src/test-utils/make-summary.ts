import type { Activity } from '@/core/activity';
import { weekRange } from '@/core/dates';
import { type PeriodSummary, summarize } from '@/core/summary';

import { makeActivity } from './make-activity';

/**
 * Builds a test summary of the week of 12–18 October 2026: by default one 10 km run, with
 * distance and elevation, so every summary widget has something to show.
 */
export function makeSummary(activities: readonly Activity[] = [makeActivity()]): PeriodSummary {
  return summarize(activities, weekRange('2026-10-14'));
}
