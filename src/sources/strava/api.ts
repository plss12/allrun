/**
 * Strava's API as the phone calls it (ADR 020): with the athlete's access token, straight to
 * Strava, never through our server. A 401 asks for a new token once; the rest is the caller's.
 *
 * Reference: https://developers.strava.com/docs/reference/ and
 * https://developers.strava.com/docs/rate-limits/
 */

const API_URL = 'https://www.strava.com/api/v3';

/**
 * A valid access token, or `null` when Strava isn't connected. After a 401 it is passed the token
 * Strava refused, so that it asks for a new one.
 */
export type AccessTokenProvider = (rejected?: string) => Promise<string | null>;

/** Strava isn't connected (any more): the app shows the button to connect it. */
export class StravaNotConnectedError extends Error {
  constructor() {
    super('Strava is not connected');
    this.name = 'StravaNotConnectedError';
  }
}

/** The app went past Strava's rate limits, which are per app: try again later. */
export class StravaRateLimitError extends Error {
  constructor(usage: string) {
    super(`Strava's rate limit was reached (usage ${usage})`);
    this.name = 'StravaRateLimitError';
  }
}

export interface StravaApi {
  /**
   * `GET` a path of the API (`/athlete/activities`), with `query`. `null` when Strava answers one
   * of `absentOn` (by default 404: no such thing).
   *
   * @throws StravaNotConnectedError when there is no token, or none Strava takes.
   * @throws StravaRateLimitError on 429.
   * @throws Error on any other failure.
   */
  get(
    path: string,
    query?: Readonly<Record<string, string | number>>,
    options?: { readonly absentOn?: readonly number[] },
  ): Promise<unknown>;
}

/** The phone's Strava API, with tokens from `accessToken` and requests through `send`. */
export function stravaApi(
  accessToken: AccessTokenProvider,
  send: typeof fetch = (input, init) => fetch(input, init),
): StravaApi {
  return {
    async get(path, query = {}, { absentOn = [404] } = {}) {
      const params = new URLSearchParams(
        Object.entries(query).map(([key, value]) => [key, String(value)]),
      ).toString();
      const url = `${API_URL}${path}${params === '' ? '' : `?${params}`}`;
      const request = (token: string) =>
        send(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });

      let token = await accessToken();
      if (token === null) {
        throw new StravaNotConnectedError();
      }
      let response = await request(token);
      if (response.status === 401) {
        token = await accessToken(token);
        if (token === null) {
          throw new StravaNotConnectedError();
        }
        response = await request(token);
      }
      if (absentOn.includes(response.status)) {
        return null;
      }
      if (response.status === 429) {
        const usage =
          response.headers.get('X-ReadRateLimit-Usage') ??
          response.headers.get('X-RateLimit-Usage') ??
          'unknown';
        throw new StravaRateLimitError(usage);
      }
      if (!response.ok) {
        throw new Error(`Strava answered ${response.status} to GET ${path}`);
      }
      return response.json() as Promise<unknown>;
    },
  };
}
