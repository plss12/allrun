import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { type AppLanguageChoice, appLanguage } from '@/core/profile';
import type { DistanceUnit } from '@/core/units';
import { logError } from '@/ui/log';

import { en } from './locales/en';
import { es } from './locales/es';

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const defaultNS = 'translation';
export const resources = {
  en: { translation: en },
  es: { translation: es },
} as const;

/** First device language we support, or English. */
export function deviceLanguage(): Language {
  for (const { languageCode } of getLocales()) {
    const match = SUPPORTED_LANGUAGES.find((language) => language === languageCode);
    if (match !== undefined) {
      return match;
    }
  }
  return 'en';
}

/** Distance unit matching the device's measurement system (miles in the US and UK). */
export function deviceDistanceUnit(): DistanceUnit {
  const system = getLocales()[0]?.measurementSystem;
  return system === 'us' || system === 'uk' ? 'mi' : 'km';
}

/** App-wide i18next instance; `initReactI18next` makes it the one `useTranslation` uses. */
export const i18n = createInstance();

i18n
  .use(initReactI18next)
  .init({
    resources,
    defaultNS,
    lng: deviceLanguage(),
    fallbackLng: 'en',
    // React already escapes rendered strings.
    interpolation: { escapeValue: false },
  })
  .catch((error: unknown) => {
    console.error('Failed to initialize i18n', error);
  });

/**
 * Shows the interface in the language the profile chose, kept with the account (ADR 019);
 * `system` follows the phone. Every `useTranslation` redraws in it.
 */
export function applyAppLanguage(choice: AppLanguageChoice): void {
  const language = appLanguage(choice, deviceLanguage());
  if (i18n.language === language) {
    return;
  }
  i18n.changeLanguage(language).catch((error: unknown) => {
    logError(`Could not change the app's language to ${language}`, error);
  });
}
