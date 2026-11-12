import { z } from 'zod';

/**
 * Connecting Strava (ADR 020): the sign-in page to open, the address it comes back to, and what
 * came back. Pure, so the phone's flow (`data/strava.ts`) only does the input and output.
 *
 * Reference: https://developers.strava.com/docs/authentication/
 */

/** Strava's sign-in for phones; in a browser it shows the web page. */
const AUTHORIZE_URL = 'https://www.strava.com/oauth/mobile/authorize';

/**
 * What AllRun asks for: private activities and the trace inside privacy zones, and the heart rate
 * zones (`profile:read_all`). The athlete can untick any of them.
 */
export const STRAVA_SCOPE = 'read,activity:read_all,profile:read_all';

/**
 * Where Strava's sign-in comes back to, under the app's own scheme. Strava only allows addresses
 * within the app's callback domain, and always `localhost`, which the app's settings on Strava
 * use: with no server of our own, the auth session catches it without opening it.
 */
const CALLBACK_PATH = 'localhost/strava-callback';

/** The address Strava's sign-in comes back to for the app's `scheme` (`allrun` or `exp`). */
export function stravaRedirectUri(scheme: string): string {
  return `${scheme}://${CALLBACK_PATH}`;
}

/** Strava's sign-in page, for the app with `clientId`, coming back to `redirectUri`. */
export function stravaAuthorizeUrl(options: {
  readonly clientId: string;
  readonly redirectUri: string;
  /** Random, checked when the sign-in comes back: no one else's code is taken. */
  readonly state: string;
}): string {
  const query = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: STRAVA_SCOPE,
    state: options.state,
  });
  return `${AUTHORIZE_URL}?${query.toString()}`;
}

/** Whether the granted scopes let the app read activities (`activity:read` or `_all`). */
export function canReadActivities(scope: string): boolean {
  return scope
    .split(/[\s,]+/)
    .some((granted) => granted === 'activity:read' || granted === 'activity:read_all');
}

/** What Strava's sign-in came back with. */
export type StravaCallback =
  | { readonly kind: 'code'; readonly code: string; readonly scope: string }
  /** The athlete pressed "Cancel" on Strava's page. */
  | { readonly kind: 'denied' }
  /** Without activities AllRun has nothing to show. */
  | { readonly kind: 'missingActivityScope' }
  /** Not the sign-in this phone started, or no code: nothing is done with it. */
  | { readonly kind: 'invalid' };

/** The query of the address Strava came back to, as `URLSearchParams`. */
function queryOf(url: string): URLSearchParams {
  const start = url.indexOf('?');
  if (start === -1) {
    return new URLSearchParams();
  }
  const end = url.indexOf('#', start);
  return new URLSearchParams(url.slice(start + 1, end === -1 ? undefined : end));
}

/**
 * Reads the address Strava's sign-in came back to: a code with its granted scopes, or why not.
 * `expectedState` is the `state` this phone sent; any other one is refused.
 */
export function parseStravaCallback(url: string, expectedState: string): StravaCallback {
  const query = queryOf(url);
  if (expectedState === '' || query.get('state') !== expectedState) {
    return { kind: 'invalid' };
  }
  if (query.get('error') === 'access_denied') {
    return { kind: 'denied' };
  }
  const code = query.get('code');
  if (code === null || code === '') {
    return { kind: 'invalid' };
  }
  const scope = query.get('scope') ?? '';
  if (!canReadActivities(scope)) {
    return { kind: 'missingActivityScope' };
  }
  return { kind: 'code', code, scope };
}

/**
 * The app's route for an address Strava's sign-in came back to, which on Android also reaches the
 * app as a link of its own: `/strava-callback` with its query. Any other address stays as it is.
 * Expo Router reads `localhost` as the first part of the path, so without this it would land on a
 * route that doesn't exist.
 */
export function stravaCallbackRoute(path: string): string {
  const at = path.indexOf(CALLBACK_PATH);
  if (at === -1) {
    return path;
  }
  const before = path.slice(0, at);
  const after = path.slice(at + CALLBACK_PATH.length);
  // Only the whole address part: `allrun://localhost/…`, `/localhost/…` or `localhost/…`.
  const startsRight = before === '' || before === '/' || before.endsWith('://');
  const endsRight = after === '' || after.startsWith('?') || after.startsWith('#');
  if (!startsRight || !endsRight) {
    return path;
  }
  return `/strava-callback${after}`;
}

/** A Strava access token the server gave, with whose athlete it is. */
export interface StravaAccess {
  readonly accessToken: string;
  /** Milliseconds since the epoch. */
  readonly expiresAt: number;
  readonly athleteName: string;
  readonly scope: string;
}

const accessSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.number().int().positive(),
  athleteName: z.string(),
  scope: z.string(),
});

const answerSchema = z.discriminatedUnion('connected', [
  accessSchema.extend({ connected: z.literal(true) }),
  z.object({ connected: z.literal(false) }),
]);

/**
 * What the `strava-connect` and `strava-token` functions answered: an access token, or `null`
 * when Strava isn't connected.
 *
 * @throws ZodError when the answer isn't one of them.
 */
export function parseStravaAnswer(json: unknown): StravaAccess | null {
  const answer = answerSchema.parse(json);
  if (!answer.connected) {
    return null;
  }
  const { accessToken, expiresAt, athleteName, scope } = answer;
  return { accessToken, expiresAt, athleteName, scope };
}

/** The access the phone keeps, with whose account it is. */
export interface StoredStravaAccess extends StravaAccess {
  readonly userId: string;
}

const storedSchema = accessSchema.extend({ userId: z.string().min(1) });

/** @throws ZodError when what was kept isn't an access. */
export function parseStoredStravaAccess(json: unknown): StoredStravaAccess {
  return storedSchema.parse(json);
}

/**
 * How long before it expires an access token is asked for again: a request started with it still
 * gets through.
 */
export const STRAVA_TOKEN_MARGIN_MS = 5 * 60 * 1000;

/** Whether `access` still serves at `now` (milliseconds since the epoch). */
export function isAccessFresh(access: StravaAccess, now: number): boolean {
  return access.expiresAt - now > STRAVA_TOKEN_MARGIN_MS;
}
