import type { Activity } from './activity';
import { availableMetrics, cardMetrics, type MetricId } from './metrics';
import type { SportFamily } from './sports';
import {
  type ActivityBlock,
  type ActivityBlockDesign,
  APP_MODES,
  BIG_LAYOUTS,
  BIG_SOLO_LAYOUTS,
  CARD_LAYOUTS,
  DATA_STACK_LAYOUTS,
  DAY_BETWEEN_LAYOUTS,
  DAY_COLUMNS_LAYOUTS,
  DAY_OVER_LAYOUTS,
  BIG_TOPS,
  type FontId,
  BRAND_COVERS,
  CHAT_PHRASES,
  DATA_LINE_LAYOUTS,
  LAPS_LAYOUTS,
  NUTRITION_LABELS,
  QUOTES,
  VERSES,
} from './template';

/**
 * What the mixed widgets of an activity show (ADR 009). They pick their data by sport, as the
 * activity's card does: a run leads with its distance, pace and time; a gym session with its
 * time, heart rate and calories. Nothing is rounded: the widgets write each datum as its own
 * data widget does.
 */

/**
 * Second readings of a datum (elapsed after moving time, highest after average heart rate,
 * weighted after average power, highest altitude after the elevation gain): without their names,
 * they read as the first.
 */
const SECOND_READINGS: readonly MetricId[] = [
  'elapsedTime',
  'maxHeartRate',
  'weightedAveragePower',
  'maxElevation',
];

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

/** Data each version of a design shows, at most; the splits show splits instead. */
export function blockDataCount(block: ActivityBlock): number {
  switch (block.design) {
    case 'bigTrio':
      return 4;
    case 'bigPair':
      return 3;
    case 'bigSolo':
    case 'dayRoute':
      return 1;
    case 'dayBetween':
      return block.layout === 'four' ? 4 : 2;
    case 'dayOver':
      return block.layout === 'wide' ? 4 : 2;
    case 'dayColumns':
      return block.layout === 'four' ? 4 : 3;
    case 'dataStack':
      return block.layout === 'three' ? 3 : 2;
    case 'tower':
      return 3;
    case 'dataLine':
      return block.layout === 'three' || block.layout === 'namedThree' ? 3 : 2;
    case 'card':
      return block.layout === 'six' || block.layout === 'nameSix' ? 6 : 3;
    case 'music':
      return 2;
    case 'receipt':
      return 6;
    case 'boardingPass':
      return 4;
    case 'notes':
    case 'laps':
    case 'grandPrix':
    case 'nutrition':
    case 'alarm':
    case 'location':
    case 'splitBars':
    case 'splitLadder':
    case 'verified':
      return 1;
    case 'message':
    case 'camera':
    case 'chat':
    case 'sentence':
      return 3;
    case 'verse':
    case 'quote':
      return 0;
  }
}

/**
 * The first `count` data of a big datum's widget: the sport's main datum (`top: 'main'`) or the
 * time on top, then the rest in the sport's order. It writes them without names, so never a
 * second reading of a measure (a highest heart rate would read as a second average). Fewer when
 * the activity has fewer. Time O(m) for the m metrics of its sport.
 */
export function bigMetrics(
  activity: Activity,
  top: (typeof BIG_TOPS)[number],
  count: number,
): MetricId[] {
  const data = availableMetrics(activity).filter((metric) => !SECOND_READINGS.includes(metric));
  const ordered =
    top === 'time' && data.includes('movingTime')
      ? ['movingTime' as const, ...data.filter((metric) => metric !== 'movingTime')]
      : data;
  return ordered.slice(0, count);
}

/** What a tower writes small beside a sport with a distance: how fast and how long. */
const TOWER_PACES: readonly MetricId[] = ['pace', 'swimPace', 'speed', 'movingTime'];

/**
 * The three data of a tower: the distance big, and how fast (its pace or speed) and how long
 * small, in the sport's order; or, for a sport without a distance, the calories big, and the time
 * and heart rate small. Never the elevation gain, which reads as minutes without its name. Empty
 * when the activity can't fill it. Time O(m) for the m metrics of its sport.
 */
export function towerMetrics(activity: Activity): MetricId[] {
  const available = availableMetrics(activity);
  const metrics = available.includes('distance')
    ? ['distance' as const, ...available.filter((metric) => TOWER_PACES.includes(metric))]
    : (['calories', 'movingTime', 'averageHeartRate'] as const).filter((metric) =>
        available.includes(metric),
      );
  return metrics.length === 3 ? metrics : [];
}

/**
 * The data a data widget writes, without names (see `bigMetrics`), or the tower's (see
 * `towerMetrics`). Time O(m) for the m metrics of its sport.
 */
export function dataWidgetMetrics(activity: Activity, block: ActivityBlock): MetricId[] {
  return block.design === 'tower'
    ? towerMetrics(activity)
    : bigMetrics(activity, dataTop(block), blockDataCount(block));
}

/** A big datum with two and with three data under it, in `layout`, the main datum on top. */
const bigWithData = (layout: (typeof BIG_LAYOUTS)[number]): ActivityBlock[] =>
  (['bigPair', 'bigTrio'] as const).map((design) => ({ design, layout, top: 'main' }));

/**
 * The data widgets' tiles in the gallery's order, each with the versions it pages through: from
 * the big datum, with data, under the weekday, alone or as a tower, to the data alone (stacked, in
 * a line, on a card) or around the weekday, and last those around the route, which only activities
 * with GPS have. The
 * time is never put on top: it is a gym session's main datum already (designs saved with it on
 * top still read and draw).
 */
const DATA_TILES: readonly (readonly ActivityBlock[])[] = [
  [...bigWithData('wide'), ...bigWithData('stretched')],
  [...bigWithData('day'), ...bigWithData('stretchedDay')],
  BIG_SOLO_LAYOUTS.map((layout) => ({ design: 'bigSolo', layout, top: 'main' }) as const),
  [{ design: 'tower' }],
  DATA_STACK_LAYOUTS.map((layout) => ({ design: 'dataStack', layout }) as const),
  DATA_LINE_LAYOUTS.map((layout) => ({ design: 'dataLine', layout }) as const),
  CARD_LAYOUTS.map((layout) => ({ design: 'card', layout }) as const),
  DAY_BETWEEN_LAYOUTS.map((layout) => ({ design: 'dayBetween', layout }) as const),
  DAY_OVER_LAYOUTS.map((layout) => ({ design: 'dayOver', layout }) as const),
  DAY_COLUMNS_LAYOUTS.map((layout) => ({ design: 'dayColumns', layout }) as const),
  bigWithData('route'),
  [{ design: 'dayRoute', top: 'main' }],
];

/**
 * The gallery tile a version of a mixed widget scrolls in (see `catalogWidgetKey`): its design's,
 * or one shared by designs alike. A big datum with data, in its wide and stretched looks, under
 * the weekday or under the route; the splits as bars and as a ladder; and the laps in their two
 * tables.
 */
export function blockTile(block: ActivityBlock): string {
  switch (block.design) {
    case 'bigPair':
    case 'bigTrio':
      return block.layout === 'route'
        ? 'bigRoute'
        : block.layout === 'day' || block.layout === 'stretchedDay'
          ? 'bigDay'
          : 'big';
    case 'splitBars':
    case 'splitLadder':
      return 'splits';
    default:
      return block.design;
  }
}

/** What a data widget puts first: the sport's main datum, or the time when it says so. */
export const dataTop = (block: ActivityBlock): (typeof BIG_TOPS)[number] =>
  'top' in block ? block.top : 'main';

/**
 * The data widgets `activity` fills, tile by tile (see `DATA_TILES`): each only with all its
 * data, and with the route only when it has one.
 */
function dataBlocks(activity: Activity): ActivityBlock[] {
  const fills = (block: ActivityBlock) => {
    const route = block.design === 'dayRoute' || ('layout' in block && block.layout === 'route');
    return (
      dataWidgetMetrics(activity, block).length === blockDataCount(block) &&
      (!route || activity.routePolyline !== null)
    );
  };
  return DATA_TILES.flatMap((versions) => versions.filter(fills));
}

/**
 * Every version of the mixed widgets that `activity` can fill, design by design, in the order of
 * the gallery: the splits only `withSplits` (when its detail has them), the laps only `withLaps` (when it has more than one), the location only `withPlace` (when
 * its place can be named), the sentence only when it can be written (see `sentencePlan`), and
 * nothing for an activity without data. The verse, the quote and the chat message come with their
 * first phrase: the gallery lists the others to choose from. Time O(m) for the m metrics of its
 * sport.
 */
export function activityBlocks(
  activity: Activity,
  withSplits = false,
  withPlace = false,
  withLaps = false,
): ActivityBlock[] {
  if (blockMetrics(activity, 1).length === 0) {
    return [];
  }
  return [
    // The data widgets (see `isDataWidget`).
    ...dataBlocks(activity),
    // Words: the quote, the verse, the two chat messages, the sentence and the badge.
    { design: 'quote', quote: QUOTES[0] } as const,
    { design: 'verse', verse: VERSES[0] } as const,
    ...APP_MODES.map((layout) => ({ design: 'message', layout }) as const),
    ...APP_MODES.map((layout) => ({ design: 'chat', layout, phrase: CHAT_PHRASES[0] }) as const),
    ...(sentencePlan(activity, withPlace) === null ? [] : [{ design: 'sentence' } as const]),
    ...APP_MODES.map((layout) => ({ design: 'verified', layout }) as const),
    // The phone's apps.
    ...APP_MODES.flatMap((layout) =>
      BRAND_COVERS.map((cover) => ({ design: 'music', layout, cover }) as const),
    ),
    // The camera's thumbnail is the route: without one, there is a single camera.
    ...(activity.routePolyline === null
      ? [{ design: 'camera', cover: BRAND_COVERS[0] } as const]
      : BRAND_COVERS.map((cover) => ({ design: 'camera', cover }) as const)),
    ...APP_MODES.map((layout) => ({ design: 'alarm', layout }) as const),
    ...(withPlace ? APP_MODES.map((layout) => ({ design: 'location', layout }) as const) : []),
    // The note lists the splits, but it is one of the phone's apps.
    ...(withSplits ? APP_MODES.map((layout) => ({ design: 'notes', layout }) as const) : []),
    // The timing tables: the splits as AURA's bars and a typewriter's ladder; the laps as AURA's
    // board and a karting's sheet; the splits as a race on TV.
    ...(withSplits
      ? [
          { design: 'splitBars' } as const,
          ...BRAND_COVERS.map((cover) => ({ design: 'splitLadder', cover }) as const),
        ]
      : []),
    ...(withLaps ? [...lapsOf('board'), ...lapsOf('sheet')] : []),
    ...(withSplits ? [{ design: 'grandPrix' } as const] : []),
    // Things of paper.
    { design: 'receipt' } as const,
    ...BRAND_COVERS.map((cover) => ({ design: 'boardingPass', cover }) as const),
    ...nutritionLabels().map((labels) => ({ design: 'nutrition', ...labels }) as const),
  ];
}

/**
 * Every version of a nutrition label, of an activity or a period alike: the American one and
 * the European table, each white (as on a box) and then black.
 */
export const nutritionLabels = (): {
  readonly label: (typeof NUTRITION_LABELS)[number];
  readonly layout: (typeof APP_MODES)[number];
}[] =>
  NUTRITION_LABELS.flatMap((label) =>
    (['light', 'dark'] as const).map((layout) => ({ label, layout })),
  );

/** The laps in one look, in both brand colors. */
const lapsOf = (layout: (typeof LAPS_LAYOUTS)[number]): ActivityBlock[] =>
  BRAND_COVERS.map((cover) => ({ design: 'laps', layout, cover }));

/**
 * How the highlighted sentence opens: with the distance and its sport's word ("11.34 kilometer
 * run"), with the distance and the sport's name, for sports without a word of their own, or with
 * the time and the sport's name, for those without a distance ("45min of weight training").
 */
export type SentenceLead = 'run' | 'ride' | 'walk' | 'hike' | 'swim' | 'distance' | 'time';

/** What the sentence says after its lead: where, how long, how fast, how hard. */
export type SentenceClause = 'place' | 'time' | 'pace' | 'speed' | 'calories' | 'heartRate';

/** A highlighted sentence: its lead and clauses, each with the datum it writes (none for the place). */
export interface SentencePlan {
  readonly lead: { readonly lead: SentenceLead; readonly metric: MetricId };
  readonly clauses: readonly {
    readonly clause: SentenceClause;
    readonly metric: MetricId | null;
  }[];
}

/** The lead of an activity with a distance, by its sport's family. */
const DISTANCE_LEADS: Readonly<Record<SportFamily, SentenceLead>> = {
  run: 'run',
  ride: 'ride',
  walk: 'walk',
  swim: 'swim',
  training: 'distance',
  other: 'distance',
};

/** How fast each family goes, in the sentence: walks say only how long they took. */
const SENTENCE_SPEEDS: Readonly<
  Record<SportFamily, { readonly clause: SentenceClause; readonly metric: MetricId } | null>
> = {
  run: { clause: 'pace', metric: 'pace' },
  swim: { clause: 'pace', metric: 'swimPace' },
  ride: { clause: 'speed', metric: 'speed' },
  training: { clause: 'speed', metric: 'speed' },
  other: { clause: 'speed', metric: 'speed' },
  walk: null,
};

/**
 * The sentence that tells `activity`, as AURA writes it: "11.3 kilometer run through Andújar, Jaén
 * in 1h 5min, at 5:45/km pace." With a distance: the distance and the sport, where it went (when
 * `withPlace`, but for a swim), how long it took and how fast. Without one: how long, and the
 * calories it burned, or else its heart rate ("45 minute workout burning 628 calories."). Each part
 * only when the activity has its datum; `null` without a distance or a time to open with. Time
 * O(m) for the m metrics of its sport.
 */
export function sentencePlan(activity: Activity, withPlace: boolean): SentencePlan | null {
  const available = availableMetrics(activity);
  const has = (metric: MetricId) => available.includes(metric);
  if (has('distance')) {
    const speed = SENTENCE_SPEEDS[activity.sportFamily];
    return {
      lead: {
        lead: activity.sportModality === 'hike' ? 'hike' : DISTANCE_LEADS[activity.sportFamily],
        metric: 'distance',
      },
      clauses: [
        ...(withPlace && activity.sportFamily !== 'swim'
          ? [{ clause: 'place', metric: null } as const]
          : []),
        ...(has('movingTime') ? [{ clause: 'time', metric: 'movingTime' } as const] : []),
        ...(speed !== null && has(speed.metric) ? [speed] : []),
      ],
    };
  }
  if (!has('movingTime')) {
    return null;
  }
  const effort = has('calories')
    ? ({ clause: 'calories', metric: 'calories' } as const)
    : has('averageHeartRate')
      ? ({ clause: 'heartRate', metric: 'averageHeartRate' } as const)
      : null;
  return {
    lead: { lead: 'time', metric: 'movingTime' },
    clauses: effort === null ? [] : [effort],
  };
}

/** How a split compares with the others in a race's timing tower, as a tyre compound. */
export type TyreCompound = 'soft' | 'medium' | 'hard';

/**
 * The compound each of `speeds` gets in a timing tower: the fastest third soft, the middle third
 * medium and the slowest third hard, by rank (ties keep their order). Time O(n log n), space O(n).
 */
export function tyreCompounds(speeds: readonly number[]): TyreCompound[] {
  const ranks = new Array<number>(speeds.length);
  speeds
    .map((speed, i) => ({ speed, i }))
    .sort((a, b) => b.speed - a.speed)
    .forEach(({ i }, rank) => {
      ranks[i] = rank;
    });
  return ranks.map((rank) =>
    rank < speeds.length / 3 ? 'soft' : rank < (2 * speeds.length) / 3 ? 'medium' : 'hard',
  );
}

/** Index of the fastest of `speeds` (the first of equals), or -1 for none. Time O(n). */
export function fastestIndex(speeds: readonly number[]): number {
  return speeds.reduce((best, speed, i) => (best === -1 || speed > speeds[best] ? i : best), -1);
}

/** The icons a mixed widget can draw: one per sport family, and hiking's own. */
export type SportIconId = SportFamily | 'hike';

/** The icon of an activity's sport: its family's, or the hiker for a hike. */
export function sportIcon(activity: Activity): SportIconId {
  return activity.sportModality === 'hike' ? 'hike' : activity.sportFamily;
}

/**
 * Mixed widgets that recreate another app or a thing (a receipt, a boarding pass, a sheet of paper
 * with highlights): their look is fixed, not the user's to style.
 */
const APP_REPLICAS: ReadonlySet<ActivityBlockDesign> = new Set([
  'notes',
  'message',
  'music',
  'camera',
  'laps',
  'grandPrix',
  'alarm',
  'location',
  'splitBars',
  'splitLadder',
  'verified',
  'chat',
  'sentence',
  'receipt',
  'boardingPass',
  'nutrition',
]);

/**
 * Whether a design recreates another app (a note, a chat message): its colors, font and icons are
 * the app's, since recognizing it is the point, so only its opacity can change.
 */
export function isAppReplica(design: ActivityBlockDesign): boolean {
  return APP_REPLICAS.has(design);
}

/** Mixed widgets made of data in the user's lettering: the gallery shows them apart. */
const DATA_WIDGETS: ReadonlySet<ActivityBlockDesign> = new Set([
  'bigTrio',
  'bigPair',
  'bigSolo',
  'dayRoute',
  'dayBetween',
  'dayOver',
  'dayColumns',
  'dataStack',
  'tower',
  'dataLine',
  'card',
]);

/**
 * Whether a design is a data widget: its data written in a lettering the user can change, as
 * opposed to the creative ones (replicas of apps and things, phrases).
 */
export function isDataWidget(design: ActivityBlockDesign): boolean {
  return DATA_WIDGETS.has(design);
}

/**
 * Whether a design frames the whole canvas, as the camera does around the photo: it is as big as
 * the canvas, not a widget scaled to the format.
 */
export function framesCanvas(block: ActivityBlock): boolean {
  return block.design === 'camera';
}

/** How a mixed widget's texts start: their font, and whether bold, italic and in capitals. */
export interface BlockLettering {
  readonly font: FontId;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly uppercase: boolean;
}

/** Capitals, upright, in `font`. */
const lettering = (font: FontId, bold: boolean): BlockLettering => ({
  font,
  bold,
  italic: false,
  uppercase: true,
});

/**
 * The lettering that suits each version of a mixed widget, as AURA gives each its own: wide and
 * heavy (also under its route), or heavy and stretched upwards, for a big datum, and a different
 * one for each date widget, so the gallery reads varied (a clean one under a small weekday, a
 * hand-written one around the route, tall and narrow beside the short weekday, varsity or poster
 * letters under a wide one,
 * a clean sans in columns, a sporty condensed one stacked); a serif italic in small letters for a
 * quotation. Replicas write in the system-like font of the apps they recreate.
 */
export function blockLettering(block: ActivityBlock): BlockLettering {
  switch (block.design) {
    case 'bigTrio':
    case 'bigPair':
    case 'bigSolo':
      return block.layout === 'stretched' || block.layout === 'stretchedDay'
        ? lettering('bowlbyOneSC', false)
        : block.layout === 'smallDay'
          ? lettering('inter', true)
          : block.layout === 'route'
            ? lettering('unbounded', true)
            : lettering('unbounded', true);
    case 'dayRoute':
      // As if written by hand around a route drawn by hand.
      return lettering('permanentMarker', false);
    case 'dayBetween':
      return lettering('bigShoulders', true);
    case 'dayOver':
      return block.layout === 'wide' ? lettering('graduate', false) : lettering('anton', false);
    case 'dayColumns':
      return lettering('inter', true);
    case 'dataStack':
      return lettering('barlowCondensed', true);
    case 'tower':
      return lettering('bowlbyOneSC', false);
    case 'dataLine':
      // Named, as Strava writes them: names and units in small letters.
      return block.layout === 'namedThree' || block.layout === 'namedTwo'
        ? { ...lettering('unbounded', true), uppercase: false }
        : lettering('unbounded', true);
    case 'card':
      // A typewriter's letters, in small letters as its names and units are written.
      return { font: 'spaceMono', bold: false, italic: false, uppercase: false };
    case 'verse':
    case 'quote':
      // A quotation, in a serif italic.
      return { font: 'playfairDisplay', bold: false, italic: true, uppercase: false };
    case 'notes':
    case 'message':
    case 'music':
    case 'camera':
    case 'laps':
    case 'grandPrix':
    case 'alarm':
    case 'location':
    case 'splitBars':
    case 'splitLadder':
    case 'verified':
    case 'chat':
    case 'sentence':
    case 'receipt':
    case 'boardingPass':
    case 'nutrition':
      return lettering('inter', false);
  }
}
