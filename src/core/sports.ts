/**
 * Sports are classified on two levels:
 *
 * - **Modality** decides which metrics an activity offers and in which order (a trail run puts
 *   elevation before pace; a treadmill run has no route or elevation).
 * - **Family** groups modalities for summaries ("everything I ran this month" includes trail and
 *   treadmill runs). Summaries put the triathlon sports first (run, ride, swim); walks, hikes and
 *   everything else count as `other`.
 *
 * `other` is the generic fallback on both levels: any sport type without a curated modality
 * (gym, yoga, a type Strava adds tomorrow) still works and shows whatever data it has.
 */
export type SportFamily = 'run' | 'ride' | 'swim' | 'other';

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
  | 'other';

/** Family of each modality. */
export const FAMILY_OF_MODALITY: Readonly<Record<SportModality, SportFamily>> = {
  roadRun: 'run',
  trailRun: 'run',
  treadmillRun: 'run',
  walk: 'other',
  hike: 'other',
  roadRide: 'ride',
  mountainBikeRide: 'ride',
  gravelRide: 'ride',
  eBikeRide: 'ride',
  indoorRide: 'ride',
  swim: 'swim',
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
]);

/** Modality of a Strava `sport_type`; unknown types fall back to `other`. */
export function modalityOfStravaType(sportType: string): SportModality {
  return MODALITY_OF_STRAVA_TYPE.get(sportType) ?? 'other';
}
