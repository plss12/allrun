import type { Activity } from './activity';
import { availableMetrics, cardMetrics, type MetricId } from './metrics';
import type { SportFamily } from './sports';
import {
  type ActivityBlock,
  BLOCK_COLUMN_COUNTS,
  DAY_LAYOUTS,
  HEADLINE_LAYOUTS,
  ROUTE_LAYOUTS,
  SPORT_LAYOUTS,
} from './template';

/**
 * What the mixed widgets of an activity show (ADR 009). They pick their data by sport, as the
 * activity's card does: a run leads with its distance, pace and time; a gym session with its
 * time, heart rate and calories. Nothing is rounded: the widgets write each datum as its own
 * data widget does.
 */

/** Second readings of a datum (elapsed after moving time, highest after average heart rate). */
const SECOND_READINGS: readonly MetricId[] = ['elapsedTime', 'maxHeartRate'];

/** The two data a widget of two shows when the activity has them: how far and how long. */
const PAIR: readonly MetricId[] = ['distance', 'movingTime'];

/**
 * The first `count` data of `activity` for a mixed widget, most telling first: those of its card
 * (see `cardMetrics`), then the rest of its sport's data in the sport's order, and last the
 * second readings of a datum already shown. Two data are its distance and time when it has both.
 * Fewer when the activity has fewer. Time O(m) for the m metrics of its sport.
 */
export function blockMetrics(activity: Activity, count: number): MetricId[] {
  const card = cardMetrics(activity);
  if (count === 2 && PAIR.every((metric) => card.includes(metric))) {
    return [...PAIR];
  }
  const rest = availableMetrics(activity).filter((metric) => !card.includes(metric));
  const ordered = [
    ...card,
    ...rest.filter((metric) => !SECOND_READINGS.includes(metric)),
    ...rest.filter((metric) => SECOND_READINGS.includes(metric)),
  ];
  return ordered.slice(0, count);
}

/** Data each version of a design shows, at most. */
export function blockDataCount(block: ActivityBlock): number {
  switch (block.design) {
    case 'columns':
      return block.count;
    case 'sport':
      return block.layout === 'list' ? 4 : 3;
    case 'route':
      return block.layout === 'between' ? 2 : 3;
    case 'headline':
    case 'day':
      return 3;
  }
}

/**
 * Every version of the mixed widgets that `activity` can fill, design by design, in the order of
 * the gallery. Columns are only offered up to the number of data it has (a gym session has fewer
 * than six), the route's only when it has one, and nothing for an activity without data. Time
 * O(m) for the m metrics of its sport.
 */
export function activityBlocks(activity: Activity): ActivityBlock[] {
  const available = blockMetrics(activity, Math.max(...BLOCK_COLUMN_COUNTS)).length;
  if (available === 0) {
    return [];
  }
  return [
    ...HEADLINE_LAYOUTS.map((layout) => ({ design: 'headline', layout }) as const),
    ...BLOCK_COLUMN_COUNTS.filter((count) => count <= available).map(
      (count) => ({ design: 'columns', count }) as const,
    ),
    ...(activity.routePolyline === null
      ? []
      : ROUTE_LAYOUTS.map((layout) => ({ design: 'route', layout }) as const)),
    ...DAY_LAYOUTS.map((layout) => ({ design: 'day', layout }) as const),
    ...SPORT_LAYOUTS.map((layout) => ({ design: 'sport', layout }) as const),
  ];
}

/** The icons a mixed widget can draw: one per sport family, and hiking's own. */
export type SportIconId = SportFamily | 'hike';

/** The icon of an activity's sport: its family's, or the hiker for a hike. */
export function sportIcon(activity: Activity): SportIconId {
  return activity.sportModality === 'hike' ? 'hike' : activity.sportFamily;
}
