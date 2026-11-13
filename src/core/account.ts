import { z } from 'zod';

/**
 * Signing in with an email and a password (ADR 019): what the form accepts before anything is sent,
 * and what each answer of Supabase Auth means for the user, as a key of the app's texts.
 */

/** Shortest password the project accepts (Supabase Auth's setting, the same number). */
export const MIN_PASSWORD_LENGTH = 8;

/** Longest password Supabase Auth takes: bcrypt reads no more than 72 bytes. */
export const MAX_PASSWORD_LENGTH = 72;

const emailSchema = z.email();

/** The email as typed, without the spaces a keyboard adds, in lower case. */
export function normalizeEmail(typed: string): string {
  return typed.trim().toLowerCase();
}

/** Why a form can't be sent yet, as a key of `account.errors`. */
export type FormProblem = 'emailInvalid' | 'passwordShort' | 'passwordLong';

/**
 * What stops an email and a password from being sent, or `null` when they can go. The password's
 * length counts UTF-8 bytes past the shortest, as Supabase does. Time O(n).
 */
export function formProblem(email: string, password: string): FormProblem | null {
  if (!emailSchema.safeParse(normalizeEmail(email)).success) {
    return 'emailInvalid';
  }
  if ([...password].length < MIN_PASSWORD_LENGTH) {
    return 'passwordShort';
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) {
    return 'passwordLong';
  }
  return null;
}

/** What went wrong, as a key of `account.errors`. */
export type AuthProblem =
  | 'wrongCredentials'
  | 'notConfirmed'
  | 'weakPassword'
  | 'tooManyEmails'
  | 'tooManyTries'
  | 'emailInvalid'
  | 'offline'
  | 'unknown';

/** Supabase Auth's error codes (`AuthError.code`) and what each tells the user. */
const PROBLEMS: Readonly<Record<string, AuthProblem>> = {
  invalid_credentials: 'wrongCredentials',
  email_not_confirmed: 'notConfirmed',
  weak_password: 'weakPassword',
  over_email_send_rate_limit: 'tooManyEmails',
  over_request_rate_limit: 'tooManyTries',
  email_address_invalid: 'emailInvalid',
  validation_failed: 'emailInvalid',
};

/**
 * What an error of Supabase Auth means for the user. One with no code, raised before any answer
 * (no network), is `offline`. Time O(1).
 */
export function authProblem(error: {
  readonly code?: string;
  readonly name?: string;
}): AuthProblem {
  if (error.code !== undefined && PROBLEMS[error.code] !== undefined) {
    return PROBLEMS[error.code];
  }
  if (error.name === 'AuthRetryableFetchError') {
    return 'offline';
  }
  return 'unknown';
}

/**
 * The letter on the profile's button when there is no photo: the first of the athlete's name,
 * or of the account's email without one, in capitals (a whole character, also outside the BMP);
 * `null` when both are empty. Time O(n) for the name's length, space O(1).
 */
export function profileInitial(name: string, email: string): string | null {
  for (const text of [name, email]) {
    const [first] = text.trim();
    if (first !== undefined) {
      return first.toLocaleUpperCase();
    }
  }
  return null;
}
