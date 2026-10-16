/**
 * Families of sports that share the same metrics and formatting.
 *
 * `other` is the generic fallback: any sport type without a curated group (gym, yoga, a type
 * Strava adds tomorrow) still works and shows whatever data it has.
 */
export type SportGroup = 'run' | 'ride' | 'walk' | 'swim' | 'other';

/** Strava `sport_type` values with a curated group; everything else is `other`. */
const SPORT_GROUPS = new Map<string, SportGroup>([
  ['Run', 'run'],
  ['TrailRun', 'run'],
  ['VirtualRun', 'run'],
  ['Ride', 'ride'],
  ['MountainBikeRide', 'ride'],
  ['GravelRide', 'ride'],
  ['EBikeRide', 'ride'],
  ['EMountainBikeRide', 'ride'],
  ['VirtualRide', 'ride'],
  ['Velomobile', 'ride'],
  ['Handcycle', 'ride'],
  ['Walk', 'walk'],
  ['Hike', 'walk'],
  ['Swim', 'swim'],
]);

/** Group of a Strava `sport_type`; unknown types fall back to `other`. */
export function sportGroupOf(sportType: string): SportGroup {
  return SPORT_GROUPS.get(sportType) ?? 'other';
}
