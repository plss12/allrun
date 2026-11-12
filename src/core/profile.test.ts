import { DEFAULT_PROFILE, parseProfileRow, parseStoredProfile, profileRow } from './profile';

describe('the profile', () => {
  it('reads a row of the server and writes it back', () => {
    const profile = parseProfileRow({ route_privacy_meters: 500, update_emails: true, id: 'x' });
    expect(profile).toEqual({ routePrivacyMeters: 500, updateEmails: true });
    expect(profileRow(profile)).toEqual({ route_privacy_meters: 500, update_emails: true });
  });

  it('refuses a distance the profile does not offer', () => {
    expect(() => parseProfileRow({ route_privacy_meters: 1000, update_emails: false })).toThrow(
      /route_privacy_meters/,
    );
  });

  it('starts with routes whole and no emails', () => {
    expect(DEFAULT_PROFILE).toEqual({ routePrivacyMeters: 0, updateEmails: false });
  });

  it('reads what the phone kept, and refuses one of nobody', () => {
    const stored = { userId: 'u1', routePrivacyMeters: 100, updateEmails: false };
    expect(parseStoredProfile(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(() => parseStoredProfile({ ...stored, userId: '' })).toThrow(/userId/);
  });
});
