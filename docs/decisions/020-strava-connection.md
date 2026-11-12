# 020 - Connecting Strava

Date: 2026-11-13

Status: accepted (2026-11-13). Supersedes ADR 003's Strava tokens on the device; ADR 002's
rules (on demand, cached for less than 7 days, the whole trace to its owner) stay.

## Context

Roadmap step 5 replaces the synthetic history (`FixtureActivitySource`) with the user's Strava
activities. What Strava's API asks for, checked on 2026-11-13 (developers.strava.com,
strava.com/legal/api):

- **OAuth 2 without PKCE.** Changing the code for tokens and refreshing them both need the app's
  `client_secret`, which can't ship inside the app. Access tokens last 6 hours; refresh tokens
  rotate: a refresh may return a new one and the old one stops working at once.
- **Mobile sign-in**: `https://www.strava.com/oauth/mobile/authorize`, in the Strava app when it
  is installed (Android by an intent; iOS needs `strava` in `LSApplicationQueriesSchemes`, a native
  setting Expo Go lacks), in the browser otherwise. The `redirect_uri` must be within the app's
  callback domain; `localhost` and `127.0.0.1` are always allowed.
- **Scopes**: `activity:read_all` brings private activities and the trace inside privacy zones;
  `profile:read_all` the heart rate zones. The user can untick any of them on Strava's page, so the
  granted scopes must be checked.
- **Rate limits per app, not per athlete**: by default 100 reads every 15 minutes and 1,000 a day
  (200 and 2,000 at 10 athletes). More is only granted to apps near their limit that already use
  the API efficiently, after a review.
- **Revoking**: `POST /oauth/revoke` (Basic auth with the client's id and secret), the only one
  from June 2027.
- **Terms**: a user's data shown only to that user; the token kept confidential; the "Connect
  with Strava" button links to Strava's authorize page (Strava offers its files, in English only);
  Strava's logos are never changed.

ADR 003 kept the tokens on the phone because there was no account. Now there is one (ADR 019),
on every phone the user signs in to.

## Decision

- **The refresh token lives on the server, the access token on the phone.**
  - A `strava_connections` table that only the Edge Functions' admin client (the service role)
    can read: no grant for `anon` or `authenticated`, and row level security on with no policy.
    It is in `public` because the admin client reaches tables through the Data API, which doesn't
    serve `private`. In it: AllRun user, Strava athlete id, granted scopes, the refresh token encrypted
    (AES-GCM, key in the Edge Functions' secrets) and the current access token with its expiry.
    One Strava athlete belongs to one AllRun account: connecting it from another account moves it.
  - Three Edge Functions, all behind the user's session (`withSupabase({ auth: 'user' })`):
    `strava-connect` (code and scopes in; changes the code, keeps the tokens, gives back the access
    token and the athlete's name), `strava-token` (a valid access token, refreshed only when it has
    less than an hour left; the server alone rotates the refresh token, so two phones never race)
    and `strava-disconnect` (revoke and delete the row). `delete-account` revokes too before
    deleting the user.
  - The phone keeps the access token in the secure store and calls Strava's API directly with
    it: the activities never pass through our server, and the Edge Functions run at most a few
    times a day per user. A 401 asks `strava-token` once; if Strava refused the refresh (the user
    revoked AllRun in Strava's settings), the server deletes the row and the app asks to connect
    again.
- **Connecting**: through the system's browser (`expo-web-browser`, as Google, ADR 019), so it works
  in Expo Go and the build alike. The app makes a random `state` and checks it on return; the
  `redirect_uri` is `<scheme>://localhost/strava-callback` (Strava's callback domain set to
  `localhost`), which the auth session catches without opening (as `providerBackTo`). On Android it
  also reaches the app as a link, which `+native-intent` sends to the `strava-callback` route, and
  the second arrival gets the first one's result. Scopes asked:
  `read,activity:read_all,profile:read_all`; without `activity:read_all` (or `activity:read`) the
  app says so and offers to connect again. Opening the Strava app itself (app-to-app) is left for
  milestone 5, when the iPhone leaves Expo Go.
- **Where it shows**: after signing in, until Strava is connected, the home stays as always (its
  bar, tabs and profile), with a line and a button to connect Strava where the activities go (the
  owner's choice: no page of its own). The button is ours, in Track Red as signing in (the owner's
  choice), with "Connect with Strava" as plain text, translated: Strava's own file is in English
  only, with its wordmark, which can't be changed, on the text's baseline. The guidelines ask that
  the button lead to Strava's authorize page, not that their file be used. The profile gets a card
  with the connected athlete and "Disconnect". Nothing else changes: the editor and the galleries
  keep reading an `ActivitySource`.
- **`StravaActivitySource`** (in `src/sources/strava/`), behind `PrivateRoutesSource` as today,
  with a cache on the phone (`expo-file-system`, one file per year of activity summaries; one per
  opened activity for its streams, splits and laps; one for the zones):
  - The cache is kept by month. Each month remembers when it was fetched and is fetched again
    once that is 7 days old (Strava's limit). A request asks Strava only for the stale or missing
    months, one paged query (`/athlete/activities`, 200 a page, `after`/`before`) per run of
    consecutive months.
  - New activities: the newest page (`per_page` 50, no `after`), shown at once from the cache and
    asked again in the background on opening the app and on coming back to it, at most once every
    5 minutes. It also catches edits and deletions within the time it covers, which are merged
    into the kept months; when something changed the screens load again. No refresh button.
    (Built so rather than with `after` the newest start, which misses edits and deletions.)
  - An activity's detail (`/activities/{id}` and `/activities/{id}/streams`) is fetched when it is
    opened in the editor and kept 7 days; the zones (`/athlete/zones`) are kept 7 days too.
  - Files older than 7 days are deleted on start, and all of them on disconnecting or signing out.
  - What to ask Strava for is decided by a pure, tested planner in `src/core/` (which months, from
    when, what to delete: `core/strava-cache.ts`); the source only does the requests
    (`sources/strava/strava-source.ts`, through `sources/strava/api.ts`). Months still to come
    are never asked for. 429 and network errors are shown with the screens' error state, and the
    rate limit usage goes in the error. The cache lives in the app's cache directory
    (`data/strava-cache-store.ts`), which the system may empty: Strava is then asked again.
- **The synthetic history stays** for tests, scene tests and development: an
  `EXPO_PUBLIC_ACTIVITY_SOURCE=fixtures` variable chooses it; release builds always use Strava.
- **Out of this ADR**: the map behind routes and place names by country (their own ADR, when
  choosing between Mapbox and MapTiler), steps in walks (only if a real walk's raw JSON brings
  them) and Strava's webhooks.

## Alternatives discarded

- **Both tokens on the phone (ADR 003)**: refreshing needs the secret anyway, so the server is
  involved every 6 hours; each phone would need its own connection, and with rotating refresh
  tokens two phones of the same user could invalidate each other. Disconnecting on account
  deletion would depend on the phone that holds the token.
- **Every Strava call through an Edge Function**: our server would see every activity (against
  "the server stores no activity data"), add latency to every screen and cost invocations, with
  the same rate limits, which are per app wherever the call comes from.
- **`redirect_uri` to an Edge Function, which changes the code and sends the browser back to the
  app**: it needs a public, unauthenticated function and a table of pending `state`s to know the
  user; the code through the app and `strava-connect` behind the session does the same with less.
- **Webhooks now**: they need a public endpoint and a way to tell the phones; the check on opening
  costs one call. Worth it if Strava asks for them in the review.
- **A cache in AsyncStorage or SQLite**: AsyncStorage has a size limit on Android and the cache is
  a few files read whole; SQLite would be a new dependency for no query we need.
