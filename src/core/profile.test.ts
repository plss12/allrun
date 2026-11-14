import {
  APP_LANGUAGE_CHOICES,
  appLanguage,
  DEFAULT_PROFILE,
  DISTANCE_UNIT_CHOICES,
  distanceUnit,
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
      distance_units: 'mi',
      id: 'x',
    });
    expect(profile).toEqual({
      routePrivacyMeters: 500,
      updateEmails: true,
      appLanguage: 'en',
      distanceUnits: 'mi',
    });
    expect(profileRow(profile)).toEqual({
      route_privacy_meters: 500,
      update_emails: true,
      app_language: 'en',
      distance_units: 'mi',
    });
  });

  const row = {
    route_privacy_meters: 0,
    update_emails: false,
    app_language: 'system',
    distance_units: 'system',
  };

  it('refuses a distance the profile does not offer', () => {
    expect(() => parseProfileRow({ ...row, route_privacy_meters: 1000 })).toThrow(
      /route_privacy_meters/,
    );
  });

  it('refuses a language the app does not have', () => {
    expect(() => parseProfileRow({ ...row, app_language: 'fr' })).toThrow(/app_language/);
  });

  it('refuses a unit the app does not have', () => {
    expect(() => parseProfileRow({ ...row, distance_units: 'yd' })).toThrow(/distance_units/);
  });

  it("starts with routes whole, no emails and the phone's language and units", () => {
    expect(DEFAULT_PROFILE).toEqual({
      routePrivacyMeters: 0,
      updateEmails: false,
      appLanguage: 'system',
      distanceUnits: 'system',
    });
  });

  it('reads what the phone kept, and refuses one of nobody', () => {
    const stored = {
      userId: 'u1',
      routePrivacyMeters: 100,
      updateEmails: false,
      appLanguage: 'es',
      distanceUnits: 'km',
    };
    expect(parseStoredProfile(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(() => parseStoredProfile({ ...stored, userId: '' })).toThrow(/userId/);
  });

  it("reads a profile kept before the language and units existed as the phone's", () => {
    expect(parseStoredProfile({ userId: 'u1', routePrivacyMeters: 0, updateEmails: true })).toEqual(
      {
        userId: 'u1',
        routePrivacyMeters: 0,
        updateEmails: true,
        appLanguage: 'system',
        distanceUnits: 'system',
      },
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

describe('distanceUnit', () => {
  it("offers the phone's region's first, then kilometers and miles", () => {
    expect(DISTANCE_UNIT_CHOICES).toEqual(['system', 'km', 'mi']);
  });

  it("follows the phone's region unless one is chosen", () => {
    expect(distanceUnit('system', 'mi')).toBe('mi');
    expect(distanceUnit('km', 'mi')).toBe('km');
    expect(distanceUnit('mi', 'km')).toBe('mi');
  });
});
