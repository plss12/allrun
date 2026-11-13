import { z } from 'zod';

/**
 * The part of Strava's athlete (`GET /athlete`) the app uses: the profile photo, 124 px square
 * (`profile`; `profile_medium` is 62 px, blurry on the top bar's button at 3x).
 *
 * Reference: https://developers.strava.com/docs/reference/#api-Athletes-getLoggedInAthlete
 */
export const stravaAthleteSchema = z.object({
  profile: z.string().nullish(),
});

export type StravaAthlete = z.infer<typeof stravaAthleteSchema>;

/**
 * The athlete's own photo, or `null` without one: an athlete who never set one gets Strava's
 * generic avatar as a relative path (`avatar/athlete/large.png`), not an address of a photo.
 * Time and space O(1).
 */
export function athletePhoto(athlete: StravaAthlete): string | null {
  const url = athlete.profile;
  return url !== null && url !== undefined && url.startsWith('https://') ? url : null;
}
