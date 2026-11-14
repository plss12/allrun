import { z } from 'zod';

/**
 * The part of Strava's athlete (`GET /athlete`) the app uses: the profile photo, 124 px square
 * (`profile`; `profile_medium` is 62 px, blurry on the top bar's button at 3x), and whether they
 * pay Strava (`summit`), who alone get each activity's zones, and the units they chose on Strava
 * (`measurement_preference`: `meters` or `feet`).
 *
 * Reference: https://developers.strava.com/docs/reference/#api-Athletes-getLoggedInAthlete
 */
export const stravaAthleteSchema = z.object({
  profile: z.string().nullish(),
  summit: z.boolean().nullish(),
  measurement_preference: z.string().nullish(),
});

export type StravaAthlete = z.infer<typeof stravaAthleteSchema>;

/**
 * The unit of distance the athlete chose on Strava: miles for `feet`, kilometers for `meters`;
 * `null` for anything else. Time and space O(1).
 */
export function stravaUnits(athlete: StravaAthlete): 'km' | 'mi' | null {
  switch (athlete.measurement_preference) {
    case 'meters':
      return 'km';
    case 'feet':
      return 'mi';
    default:
      return null;
  }
}

/**
 * The athlete's own photo, or `null` without one: an athlete who never set one gets Strava's
 * generic avatar as a relative path (`avatar/athlete/large.png`), not an address of a photo.
 * Time and space O(1).
 */
export function athletePhoto(athlete: StravaAthlete): string | null {
  const url = athlete.profile;
  return url !== null && url !== undefined && url.startsWith('https://') ? url : null;
}
