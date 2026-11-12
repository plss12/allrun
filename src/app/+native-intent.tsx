import { stravaCallbackRoute } from '@/core/strava-connection';
import { logError } from '@/ui/log';

/**
 * Every link the system opens the app with passes through here before Expo Router reads it. Only
 * Strava's sign-in, which comes back to `localhost` (ADR 020), is rewritten: as a path,
 * `localhost` would be a route that doesn't exist.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return stravaCallbackRoute(path);
  } catch (error) {
    logError('Could not read a link the app was opened with', error);
    return '/';
  }
}
