import {
  type AuthError,
  isAuthPKCECodeVerifierMissingError,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useSyncExternalStore } from 'react';

import {
  type AuthProblem,
  authProblem,
  type FormProblem,
  formProblem,
  normalizeEmail,
} from '@/core/account';
import { logError } from '@/ui/log';

import { supabase } from './supabase';

/**
 * The account on this phone (ADR 019), for the whole app: whether someone is signed in, read once
 * from the stored session and then kept as Supabase Auth reports it, and what can be done to sign
 * in, up or out.
 */
export type AuthState =
  | { readonly status: 'loading' }
  /** The app has no Supabase project in its environment: no one can sign in. */
  | { readonly status: 'unconfigured' }
  | { readonly status: 'signedOut' }
  | {
      readonly status: 'signedIn';
      readonly userId: string;
      readonly email: string | null;
      /** Came in through a link to choose a new password, which it still has to. */
      readonly recovering: boolean;
    };

let state: AuthState = { status: 'loading' };
const listeners = new Set<() => void>();
let started = false;

function set(next: AuthState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function stateOf(session: Session | null, recovering: boolean): AuthState {
  if (session === null) {
    return { status: 'signedOut' };
  }
  return {
    status: 'signedIn',
    userId: session.user.id,
    email: session.user.email ?? null,
    recovering,
  };
}

/**
 * Starts following the account: the stored session, then every change Supabase reports. Once per
 * launch; later calls do nothing.
 */
export function startAuth(): void {
  if (started) {
    return;
  }
  started = true;
  const client = supabase();
  if (client === null) {
    set({ status: 'unconfigured' });
    return;
  }
  // Supabase reports the stored session first (`INITIAL_SESSION`). No awaiting in here: the
  // client holds a lock while it calls, and a call back into it would wait for itself.
  client.auth.onAuthStateChange((event, session) => {
    const recovering =
      event === 'PASSWORD_RECOVERY' ||
      (event !== 'USER_UPDATED' && state.status === 'signedIn' && state.recovering);
    set(stateOf(session, recovering));
  });
}

/** The account as it is now, and again whenever it changes. */
export function useAuth(): AuthState {
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

/** What an action came to: done, or why not, as a key of `account.errors`. */
export type AuthResult =
  { readonly ok: true } | { readonly ok: false; readonly problem: AuthProblem | FormProblem };

const DONE: AuthResult = { ok: true };

function failed(problem: AuthProblem | FormProblem): AuthResult {
  return { ok: false, problem };
}

/** The client, or the reason why there is none. */
function client(): SupabaseClient {
  const made = supabase();
  if (made === null) {
    throw new Error('Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and its key');
  }
  return made;
}

/** An error of Supabase Auth, logged when unexpected, as a result for the form. */
function fromError(context: string, error: AuthError): AuthResult {
  const problem = authProblem(error);
  if (problem === 'unknown') {
    logError(context, error);
  }
  return failed(problem);
}

/** Where a link of an email brings the user back: this app, at `path`. */
function backTo(path: string): string {
  return Linking.createURL(path);
}

/**
 * Where a provider's sign-in brings the user back: the app's scheme and `auth-callback`, with no
 * server. In Expo Go `backTo` names the computer serving the app by its IP, and Supabase refuses
 * every return address whose server is an IP (but 127.0.0.1), sending the user to the Site URL,
 * which Expo Go can't open. The system's browser session hands back any address of the scheme it
 * waits for without opening it, so the server part isn't needed.
 */
function providerBackTo(): string {
  return `${appScheme()}://auth-callback`;
}

/** The scheme the app's links use: `exp` in Expo Go, `allrun` in the app's own builds. */
export function appScheme(): string {
  const url = Linking.createURL('');
  return url.slice(0, url.indexOf(':'));
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const problem = formProblem(email, password);
  if (problem !== null) {
    return failed(problem);
  }
  const { error } = await client().auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  return error === null ? DONE : fromError('Could not sign in with email', error);
}

/**
 * Makes an account. Supabase sends a link to confirm the email, which signs in once opened;
 * for an email already taken it answers the same, so that no one can learn who has an account.
 */
export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  const problem = formProblem(email, password);
  if (problem !== null) {
    return failed(problem);
  }
  const { error } = await client().auth.signUp({
    email: normalizeEmail(email),
    password,
    options: { emailRedirectTo: backTo('auth-callback') },
  });
  return error === null ? DONE : fromError('Could not sign up with email', error);
}

/** Sends a link to choose a new password, which opens the app (see `exchangeFromLink`). */
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (formProblem(email, 'x'.repeat(8)) === 'emailInvalid') {
    return failed('emailInvalid');
  }
  const { error } = await client().auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo: backTo('auth-callback'),
  });
  return error === null ? DONE : fromError('Could not send a password reset', error);
}

/** Sets a new password, after coming in through a reset link. */
export async function setNewPassword(password: string): Promise<AuthResult> {
  const problem = formProblem('a@b.co', password);
  if (problem !== null) {
    return failed(problem);
  }
  const { error } = await client().auth.updateUser({ password });
  return error === null ? DONE : fromError('Could not set a new password', error);
}

/** The codes already traded for a session: a link can arrive twice (see `exchangeCode`). */
const usedCodes = new Set<string>();

/**
 * Trades the code a link brought back (an email's confirmation or reset, Google's or Apple's
 * sign-in) for a session. On Android the link reaches the app both through the browser session
 * and as a link of its own: the second time does nothing. In Expo Go on Android the link of its
 * own reloads the app, which forgets the codes it traded: the second trade then finds no PKCE
 * verifier (the first used it up) but a session, and that is no error.
 */
export async function exchangeCode(code: string): Promise<AuthResult> {
  if (usedCodes.has(code)) {
    return DONE;
  }
  usedCodes.add(code);
  const { error } = await client().auth.exchangeCodeForSession(code);
  if (error === null) {
    return DONE;
  }
  if (isAuthPKCECodeVerifierMissingError(error)) {
    const { data } = await client().auth.getSession();
    if (data.session !== null) {
      return DONE;
    }
  }
  return fromError('Could not trade a sign-in code', error);
}

/** {@link exchangeCode} with the code in a link, or the error it came back with. */
export async function exchangeFromLink(url: string): Promise<AuthResult> {
  const { queryParams } = Linking.parse(url);
  const code = queryParams?.code;
  if (typeof code === 'string' && code !== '') {
    return exchangeCode(code);
  }
  const description = queryParams?.error_description;
  logError(
    'A sign-in link came back without a code',
    new Error(typeof description === 'string' ? description : url),
  );
  return failed('unknown');
}

/**
 * Signs in with Google in the system's browser (ADR 019): Supabase's sign-in page, and back to the
 * app with a code. Closing the browser is no error.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  const redirectTo = providerBackTo();
  const { data, error } = await client().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error !== null) {
    return fromError('Could not start signing in with Google', error);
  }
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    return DONE;
  }
  return exchangeFromLink(result.url);
}

/** Signs out of this phone only: the account stays signed in on the others. */
export async function signOut(): Promise<AuthResult> {
  const { error } = await client().auth.signOut({ scope: 'local' });
  return error === null ? DONE : fromError('Could not sign out', error);
}

/**
 * Deletes the account and everything it holds (the `delete-account` function), then signs out of
 * this phone, whose own session the server already ended.
 */
export async function deleteAccount(): Promise<AuthResult> {
  const { error } = await client().functions.invoke('delete-account', { method: 'POST' });
  if (error !== null) {
    logError('Could not delete the account', error);
    return failed('unknown');
  }
  await client().auth.signOut({ scope: 'local' });
  return DONE;
}
