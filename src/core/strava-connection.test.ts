import {
  canReadActivities,
  isAccessFresh,
  parseStoredStravaAccess,
  parseStravaAnswer,
  parseStravaCallback,
  STRAVA_SCOPE,
  stravaAuthorizeUrl,
  stravaCallbackRoute,
  stravaRedirectUri,
} from './strava-connection';

describe('stravaRedirectUri', () => {
  it('comes back to localhost under the app scheme', () => {
    expect(stravaRedirectUri('allrun')).toBe('allrun://localhost/strava-callback');
    expect(stravaRedirectUri('exp')).toBe('exp://localhost/strava-callback');
  });
});

describe('stravaAuthorizeUrl', () => {
  it('asks for a code with the app scopes and the state', () => {
    const url = new URL(
      stravaAuthorizeUrl({
        clientId: '296588',
        redirectUri: 'allrun://localhost/strava-callback',
        state: 'abc123',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://www.strava.com/oauth/mobile/authorize');
    expect(url.searchParams.get('client_id')).toBe('296588');
    expect(url.searchParams.get('redirect_uri')).toBe('allrun://localhost/strava-callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('approval_prompt')).toBe('auto');
    expect(url.searchParams.get('scope')).toBe(STRAVA_SCOPE);
    expect(url.searchParams.get('state')).toBe('abc123');
  });
});

describe('canReadActivities', () => {
  it.each([
    ['read,activity:read_all,profile:read_all', true],
    ['read,activity:read', true],
    ['read activity:read_all', true],
    ['read,profile:read_all', false],
    ['read,activity:write', false],
    ['', false],
  ])('%s → %s', (scope, expected) => {
    expect(canReadActivities(scope)).toBe(expected);
  });
});

describe('parseStravaCallback', () => {
  const back = 'allrun://localhost/strava-callback';

  it('takes the code and the granted scopes', () => {
    expect(
      parseStravaCallback(`${back}?state=s1&code=c0de&scope=read,activity:read_all`, 's1'),
    ).toEqual({ kind: 'code', code: 'c0de', scope: 'read,activity:read_all' });
  });

  it('refuses another state, or none expected', () => {
    expect(parseStravaCallback(`${back}?state=other&code=c0de&scope=activity:read`, 's1')).toEqual({
      kind: 'invalid',
    });
    expect(parseStravaCallback(`${back}?state=&code=c0de&scope=activity:read`, '')).toEqual({
      kind: 'invalid',
    });
  });

  it('tells a cancelled sign-in', () => {
    expect(parseStravaCallback(`${back}?state=s1&error=access_denied`, 's1')).toEqual({
      kind: 'denied',
    });
  });

  it('tells the activities unticked', () => {
    expect(parseStravaCallback(`${back}?state=s1&code=c0de&scope=read`, 's1')).toEqual({
      kind: 'missingActivityScope',
    });
  });

  it('refuses no code', () => {
    expect(parseStravaCallback(`${back}?state=s1&scope=activity:read`, 's1')).toEqual({
      kind: 'invalid',
    });
    expect(parseStravaCallback(back, 's1')).toEqual({ kind: 'invalid' });
  });

  it('ignores a fragment', () => {
    expect(parseStravaCallback(`${back}?state=s1&code=c0de&scope=activity:read#_=_`, 's1')).toEqual(
      { kind: 'code', code: 'c0de', scope: 'activity:read' },
    );
  });
});

describe('stravaCallbackRoute', () => {
  it.each([
    ['allrun://localhost/strava-callback?code=1&state=2', '/strava-callback?code=1&state=2'],
    ['/localhost/strava-callback?code=1', '/strava-callback?code=1'],
    ['localhost/strava-callback', '/strava-callback'],
  ])('routes %s', (path, route) => {
    expect(stravaCallbackRoute(path)).toBe(route);
  });

  it.each([
    'allrun://auth-callback?code=1',
    '/editor?id=localhost/strava-callback',
    'allrun://localhost/strava-callbacks',
    '/',
  ])('leaves %s as it is', (path) => {
    expect(stravaCallbackRoute(path)).toBe(path);
  });
});

describe('parseStravaAnswer', () => {
  const access = {
    accessToken: 't0k3n',
    expiresAt: 1_800_000_000_000,
    athleteName: 'Ana Ruiz',
    scope: 'read,activity:read_all',
  };

  it('reads an access token', () => {
    expect(parseStravaAnswer({ connected: true, ...access })).toEqual(access);
  });

  it('reads not connected', () => {
    expect(parseStravaAnswer({ connected: false })).toBeNull();
  });

  it('throws on anything else', () => {
    expect(() => parseStravaAnswer({ connected: true, accessToken: '' })).toThrow();
    expect(() => parseStravaAnswer({ error: 'Could not reach Strava' })).toThrow();
    expect(() => parseStravaAnswer(null)).toThrow();
  });
});

describe('parseStoredStravaAccess', () => {
  it('needs the owner', () => {
    const access = { accessToken: 't', expiresAt: 1, athleteName: '', scope: 'activity:read' };
    expect(parseStoredStravaAccess({ ...access, userId: 'u1' })).toEqual({
      ...access,
      userId: 'u1',
    });
    expect(() => parseStoredStravaAccess(access)).toThrow();
  });
});

describe('isAccessFresh', () => {
  const access = { accessToken: 't', expiresAt: 10 * 60_000, athleteName: '', scope: '' };

  it('serves until five minutes before it expires', () => {
    expect(isAccessFresh(access, 4 * 60_000)).toBe(true);
    expect(isAccessFresh(access, 5 * 60_000)).toBe(false);
    expect(isAccessFresh(access, 11 * 60_000)).toBe(false);
  });
});
