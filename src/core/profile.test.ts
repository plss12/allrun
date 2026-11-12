import {
  APP_LANGUAGE_CHOICES,
  appLanguage,
  DEFAULT_PROFILE,
  parseProfileRow,
  parseStoredProfile,
  profileRow,
} from './profile';

describe('the profile', () => {
  it('reads a row of the server and writes it back', () => {
    const profile = parseProfileRow({
      route_privacy_meters: 500,
      update_emails: true,
      app_language: 'en',
      id: 'x',
    });
    expect(profile).toEqual({ routePrivacyMeters: 500, updateEmails: true, appLanguage: 'en' });
    expect(profileRow(profile)).toEqual({
      route_privacy_meters: 500,
      update_emails: true,
      app_language: 'en',
    });
  });

  it('refuses a distance the profile does not offer', () => {
    expect(() =>
      parseProfileRow({ route_privacy_meters: 1000, update_emails: false, app_language: 'system' }),
    ).toThrow(/route_privacy_meters/);
  });

  it('refuses a language the app does not have', () => {
    expect(() =>
      parseProfileRow({ route_privacy_meters: 0, update_emails: false, app_language: 'fr' }),
    ).toThrow(/app_language/);
  });

  it('starts with routes whole, no emails and the phone language', () => {
    expect(DEFAULT_PROFILE).toEqual({
      routePrivacyMeters: 0,
      updateEmails: false,
      appLanguage: 'system',
    });
  });

  it('reads what the phone kept, and refuses one of nobody', () => {
    const stored = {
      userId: 'u1',
      routePrivacyMeters: 100,
      updateEmails: false,
      appLanguage: 'es',
    };
    expect(parseStoredProfile(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(() => parseStoredProfile({ ...stored, userId: '' })).toThrow(/userId/);
  });

  it('reads a profile kept before the language existed as the phone language', () => {
    expect(parseStoredProfile({ userId: 'u1', routePrivacyMeters: 0, updateEmails: true })).toEqual(
      { userId: 'u1', routePrivacyMeters: 0, updateEmails: true, appLanguage: 'system' },
    );
  });
});

describe('appLanguage', () => {
  it('offers the phone language first, then each language', () => {
    expect(APP_LANGUAGE_CHOICES).toEqual(['system', 'es', 'en']);
  });

  it('follows the phone unless one is chosen', () => {
    expect(appLanguage('system', 'es')).toBe('es');
    expect(appLanguage('system', 'en')).toBe('en');
    expect(appLanguage('en', 'es')).toBe('en');
    expect(appLanguage('es', 'en')).toBe('es');
  });
});
