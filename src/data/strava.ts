import { FunctionsHttpError } from '@supabase/supabase-js';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useSyncExternalStore } from 'react';

import {
  isAccessFresh,
  parseStoredStravaAccess,
  parseStravaAnswer,
  parseStravaCallback,
  type StravaAccess,
  stravaAuthorizeUrl,
  stravaRedirectUri,
} from '@/core/strava-connection';
import { logError } from '@/ui/log';

import { appScheme } from './auth';
import { forgetNamedPlaces } from './place-lookup';
import { clearStravaCache } from './strava-cache-store';
import { supabase } from './supabase';

/**
 * The signed-in user's Strava (ADR 020), for the whole app: whether it is connected, connecting
 * and disconnecting it, and the access token to read it with. The refresh token never reaches the
 * phone: the `strava-*` functions keep it and give out access tokens, which the phone keeps in the
 * secure store with whose account they are.
 */
export type StravaState =
  /** Reading what the phone kept: the launch screen waits for it. */
  | { readonly status: 'reading' }
  /** Nothing kept on the phone: asking the account. */
  | { readonly status: 'checking' }
  /** The account could not be asked: try again. */
  | { readonly status: 'failed' }
  | { readonly status: 'disconnected' }
  | { readonly status: 'connected'; readonly athleteName: string };

const STORE_KEY = 'strava-access';

let userId: string | null = null;
let state: StravaState = { status: 'reading' };
let access: StravaAccess | null = null;
/** Bumped on every change of account: what was asked for another one is dropped. */
let generation = 0;
const listeners = new Set<() => void>();

function set(next: StravaState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

/** The Strava as it is now, and again whenever it changes. */
export function useStrava(): StravaState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
  );
}

function client() {
  const made = supabase();
  if (made === null) {
    throw new Error('Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and its key');
  }
  return made;
}

/** Forgets the activities kept of a Strava no longer connected here. */
function forgetActivities(): void {
  try {
    clearStravaCache();
    forgetNamedPlaces();
  } catch (error) {
    logError('Could not clear the Strava activities kept on the phone', error);
  }
}

/** Keeps `next` as the account's access, on the phone too; `null` forgets it, and its activities. */
async function keep(owner: string, next: StravaAccess | null): Promise<void> {
  access = next;
  if (next === null) {
    forgetActivities();
  }
  set(
    next === null
      ? { status: 'disconnected' }
      : { status: 'connected', athleteName: next.athleteName },
  );
  try {
    if (next === null) {
      await SecureStore.deleteItemAsync(STORE_KEY);
    } else {
      await SecureStore.setItemAsync(STORE_KEY, JSON.stringify({ ...next, userId: owner }));
    }
  } catch (error) {
    // The account still has the connection: only the next launch asks it again.
    logError('Could not keep the Strava access on the phone', error);
  }
}

/** What the phone kept for `owner`, or `null` (another user's, none, or damaged). */
async function kept(owner: string): Promise<StravaAccess | null> {
  try {
    const stored = await SecureStore.getItemAsync(STORE_KEY);
    if (stored === null) {
      return null;
    }
    const { userId: keptFor, ...rest } = parseStoredStravaAccess(JSON.parse(stored));
    return keptFor === owner ? rest : null;
  } catch (error) {
    logError('Could not read the Strava access kept on the phone', error);
    return null;
  }
}

/** Calls one of the `strava-*` functions and reads its answer. */
async function invoke(name: string, body: object): Promise<StravaAccess | null> {
  const { data, error } = await client().functions.invoke<unknown>(name, {
    method: 'POST',
    body,
  });
  if (error !== null) {
    throw error;
  }
  return parseStravaAnswer(data);
}

/** The one ask for an access token under way, so that loads at once share it. */
let asking: Promise<StravaAccess | null> | null = null;

/** Asks the account for an access token: a new one if `rejected` is the one Strava refused. */
function askAccount(owner: string, rejected?: string): Promise<StravaAccess | null> {
  if (asking !== null) {
    return asking;
  }
  const asked = generation;
  asking = invoke('strava-token', rejected === undefined ? {} : { rejected })
    .then(async (answer) => {
      if (asked === generation) {
        await keep(owner, answer);
      }
      return answer;
    })
    .finally(() => {
      asking = null;
    });
  return asking;
}

/**
 * Follows `owner`'s Strava: what the phone kept at once, or else the account's. `null` (signed
 * out) forgets it, on the phone too: another person may sign in next.
 */
export function followStrava(owner: string | null): void {
  if (owner === userId) {
    return;
  }
  const previous = userId;
  userId = owner;
  generation += 1;
  access = null;
  asking = null;
  if (owner === null) {
    set({ status: 'reading' });
    if (previous !== null) {
      forgetActivities();
      SecureStore.deleteItemAsync(STORE_KEY).catch((error: unknown) =>
        logError('Could not forget the Strava access on signing out', error),
      );
    }
    return;
  }
  const following = generation;
  void kept(owner).then((stored) => {
    if (following !== generation) {
      return;
    }
    if (stored !== null) {
      // Still connected as far as the phone knows; a token past its time is renewed when needed.
      access = stored;
      set({ status: 'connected', athleteName: stored.athleteName });
      return;
    }
    checkAccount(owner);
  });
}

function checkAccount(owner: string): void {
  set({ status: 'checking' });
  const checking = generation;
  askAccount(owner).catch((error: unknown) => {
    logError('Could not ask the account for its Strava', error);
    if (checking === generation) {
      set({ status: 'failed' });
    }
  });
}

/** Asks the account again, after it failed. */
export function retryStrava(): void {
  if (userId !== null && state.status === 'failed') {
    checkAccount(userId);
  }
}

/**
 * A valid access token for Strava's API, or `null` once Strava turns out not to be connected
 * (disconnected on another phone, or revoked in Strava's settings), which then shows the screen
 * to connect it. After a 401, pass the token Strava refused, so that a new one is asked for.
 *
 * @throws Error when the account can't be asked.
 */
export async function stravaAccessToken(rejected?: string): Promise<string | null> {
  const owner = userId;
  if (owner === null) {
    return null;
  }
  if (access !== null && access.accessToken !== rejected && isAccessFresh(access, Date.now())) {
    return access.accessToken;
  }
  const answer = await askAccount(owner, rejected);
  return answer?.accessToken ?? null;
}

/** What connecting came to. */
export type ConnectResult =
  | 'connected'
  /** The browser was closed, or the athlete pressed "Cancel" on Strava's page. */
  | 'cancelled'
  /** The activities were unticked on Strava's page. */
  | 'missingActivityScope'
  /** The app has no Strava app in its environment. */
  | 'unconfigured'
  | 'failed';

/** The sign-in this phone started, and its completion, shared if it comes back twice. */
let pending: { readonly state: string; completing: Promise<ConnectResult> | null } | null = null;

function randomState(): string {
  return Array.from(getRandomBytes(16), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Whether a function's error is its answer with `status`. */
function answeredWith(error: unknown, status: number): boolean {
  return (
    error instanceof FunctionsHttpError &&
    error.context instanceof Response &&
    error.context.status === status
  );
}

/**
 * Finishes connecting with the address Strava's sign-in came back to: through the browser
 * session, or, on Android, also as a link to the app (`app/strava-callback.tsx`). The second time
 * gets the first one's result.
 */
export function completeStravaLink(url: string): Promise<ConnectResult> {
  const started = pending;
  const owner = userId;
  if (started === null || owner === null) {
    return Promise.resolve('failed');
  }
  if (started.completing !== null) {
    return started.completing;
  }
  const callback = parseStravaCallback(url, started.state);
  const completing = (async (): Promise<ConnectResult> => {
    switch (callback.kind) {
      case 'denied':
        return 'cancelled';
      case 'missingActivityScope':
        return 'missingActivityScope';
      case 'invalid':
        logError('Strava came back without a code of this sign-in', new Error(url.split('?')[0]));
        return 'failed';
      case 'code':
        break;
    }
    const asked = generation;
    try {
      const answer = await invoke('strava-connect', { code: callback.code, scope: callback.scope });
      if (asked === generation) {
        await keep(owner, answer);
      }
      return answer === null ? 'failed' : 'connected';
    } catch (error) {
      if (answeredWith(error, 422)) {
        return 'missingActivityScope';
      }
      logError('Could not connect Strava', error);
      return 'failed';
    }
  })();
  started.completing = completing;
  return completing;
}

/**
 * Connects Strava in the system's browser (ADR 020): Strava's sign-in page, and back to the app
 * with a code that the `strava-connect` function changes for the athlete's tokens.
 */
export async function connectStrava(): Promise<ConnectResult> {
  const clientId = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID;
  if (clientId === undefined || !/^\d+$/.test(clientId)) {
    return 'unconfigured';
  }
  const redirectUri = stravaRedirectUri(appScheme());
  const started = { state: randomState(), completing: null };
  pending = started;
  try {
    const result = await WebBrowser.openAuthSessionAsync(
      stravaAuthorizeUrl({ clientId, redirectUri, state: started.state }),
      redirectUri,
    );
    if (result.type !== 'success') {
      // On Android the link may have finished it already.
      return started.completing ?? 'cancelled';
    }
    return await completeStravaLink(result.url);
  } finally {
    if (pending === started) {
      pending = null;
    }
  }
}

/**
 * Disconnects Strava for the account (`strava-disconnect`): AllRun leaves the athlete's Strava
 * settings and the tokens are forgotten.
 *
 * @returns Whether it was done.
 */
export async function disconnectStrava(): Promise<boolean> {
  const owner = userId;
  if (owner === null) {
    return false;
  }
  try {
    const answer = await invoke('strava-disconnect', {});
    if (owner === userId) {
      await keep(owner, answer);
    }
    return true;
  } catch (error) {
    logError('Could not disconnect Strava', error);
    return false;
  }
}
