import { cardMetrics, metricValue, type MetricId } from '@/core/metrics';
import { formatPlace } from '@/core/place';
import type { InstantCaption } from '@/core/template';
import { metersToUnit } from '@/core/units';
import { formatActivityDate, formatShortDate, formatShortRange } from '@/ui/format';

import {
  type ActivityData,
  type EditorData,
  type LabelKey,
  periodName,
  plainMetricText,
  plainSummaryText,
  type SummaryData,
  type TextContext,
} from './editor-data';

/** Translates a label, its placeholders filled with `values`. */
type Translate = (key: LabelKey, values?: Readonly<Record<string, string>>) => string;

/** An instant photo's caption: its lines, in columns, and a shorter first line. */
export interface CaptionText {
  /** One column of lines, centered, or two at the sides. */
  readonly columns: readonly (readonly string[])[];
  /**
   * The first line shorter, written instead when it would have to shrink too much to fit: a place
   * by its city alone ("Andújar" for "Andújar, Jaén"). Absent when it has none.
   */
  readonly shorterFirst?: string;
}

/**
 * What an instant photo writes under its picture (see `INSTANT_CAPTIONS`), in columns of lines:
 * one, centered, for `place`; two, at the sides, for `data` (see `CaptionText`). As written by hand on a Polaroid:
 * distances with one decimal ("14,5 kilómetros", "11,3 km"). Time and space O(1).
 *
 * - An activity: where it started ("Andújar, Jaén", its date when it can't be named) over its
 *   distance in words (its time without one); or its date and start time at the left and its two
 *   main data at the right, as its card in the app (`cardMetrics`: "11,3 km" and "5:55/km").
 * - A period: its name over its total distance in words (its time without one); or its dates and
 *   how many activities at the left and its total distance and time at the right.
 */
export function instantCaption(
  caption: InstantCaption,
  data: EditorData,
  context: TextContext,
  translate: Translate,
): CaptionText {
  return data.mode === 'activity'
    ? activityCaption(caption, data, context, translate)
    : periodCaption(caption, data, context, translate);
}

function activityCaption(
  caption: InstantCaption,
  { activity, place }: ActivityData,
  context: TextContext,
  translate: Translate,
): CaptionText {
  const date = formatShortDate(activity.localDate, context.locale);
  const distance = metricValue(activity, 'distance') ?? 0;
  if (caption === 'place') {
    const named = place === null ? null : formatPlace(place, 'cityRegion');
    const city = place === null ? null : formatPlace(place, 'city');
    return {
      columns: [
        [
          named ?? date,
          distance > 0
            ? distanceInWords(distance, context, translate)
            : plainMetricText(activity, 'movingTime', context, 'brief'),
        ],
      ],
      ...(city === null || city === named ? {} : { shorterFirst: city }),
    };
  }
  const written = (metric: MetricId) =>
    metric === 'distance'
      ? shortDistance(distance, context)
      : plainMetricText(activity, metric, context, 'tight');
  return {
    columns: [
      [date, formatActivityDate(activity.startLocal, context.locale, 'time')],
      cardMetrics(activity).slice(0, 2).map(written),
    ],
  };
}

function periodCaption(
  caption: InstantCaption,
  data: SummaryData,
  context: TextContext,
  translate: Translate,
): CaptionText {
  const { summary } = data;
  const distance = summary.totalDistanceMeters;
  const time = plainSummaryText('totalMovingTime', summary.totalMovingTimeSeconds, context);
  if (caption === 'place') {
    return {
      columns: [
        [
          periodName(data, context, translate),
          distance > 0 ? distanceInWords(distance, context, translate) : time,
        ],
      ],
    };
  }
  // Named by its sport when the summary is of one ("6 carreras").
  const kind = data.families.length === 1 ? data.families[0] : 'all';
  const count =
    summary.activityCount === 1
      ? translate(`widgets.playlist.counts.${kind}.one`)
      : translate(`widgets.playlist.counts.${kind}.other`, {
          count: String(summary.activityCount),
        });
  return {
    columns: [
      [formatShortRange(summary.range, context.locale), count],
      distance > 0 ? [shortDistance(distance, context), time] : [time],
    ],
  };
}

/** A distance with one decimal, as the locale writes it: "14,5" in Spanish, "14.5" in English. */
function oneDecimal(meters: number, context: TextContext): string {
  return new Intl.NumberFormat(context.locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(metersToUnit(meters, context.unit));
}

/** "14,5 kilómetros", "9.0 miles". */
function distanceInWords(meters: number, context: TextContext, translate: Translate): string {
  return translate(`widgets.verified.${context.unit}`, { value: oneDecimal(meters, context) });
}

/** "11,3 km", "7.0 mi". */
function shortDistance(meters: number, context: TextContext): string {
  return `${oneDecimal(meters, context)} ${context.unitLabel(context.unit)}`;
}
