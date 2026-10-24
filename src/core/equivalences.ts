import type { Activity } from './activity';
import type { PeriodSummary } from './summary';

/**
 * What an activity's or a period's data are equal to, as things anyone pictures: how many
 * marathons its distance is, how many Eiffel Towers its climb, how many football matches its
 * time and how many burgers its calories. Each reference is a rounded public figure.
 */

/** What an equivalence compares: a distance, a climb, a time or calories. */
export type EquivalenceMeasure = 'distance' | 'elevation' | 'time' | 'calories';

/** The measures in the order an equivalences widget lists them, as the data's own order. */
export const EQUIVALENCE_MEASURES: readonly EquivalenceMeasure[] = [
  'distance',
  'elevation',
  'time',
  'calories',
];

/**
 * The things the data are compared with, each with what it measures, in meters, seconds or
 * kilocalories: tracks, crossings, trips (some across Spain, where the app was born) and the
 * world for a distance; floors, towers and mountains for a climb; songs, matches and films for a
 * time; and food for calories.
 */
export const EQUIVALENCES = {
  // A lap of an athletics track.
  track: { measure: 'distance', amount: 400 },
  // Across the Strait of Gibraltar, at its narrowest.
  gibraltar: { measure: 'distance', amount: 14_400 },
  // Manhattan from end to end.
  manhattan: { measure: 'distance', amount: 21_600 },
  // Across the English Channel, from Dover to Calais.
  channel: { measure: 'distance', amount: 33_300 },
  marathon: { measure: 'distance', amount: 42_195 },
  madridToledo: { measure: 'distance', amount: 72_000 },
  sevilleCadiz: { measure: 'distance', amount: 125_000 },
  // As the crow flies.
  parisLondon: { measure: 'distance', amount: 344_000 },
  madridBarcelona: { measure: 'distance', amount: 620_000 },
  // The French Way, from Saint-Jean-Pied-de-Port.
  camino: { measure: 'distance', amount: 780_000 },
  tourDeFrance: { measure: 'distance', amount: 3_400_000 },
  // Round the Equator.
  earth: { measure: 'distance', amount: 40_075_000 },
  floor: { measure: 'elevation', amount: 3 },
  eiffel: { measure: 'elevation', amount: 330 },
  burjKhalifa: { measure: 'elevation', amount: 828 },
  teide: { measure: 'elevation', amount: 3_715 },
  everest: { measure: 'elevation', amount: 8_849 },
  song: { measure: 'time', amount: 210 },
  football: { measure: 'time', amount: 5_400 },
  godfather: { measure: 'time', amount: 10_500 },
  // The three extended editions.
  lordOfTheRings: { measure: 'time', amount: 41_160 },
  beer: { measure: 'calories', amount: 140 },
  burger: { measure: 'calories', amount: 550 },
  // A whole one, of a medium size.
  pizza: { measure: 'calories', amount: 2_000 },
} as const satisfies Readonly<
  Record<string, { readonly measure: EquivalenceMeasure; readonly amount: number }>
>;

export type EquivalenceId = keyof typeof EQUIVALENCES;

/** How much of each measure there is to compare: 0 or `null` for none. */
export type EquivalenceAmounts = Readonly<Record<EquivalenceMeasure, number | null>>;

/** One equivalence: what is compared, with what, how many times, and how much it was. */
export interface Equivalence {
  readonly measure: EquivalenceMeasure;
  readonly reference: EquivalenceId;
  /** How many times the reference fits in `amount`: 1 or more. */
  readonly times: number;
  readonly amount: number;
}

/**
 * The equivalences of `amounts`, one per measure there is some of, in {@link EQUIVALENCE_MEASURES}'
 * order: each with the biggest thing it reaches at least once, so its count is as small as it
 * gets and still reads whole ("1.3 times from Madrid to Toledo", not "235 laps of a track"). A
 * measure that reaches none of its things (a climb under a floor) has none. Time O(r) for the r
 * references, space O(m) for the m measures.
 */
export function equivalences(amounts: EquivalenceAmounts): Equivalence[] {
  return EQUIVALENCE_MEASURES.flatMap((measure): Equivalence[] => {
    const amount = amounts[measure] ?? 0;
    if (amount <= 0) {
      return [];
    }
    let best: EquivalenceId | null = null;
    for (const [id, reference] of Object.entries(EQUIVALENCES) as [
      EquivalenceId,
      (typeof EQUIVALENCES)[EquivalenceId],
    ][]) {
      if (
        reference.measure === measure &&
        reference.amount <= amount &&
        (best === null || reference.amount > EQUIVALENCES[best].amount)
      ) {
        best = id;
      }
    }
    return best === null
      ? []
      : [{ measure, reference: best, times: amount / EQUIVALENCES[best].amount, amount }];
  });
}

/** An activity's equivalences (see `equivalences`): its distance, climb, time and calories. */
export function activityEquivalences(activity: Activity): Equivalence[] {
  return equivalences({
    distance: activity.distanceMeters,
    elevation: activity.elevationGainMeters,
    time: activity.movingTimeSeconds,
    calories: activity.calories,
  });
}

/**
 * A period's equivalences (see `equivalences`): its totals, and the calories of its `activities`
 * that have them. Time O(n) for n activities.
 */
export function periodEquivalences(
  summary: PeriodSummary,
  activities: readonly Activity[],
): Equivalence[] {
  return equivalences({
    distance: summary.totalDistanceMeters,
    elevation: summary.totalElevationGainMeters,
    time: summary.totalMovingTimeSeconds,
    calories: activities.reduce((sum, activity) => sum + (activity.calories ?? 0), 0),
  });
}
