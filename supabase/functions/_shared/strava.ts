// Strava's OAuth for the Edge Functions (ADR 020): changing a code for tokens, refreshing and
// revoking them, which all need the app's client secret, and the connections table, whose tokens
// are encrypted here. Only these functions hold the secret and the encryption key.
//
// Reference: https://developers.strava.com/docs/authentication/
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4';

const TOKEN_URL = 'https://www.strava.com/api/v3/oauth/token';
const REVOKE_URL = 'https://www.strava.com/oauth/revoke';

/** Strava gives back the same access token while it has more than this left. */
export const STRAVA_FRESH_MS = 60 * 60 * 1000;

/** The app's credentials and the key the tokens are encrypted with. */
export interface StravaApp {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly tokenKey: CryptoKey;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value === '') {
    throw new Error(`The function secret ${name} is not set`);
  }
  return value;
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text);
}

/**
 * Reads the app's secrets: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` and `STRAVA_TOKEN_KEY` (32
 * random bytes in base64).
 *
 * @throws Error when one is missing or the key isn't 32 bytes.
 */
export async function stravaApp(): Promise<StravaApp> {
  const keyBytes = fromBase64(requiredEnv('STRAVA_TOKEN_KEY'));
  if (keyBytes.length !== 32) {
    throw new Error('STRAVA_TOKEN_KEY must be 32 bytes in base64');
  }
  const tokenKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return {
    clientId: requiredEnv('STRAVA_CLIENT_ID'),
    clientSecret: requiredEnv('STRAVA_CLIENT_SECRET'),
    tokenKey,
  };
}

const IV_BYTES = 12;

/** A token encrypted with AES-GCM: a fresh IV and the ciphertext, together in base64. */
async function encrypt(app: StravaApp, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      app.tokenKey,
      new TextEncoder().encode(token),
    ),
  );
  const joined = new Uint8Array(IV_BYTES + sealed.length);
  joined.set(iv);
  joined.set(sealed, IV_BYTES);
  return toBase64(joined);
}

/** @throws Error when the text wasn't encrypted with this key. */
async function decrypt(app: StravaApp, stored: string): Promise<string> {
  const joined = fromBase64(stored);
  const opened = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: joined.slice(0, IV_BYTES) },
    app.tokenKey,
    joined.slice(IV_BYTES),
  );
  return new TextDecoder().decode(opened);
}

const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  // Seconds since the epoch.
  expires_at: z.number().int().positive(),
});

const exchangeSchema = tokensSchema.extend({
  athlete: z.object({
    id: z.number().int().positive(),
    firstname: z.string().nullish(),
    lastname: z.string().nullish(),
  }),
});

/** Strava refused the code or the refresh token: the athlete has to connect again. */
export class StravaRefused extends Error {}

/**
 * Asks Strava's token endpoint.
 *
 * @throws StravaRefused when Strava answers 400 or 401 (a bad code or a revoked refresh token).
 * @throws Error on any other failure (Strava down, its rate limit, an unexpected answer).
 */
async function askForTokens(app: StravaApp, grant: Record<string, string>): Promise<unknown> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      ...grant,
    }),
  });
  if (response.status === 400 || response.status === 401) {
    throw new StravaRefused(`Strava refused the ${grant.grant_type}: ${await response.text()}`);
  }
  if (!response.ok) {
    throw new Error(
      `Strava's token endpoint answered ${response.status}: ${await response.text()}`,
    );
  }
  return response.json();
}

/** The tokens and the athlete a sign-in code is worth. */
export interface Exchanged {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
  readonly athleteId: number;
  readonly athleteName: string;
}

/** Changes the code Strava's sign-in brought back for the athlete's tokens. */
export async function exchangeCode(app: StravaApp, code: string): Promise<Exchanged> {
  const answer = exchangeSchema.parse(
    await askForTokens(app, { grant_type: 'authorization_code', code }),
  );
  return {
    accessToken: answer.access_token,
    refreshToken: answer.refresh_token,
    expiresAt: new Date(answer.expires_at * 1000),
    athleteId: answer.athlete.id,
    athleteName: [answer.athlete.firstname, answer.athlete.lastname]
      .filter((part) => typeof part === 'string' && part.trim() !== '')
      .join(' ')
      .trim(),
  };
}

/**
 * Revokes a token and, with it, the other of its pair. Strava answers 200 even for a token it no
 * longer knows.
 *
 * @throws Error when Strava doesn't answer 200.
 */
export async function revokeToken(app: StravaApp, token: string): Promise<void> {
  const response = await fetch(REVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${app.clientId}:${app.clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ token }),
  });
  if (!response.ok) {
    throw new Error(
      `Strava's revoke endpoint answered ${response.status}: ${await response.text()}`,
    );
  }
}

/** Whether the granted scopes let the app read activities (`activity:read` or `_all`). */
export function canReadActivities(scope: string): boolean {
  return scope
    .split(/[\s,]+/)
    .some((granted) => granted === 'activity:read' || granted === 'activity:read_all');
}

/** What the phone gets: a valid access token, or that Strava isn't connected. */
export type ConnectionAnswer =
  | {
      readonly connected: true;
      readonly accessToken: string;
      /** Milliseconds since the epoch. */
      readonly expiresAt: number;
      readonly athleteName: string;
      readonly scope: string;
    }
  | { readonly connected: false };

export const NOT_CONNECTED: ConnectionAnswer = { connected: false };

const TABLE = 'strava_connections';

const rowSchema = z.object({
  athlete_name: z.string(),
  scope: z.string(),
  refresh_token: z.string(),
  access_token: z.string(),
  expires_at: z.string(),
});

/** A user's connection, its tokens already decrypted. */
export interface Connection {
  readonly athleteName: string;
  readonly scope: string;
  readonly refreshToken: string;
  /** The refresh token as stored, to tell whether another call has rotated it since. */
  readonly storedRefreshToken: string;
  readonly accessToken: string;
  readonly expiresAt: Date;
}

/** @throws Error when the table can't be read or a token can't be decrypted. */
export async function readConnection(
  app: StravaApp,
  admin: SupabaseClient,
  userId: string,
): Promise<Connection | null> {
  const { data, error } = await admin
    .from(TABLE)
    .select('athlete_name, scope, refresh_token, access_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error !== null) {
    throw new Error(`Could not read the Strava connection: ${error.message}`);
  }
  if (data === null) {
    return null;
  }
  const row = rowSchema.parse(data);
  return {
    athleteName: row.athlete_name,
    scope: row.scope,
    refreshToken: await decrypt(app, row.refresh_token),
    storedRefreshToken: row.refresh_token,
    accessToken: await decrypt(app, row.access_token),
    expiresAt: new Date(row.expires_at),
  };
}

/**
 * Keeps a newly connected athlete for the user, replacing what they had connected and taking the
 * athlete away from any other account (one athlete, one account).
 *
 * @throws Error when the table can't be written.
 */
export async function saveConnection(
  app: StravaApp,
  admin: SupabaseClient,
  userId: string,
  exchanged: Exchanged,
  scope: string,
): Promise<void> {
  const moved = await admin
    .from(TABLE)
    .delete()
    .eq('athlete_id', exchanged.athleteId)
    .neq('user_id', userId);
  if (moved.error !== null) {
    throw new Error(`Could not free the athlete from another account: ${moved.error.message}`);
  }
  const now = new Date().toISOString();
  const { error } = await admin.from(TABLE).upsert({
    user_id: userId,
    athlete_id: exchanged.athleteId,
    athlete_name: exchanged.athleteName,
    scope,
    refresh_token: await encrypt(app, exchanged.refreshToken),
    access_token: await encrypt(app, exchanged.accessToken),
    expires_at: exchanged.expiresAt.toISOString(),
    connected_at: now,
    updated_at: now,
  });
  if (error !== null) {
    throw new Error(`Could not save the Strava connection: ${error.message}`);
  }
}

/** @throws Error when the table can't be written. */
export async function deleteConnection(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.from(TABLE).delete().eq('user_id', userId);
  if (error !== null) {
    throw new Error(`Could not delete the Strava connection: ${error.message}`);
  }
}

/**
 * Refreshes the user's tokens and keeps the new ones: the last Strava gave are the ones that work.
 * Two calls refreshing at once may find the refresh token rotated by the other (see
 * `strava-token`).
 *
 * @throws StravaRefused when Strava refused the refresh token.
 * @throws Error on any other failure.
 */
export async function refreshConnection(
  app: StravaApp,
  admin: SupabaseClient,
  userId: string,
  connection: Connection,
): Promise<Connection> {
  const answer = tokensSchema.parse(
    await askForTokens(app, {
      grant_type: 'refresh_token',
      refresh_token: connection.refreshToken,
    }),
  );
  const storedRefreshToken = await encrypt(app, answer.refresh_token);
  const refreshed: Connection = {
    ...connection,
    refreshToken: answer.refresh_token,
    storedRefreshToken,
    accessToken: answer.access_token,
    expiresAt: new Date(answer.expires_at * 1000),
  };
  const { error } = await admin
    .from(TABLE)
    .update({
      refresh_token: storedRefreshToken,
      access_token: await encrypt(app, answer.access_token),
      expires_at: refreshed.expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  if (error !== null) {
    throw new Error(`Could not save the refreshed Strava tokens: ${error.message}`);
  }
  return refreshed;
}

/** What the phone gets for a connection. */
export function answerFor(connection: Connection): ConnectionAnswer {
  return {
    connected: true,
    accessToken: connection.accessToken,
    expiresAt: connection.expiresAt.getTime(),
    athleteName: connection.athleteName,
    scope: connection.scope,
  };
}

/** The JSON body of a POST, or `null` when it is none. */
export async function jsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === '') {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('The request body is not JSON', error);
    return null;
  }
}
