import { cardMetrics, type MetricId, metricValue } from '@/core/metrics';
import { formatPlace } from '@/core/place';
import { periodTotals, summaryMetricValue } from '@/core/summary-metrics';
import type { CanvasMount } from '@/core/image-layer';
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

/**
 * A holder with its letters around its picture, as all are but those as big as the canvas, the
 * slide viewer, which writes inside its slides, and the photobooth's strip, on its tape and foot.
 */
export type LetteredMount = Exclude<
  ImageMount,
  | CanvasMount
  | 'slides'
  | 'photobooth'
  | 'chat'
  | 'chatPair'
  | 'margins'
  | 'marginsPair'
  | 'calendar'
>;

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
  /** What a strip of film writes: over its frame, and under it, the main datum in the middle. */
  readonly strip?: MountStrip;
}

/** What a strip of film writes (see `MountText`). */
export interface MountStrip {
  readonly top: string;
  readonly left: string | null;
  readonly main: string;
  readonly right: string | null;
}

const NO_SIDES: readonly [MountSide, MountSide] = [{ texts: [] }, { texts: [] }];

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
 * - `filmStrip`: AllRun's name over its frame, and its first three data under it, the main one in
 *   the middle; a period, its name and its main totals.
 * - `lightNegative`: at its sides, AllRun's name and its date and start time as a camera stamps them,
 *   and one line with its distance (its time without one) and sport. A period writes AllRun's name
 *   and its dates, and its distance (its time without one) and how many activities.
 */
export function mountCaption(
  mount: LetteredMount,
  data: EditorData,
  context: TextContext,
  translate: Translate,
): MountText {
  return data.mode === 'activity'
    ? activityText(mount, data, context, translate)
    : periodText(mount, data, context, translate);
}

/** Between the data of a crop screen's pill. */
const CROP_SEPARATOR = '  ·  ';

/**
 * An activity's first three data (`cardMetrics`: "11,3 km", "5:54/km", "1h 06min"), or a period's first
 * three totals, as a holder writes them. Time and space O(1).
 */
function threeData(data: EditorData, context: TextContext, translate: Translate): string[] {
  if (data.mode === 'activity') {
    const { activity } = data;
    return cardMetrics(activity).map((metric) =>
      metric === 'distance'
        ? shortDistance(metricValue(activity, 'distance') ?? 0, context)
        : plainMetricText(activity, metric, context, 'tight'),
    );
  }
  const { summary } = data;
  return periodTotals(summary).map((metric) =>
    metric === 'totalDistance'
      ? shortDistance(summary.totalDistanceMeters, context)
      : summaryTotalText(metric, summaryMetricValue(summary, metric) ?? 0, context, translate),
  );
}

/**
 * What a crop screen writes in the pill under its box: the three data (see `threeData`) in a line,
 * "11,3 km  ·  5:54/km  ·  1h 06min". Time and space O(1).
 */
export function cropCaption(data: EditorData, context: TextContext, translate: Translate): string {
  return threeData(data, context, translate).join(CROP_SEPARATOR);
}

/**
 * What a slide viewer writes inside each slide, in order: one of the three data (see
 * `threeData`) each, so none repeats; a slide with no datum left writes nothing. Time and space O(1).
 */
export function slidesCaption(
  data: EditorData,
  context: TextContext,
  translate: Translate,
): readonly string[] {
  return threeData(data, context, translate);
}

/** What a calendar's sheet writes: on its band, its day, under it, and at its foot. */
export interface CalendarText {
  readonly band: string;
  readonly day: string;
  readonly weekday: string;
  readonly data: string;
}

/**
 * What a calendar's sheet writes: an activity's month and year on its band, its day of the month
 * huge, its weekday, and its three data at its foot. A period is written as one, a sheet of its
 * own: its name on the band; its days (a week, any range), its month or its year huge; how many
 * activities; and its totals. Only real data (the user's rule). Time and space O(1).
 */
export function calendarCaption(
  data: EditorData,
  context: TextContext,
  translate: Translate,
): CalendarText {
  const line = threeData(data, context, translate).join(CROP_SEPARATOR);
  if (data.mode === 'activity') {
    const start = data.activity.startLocal;
    const month = new Intl.DateTimeFormat(context.locale, {
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${start}Z`));
    return {
      band: `${month} ${start.slice(0, 4)}`,
      day: String(Number(start.slice(8, 10))),
      weekday: formatActivityDate(start, context.locale, 'weekday'),
      data: line,
    };
  }
  const { start, end } = data.summary.range;
  const day = (date: string) => String(Number(date.slice(8, 10)));
  const big =
    data.kind === 'month'
      ? new Intl.DateTimeFormat(context.locale, { month: 'short', timeZone: 'UTC' })
          .format(new Date(`${start}T00:00:00Z`))
          .replace('.', '')
      : data.kind === 'year'
        ? start.slice(0, 4)
        : `${day(start)}–${day(end)}`;
  return {
    band: periodName(data, context, translate),
    day: big,
    weekday: periodCount(data, translate),
    data: line,
  };
}

/** What a margins' page writes: its three data, and its three labels, the faded ones marked. */
export interface MarginsText {
  readonly data: readonly string[];
  readonly labels: readonly { readonly text: string; readonly faded: boolean }[];
}

/**
 * What a margins' page writes in its bands, in order down them (across them on a wide canvas): the
 * three data, the time over the distance over the pace as the user's reference has them; and
 * AllRun's name and the place, faded, around the date (a period's name and dates around its name).
 * A label with nothing to write is left out. Time and space O(1).
 */
export function marginsCaption(
  data: EditorData,
  context: TextContext,
  translate: Translate,
): MarginsText {
  const [first = '', second = '', third = ''] = threeData(data, context, translate);
  if (data.mode === 'activity') {
    const place = data.place === null ? null : formatPlace(data.place, 'cityRegion');
    return {
      data: [third, first, second],
      labels: [
        { text: BRAND_NAME, faded: true },
        {
          text: formatActivityDate(data.activity.startLocal, context.locale, 'numeric')
            .split('/')
            .join('·'),
          faded: false,
        },
        { text: place ?? '', faded: true },
      ],
    };
  }
  return {
    data: [third, first, second],
    labels: [
      { text: BRAND_NAME, faded: true },
      { text: formatShortRange(data.summary.range, context.locale), faded: false },
      { text: periodName(data, context, translate), faded: true },
    ],
  };
}

/** What a photobooth's strip writes: on its tape, and at its foot. */
export interface BoothText {
  readonly tape: string;
  readonly foot: string;
}

/**
 * What a photobooth's strip writes by hand: its main datum on the tape (the distance, or the time
 * without one; a period's first total), and at its foot the date, its parts between dots
 * ("14·10·2026"; a period's dates). Only real data (the user's rule). Time and space O(1).
 */
export function boothCaption(
  data: EditorData,
  context: TextContext,
  translate: Translate,
): BoothText {
  const tape = threeData(data, context, translate)[0] ?? '';
  const foot =
    data.mode === 'activity'
      ? formatActivityDate(data.activity.startLocal, context.locale, 'numeric').split('/').join('·')
      : formatShortRange(data.summary.range, context.locale);
  return { tape, foot };
}

/** A strip's texts from its data, by importance: the first in the middle, between the others. */
function stripOf(top: string, [main = '', left, right]: readonly string[]): MountStrip {
  return { top, left: left ?? null, main, right: right ?? null };
}

function activityText(
  mount: LetteredMount,
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
  if (mount === 'filmStrip') {
    return {
      sides: NO_SIDES,
      marks: NO_MARKS,
      strip: stripOf(BRAND_NAME, cardMetrics(activity).map(written)),
    };
  }
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
  mount: LetteredMount,
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
  if (mount === 'filmStrip') {
    return {
      sides: NO_SIDES,
      marks: NO_MARKS,
      strip: stripOf(periodName(data, context, translate), totals.map(total)),
    };
  }
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
