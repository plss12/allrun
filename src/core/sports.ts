/**
 * Sports are classified on two levels:
 *
 * - **Modality** decides which metrics an activity offers and in which order (a trail run puts
 *   elevation before pace; a treadmill run has no route or elevation).
 * - **Family** groups modalities for summaries ("everything I ran this month" includes trail and
 *   treadmill runs) and is what the user filters by: running, cycling, walking (walks and
 *   hikes), swimming, training (gym, yoga, cardio machines: time and heart rate, no distance),
 *   and `other` for everything else.
 *
 * `other` is the generic fallback on both levels: any sport type without a curated modality
 * (climbing, golf, a type Strava adds tomorrow) still works and shows whatever data it has.
 */
/** Every family, in the order filters and summaries list them; `other` last. */
export const SPORT_FAMILIES = ['run', 'ride', 'walk', 'swim', 'training', 'other'] as const;

export type SportFamily = (typeof SPORT_FAMILIES)[number];

export type SportModality =
  | 'roadRun'
  | 'trailRun'
  | 'treadmillRun'
  | 'walk'
  | 'hike'
  | 'roadRide'
  | 'mountainBikeRide'
  | 'gravelRide'
  | 'eBikeRide'
  | 'indoorRide'
  | 'swim'
  | 'workout'
  | 'other';

/** Family of each modality. */
export const FAMILY_OF_MODALITY: Readonly<Record<SportModality, SportFamily>> = {
  roadRun: 'run',
  trailRun: 'run',
  treadmillRun: 'run',
  walk: 'walk',
  hike: 'walk',
  roadRide: 'ride',
  mountainBikeRide: 'ride',
  gravelRide: 'ride',
  eBikeRide: 'ride',
  indoorRide: 'ride',
  swim: 'swim',
  workout: 'training',
  other: 'other',
};

/** Strava `sport_type` values with a curated modality; everything else is `other`. */
const MODALITY_OF_STRAVA_TYPE = new Map<string, SportModality>([
  ['Run', 'roadRun'],
  ['TrailRun', 'trailRun'],
  ['VirtualRun', 'treadmillRun'],
  ['Walk', 'walk'],
  ['Hike', 'hike'],
  ['Ride', 'roadRide'],
  ['Velomobile', 'roadRide'],
  ['Handcycle', 'roadRide'],
  ['MountainBikeRide', 'mountainBikeRide'],
  ['GravelRide', 'gravelRide'],
  ['EBikeRide', 'eBikeRide'],
  ['EMountainBikeRide', 'eBikeRide'],
  ['VirtualRide', 'indoorRide'],
  ['Swim', 'swim'],
  // Training: gym and strength, yoga and pilates, cardio machines.
  ['WeightTraining', 'workout'],
  ['Crossfit', 'workout'],
  ['Workout', 'workout'],
  ['HighIntensityIntervalTraining', 'workout'],
  ['Yoga', 'workout'],
  ['Pilates', 'workout'],
  ['Elliptical', 'workout'],
  ['StairStepper', 'workout'],
]);

/** Modality of a Strava `sport_type`; unknown types fall back to `other`. */
export function modalityOfStravaType(sportType: string): SportModality {
  return MODALITY_OF_STRAVA_TYPE.get(sportType) ?? 'other';
}
