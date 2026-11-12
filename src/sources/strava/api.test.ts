import { StravaNotConnectedError, StravaRateLimitError, stravaApi } from './api';

function answer(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('stravaApi', () => {
  it('calls Strava with the token and the query', async () => {
    const send = jest.fn(async () => answer(200, [{ id: 1 }]));
    const api = stravaApi(async () => 't0k3n', send);
    expect(await api.get('/athlete/activities', { per_page: 50, page: 1 })).toEqual([{ id: 1 }]);
    expect(send).toHaveBeenCalledWith(
      'https://www.strava.com/api/v3/athlete/activities?per_page=50&page=1',
      { headers: { Authorization: 'Bearer t0k3n', Accept: 'application/json' } },
    );
  });

  it('after a 401 asks for a new token once and tries again', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce(answer(401))
      .mockResolvedValueOnce(answer(200, { ok: true }));
    const token = jest.fn(async (rejected?: string) => (rejected === 'old' ? 'new' : 'old'));
    const api = stravaApi(token, send);
    expect(await api.get('/athlete/zones')).toEqual({ ok: true });
    expect(token).toHaveBeenLastCalledWith('old');
    expect(send).toHaveBeenLastCalledWith(expect.any(String), {
      headers: { Authorization: 'Bearer new', Accept: 'application/json' },
    });
  });

  it('is not connected without a token, or when none is given after a 401', async () => {
    await expect(stravaApi(async () => null, jest.fn()).get('/x')).rejects.toBeInstanceOf(
      StravaNotConnectedError,
    );
    const token = jest.fn(async (rejected?: string) => (rejected === undefined ? 'old' : null));
    await expect(
      stravaApi(
        token,
        jest.fn(async () => answer(401)),
      ).get('/x'),
    ).rejects.toBeInstanceOf(StravaNotConnectedError);
  });

  it('gives null for the statuses that mean none', async () => {
    const api = stravaApi(
      async () => 't',
      jest.fn(async () => answer(403)),
    );
    expect(await api.get('/athlete/zones', {}, { absentOn: [403] })).toBeNull();
    const missing = stravaApi(
      async () => 't',
      jest.fn(async () => answer(404)),
    );
    expect(await missing.get('/activities/1')).toBeNull();
  });

  it('tells the rate limit, with its usage', async () => {
    const api = stravaApi(
      async () => 't',
      jest.fn(async () => answer(429, {}, { 'X-ReadRateLimit-Usage': '101,950' })),
    );
    await expect(api.get('/x')).rejects.toThrow(new StravaRateLimitError('101,950'));
  });

  it('fails on any other error', async () => {
    const api = stravaApi(
      async () => 't',
      jest.fn(async () => answer(500)),
    );
    await expect(api.get('/athlete/activities')).rejects.toThrow(
      'Strava answered 500 to GET /athlete/activities',
    );
  });
});
