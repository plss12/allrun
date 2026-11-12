import { z } from 'zod';

import { ROUTE_PRIVACY_CHOICES, type RoutePrivacyChoice } from './route-privacy';
import type { DesignLanguage } from './template';

/**
 * The language of the app's interface: the phone's (`system`, as before there was a choice) or
 * one of the app's, in the order the profile offers them. The widgets of a design keep their own.
 */
export const APP_LANGUAGE_CHOICES = ['system', 'es', 'en'] as const;
export type AppLanguageChoice = (typeof APP_LANGUAGE_CHOICES)[number];

/** The language the app shows for `choice`, `phone` being the phone's first one the app has. */
export function appLanguage(choice: AppLanguageChoice, phone: DesignLanguage): DesignLanguage {
  return choice === 'system' ? phone : choice;
}

const languageSchema = z.enum(APP_LANGUAGE_CHOICES);

/**
 * The user's profile (ADR 019): what they set once for all their images, kept with their account
 * (`public.profiles`) and on the phone, to have it at once.
 */
export interface Profile {
  /** How much of each end of every route is hidden: 0 shows them whole. */
  readonly routePrivacyMeters: 0 | RoutePrivacyChoice;
  /** Whether they want AllRun's update emails: never, until they turn it on (GDPR). */
  readonly updateEmails: boolean;
  /** The language of the app's interface. */
  readonly appLanguage: AppLanguageChoice;
}

/** A new account's profile: routes whole, no emails, the phone's language. */
export const DEFAULT_PROFILE: Profile = {
  routePrivacyMeters: 0,
  updateEmails: false,
  appLanguage: 'system',
};

const metersSchema = z.union([z.literal(0), ...ROUTE_PRIVACY_CHOICES.map((m) => z.literal(m))]);

/** A row of `public.profiles` as the Data API returns it. */
const profileRowSchema = z.object({
  route_privacy_meters: metersSchema,
  update_emails: z.boolean(),
  app_language: languageSchema,
});

/**
 * Validates the profile the server returned.
 *
 * @throws Error naming each invalid field.
 */
export function parseProfileRow(row: unknown): Profile {
  const result = profileRowSchema.safeParse(row);
  if (!result.success) {
    throw new Error(`Invalid profile row:\n${z.prettifyError(result.error)}`, {
      cause: result.error,
    });
  }
  return {
    routePrivacyMeters: result.data.route_privacy_meters,
    updateEmails: result.data.update_emails,
    appLanguage: result.data.app_language,
  };
}

/** The columns of `public.profiles` a user may change, for `profile`. */
export function profileRow(profile: Profile): {
  readonly route_privacy_meters: number;
  readonly update_emails: boolean;
  readonly app_language: AppLanguageChoice;
} {
  return {
    route_privacy_meters: profile.routePrivacyMeters,
    update_emails: profile.updateEmails,
    app_language: profile.appLanguage,
  };
}

/** The profile as the phone keeps it, with whose it is. */
const storedProfileSchema = z.object({
  userId: z.string().min(1),
  routePrivacyMeters: metersSchema,
  updateEmails: z.boolean(),
  // Kept before the language could be chosen: the phone's.
  appLanguage: languageSchema.default('system'),
});

export type StoredProfile = z.infer<typeof storedProfileSchema>;

/**
 * Validates the profile kept on the phone.
 *
 * @throws Error naming each invalid field.
 */
export function parseStoredProfile(json: unknown): StoredProfile {
  const result = storedProfileSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid stored profile:\n${z.prettifyError(result.error)}`, {
      cause: result.error,
    });
  }
  return result.data;
}
