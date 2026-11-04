import { cardMetrics, type MetricId, metricValue } from '@/core/metrics';
import { formatPlace } from '@/core/place';
import { periodTotals, summaryMetricValue } from '@/core/summary-metrics';
import type { ImageMount } from '@/core/template';
import { formatActivityDate, formatShortRange } from '@/ui/format';

import {
  type ActivityData,
  type EditorData,
  periodName,
  plainMetricText,
  summaryTotalText,
  type SummaryData,
  type TextContext,
} from './editor-data';
import { periodCount, shortDistance, type Translate } from './instant-caption';

/** What a holder writes along one of its sides, spread along it. */
export interface MountSide {
  readonly texts: readonly string[];
}

/**
 * What a holder writes in the bands above and below its window, as the marks on a reel's edge: only
 * real data of what it shows, never a film's own numbers (decision of the user).
 */
export interface MountMarks {
  readonly topLeft: string | null;
  readonly topRight: string | null;
  readonly bottomLeft: string | null;
  readonly bottomRight: string | null;
}

/** Everything a holder writes. */
export interface MountText {
  readonly sides: readonly [MountSide, MountSide];
  readonly marks: MountMarks;
}

/**
 * The app's name, written in the holder's own letters (decision of the user: its logo looked out of
 * place among them).
 */
const BRAND_NAME = 'ALLRUN';

const NO_MARKS: MountMarks = { topLeft: null, topRight: null, bottomLeft: null, bottomRight: null };

/** Where an arrow goes in a text, as on a film's edge; the holder draws it. */
export const MOUNT_ARROW = '▸';

/** A date as a camera stamps it: "14-10-2026". */
const stamped = (date: string) => date.split('/').join('-');

/**
 * What a holder writes (see `IMAGE_MOUNTS`). Time and space O(1).
 *
 * - `filmFrame`: at its sides, its sport and its first three data; on its reel marks, its date and
 *   start time over where it started, when known, and AllRun's name. A period writes its name and
 *   how many activities, and its first three totals; and its dates over AllRun's name.
 * - `lightNegative`: at its sides, AllRun's name and its date and start time as a camera stamps them,
 *   and one line with its distance (its time without one) and sport. A period writes AllRun's name
 *   and its dates, and its distance (its time without one) and how many activities.
 */
export function mountCaption(
  mount: ImageMount,
  data: EditorData,
  context: TextContext,
  translate: Translate,
): MountText {
  return data.mode === 'activity'
    ? activityText(mount, data, context, translate)
    : periodText(mount, data, context, translate);
}

function activityText(
  mount: ImageMount,
  { activity, place }: ActivityData,
  context: TextContext,
  translate: Translate,
): MountText {
  const time = formatActivityDate(activity.startLocal, context.locale, 'time');
  const sport = translate(`widgets.tower.sports.${activity.sportModality}`);
  const distance = metricValue(activity, 'distance') ?? 0;
  const written = (metric: MetricId) =>
    metric === 'distance'
      ? shortDistance(distance, context)
      : plainMetricText(activity, metric, context, 'tight');
  const date = stamped(formatActivityDate(activity.startLocal, context.locale, 'numeric'));
  if (mount === 'filmFrame') {
    return {
      sides: [{ texts: [sport] }, { texts: cardMetrics(activity).map(written) }],
      marks: {
        topLeft: date,
        topRight: time,
        bottomLeft: place === null ? null : formatPlace(place, 'city'),
        bottomRight: BRAND_NAME,
      },
    };
  }
  return {
    sides: [
      { texts: [BRAND_NAME, `${date} ${time}`] },
      {
        texts: [
          `${distance > 0 ? shortDistance(distance, context) : written('movingTime')} · ${sport}`,
        ],
      },
    ],
    marks: NO_MARKS,
  };
}

function periodText(
  mount: ImageMount,
  data: SummaryData,
  context: TextContext,
  translate: Translate,
): MountText {
  const { summary } = data;
  const count = periodCount(data, translate);
  const totals = periodTotals(summary);
  const total = (metric: (typeof totals)[number]) =>
    metric === 'totalDistance'
      ? shortDistance(summary.totalDistanceMeters, context)
      : summaryTotalText(metric, summaryMetricValue(summary, metric) ?? 0, context, translate);
  const range = formatShortRange(summary.range, context.locale);
  if (mount === 'filmFrame') {
    return {
      sides: [
        { texts: [`${periodName(data, context, translate)} ${MOUNT_ARROW} ${count}`] },
        { texts: totals.map(total) },
      ],
      marks: { ...NO_MARKS, topLeft: range, bottomRight: BRAND_NAME },
    };
  }
  return {
    sides: [{ texts: [BRAND_NAME, range] }, { texts: [`${total(totals[0])} · ${count}`] }],
    marks: NO_MARKS,
  };
}
