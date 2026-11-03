import { phrasesFingerprint } from '@/core/phrases';

import {
  type PhrasesCopy,
  type PhrasesTable,
  phrasesTable,
  readSupabaseConfig,
  refreshedCopy,
} from './phrases-table';

const row = (extra: Record<string, unknown> = {}) => ({
  id: 'one',
  kind: 'chat',
  position: 10,
  text_es: 'Hola',
  text_en: 'Hello',
  source_es: null,
  source_en: null,
  starts_on: null,
  ends_on: null,
  active: true,
  ...extra,
});

describe('readSupabaseConfig', () => {
  it('is null when nothing is set', () => {
    expect(readSupabaseConfig({ url: undefined, publishableKey: undefined })).toBeNull();
    expect(readSupabaseConfig({ url: '', publishableKey: '' })).toBeNull();
  });

  it('reads an address and a key', () => {
    const config = { url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_x' };
    expect(readSupabaseConfig(config)).toEqual(config);
  });

  it('throws when they are set but wrong', () => {
    expect(() => readSupabaseConfig({ url: 'nope', publishableKey: 'key' })).toThrow();
    expect(() =>
      readSupabaseConfig({ url: 'https://abc.supabase.co', publishableKey: undefined }),
    ).toThrow();
  });
});

describe('phrasesTable', () => {
  const config = { url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_x' };
  const answer = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), init);

  it('sends the publishable key in the apikey header, not as a bearer token', async () => {
    const fetcher = jest.fn(async () => answer([]));
    await phrasesTable(config, fetcher as unknown as typeof fetch).rows();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('https://abc.supabase.co/rest/v1/phrases?select=');
    expect(url).toContain('order=position.asc,id.asc');
    expect(init.headers).toEqual({ apikey: 'sb_publishable_x' });
  });

  it('asks only for the latest change and the count to tell a version', async () => {
    const fetcher = jest.fn(async () =>
      answer([{ updated_at: '2026-11-03T10:00:00+00:00' }], {
        headers: { 'content-range': '0-0/68' },
      }),
    );
    const fingerprint = await phrasesTable(
      config,
      fetcher as unknown as typeof fetch,
    ).fingerprint();
    expect(fingerprint).toBe(phrasesFingerprint('2026-11-03T10:00:00+00:00', 68));
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('select=updated_at&order=updated_at.desc&limit=1');
    expect(init.headers).toEqual({ apikey: 'sb_publishable_x', Prefer: 'count=exact' });
  });

  it('reads an empty table', async () => {
    const fetcher = async () => answer([], { headers: { 'content-range': '*/0' } });
    expect(await phrasesTable(config, fetcher as unknown as typeof fetch).fingerprint()).toBe(
      phrasesFingerprint(null, 0),
    );
  });

  it('fails on an error answer, saying it', async () => {
    const fetcher = async () => answer({ message: 'no' }, { status: 401 });
    await expect(phrasesTable(config, fetcher as unknown as typeof fetch).rows()).rejects.toThrow(
      '401',
    );
  });
});

describe('refreshedCopy', () => {
  const table = (fingerprint: string, rows: unknown): PhrasesTable & { rows: jest.Mock } => ({
    fingerprint: async () => fingerprint,
    rows: jest.fn(async () => rows),
  });
  const copy: PhrasesCopy = { checkedOn: '2026-11-02', fingerprint: 'old', rows: [row()] };

  it('does nothing when it was already looked at today', async () => {
    const source = table('new', [row()]);
    expect(await refreshedCopy(copy, '2026-11-02', source, false)).toBeNull();
    expect(source.rows).not.toHaveBeenCalled();
  });

  it('looks again the same day when told to always look', async () => {
    const source = table('new', [row({ id: 'two' })]);
    const refreshed = await refreshedCopy(copy, '2026-11-02', source, true);
    expect(refreshed?.copy.fingerprint).toBe('new');
  });

  it('only remembers the day when the table did not change', async () => {
    const source = table('old', [row()]);
    expect(await refreshedCopy(copy, '2026-11-03', source, false)).toEqual({
      copy: { ...copy, checkedOn: '2026-11-03' },
      rejected: [],
    });
    expect(source.rows).not.toHaveBeenCalled();
  });

  it('downloads the rows when the table changed', async () => {
    const rows = [row({ id: 'two' })];
    expect(await refreshedCopy(copy, '2026-11-03', table('new', rows), false)).toEqual({
      copy: { checkedOn: '2026-11-03', fingerprint: 'new', rows },
      rejected: [],
    });
  });

  it('downloads the rows the first time', async () => {
    const refreshed = await refreshedCopy(null, '2026-11-03', table('new', [row()]), false);
    expect(refreshed?.copy.rows).toHaveLength(1);
  });

  it('says which rows are bad, and keeps the others', async () => {
    const rows = [row(), row({ id: 'bad', text_en: '' })];
    const refreshed = await refreshedCopy(copy, '2026-11-03', table('new', rows), false);
    expect(refreshed?.rejected).toHaveLength(1);
  });

  it('fails when every row is bad, so the copy stays as it was', async () => {
    const rows = [row({ text_en: '' })];
    await expect(refreshedCopy(copy, '2026-11-03', table('new', rows), false)).rejects.toThrow(
      'Every row',
    );
  });

  it('accepts an empty table: its lists then show the built-in phrases', async () => {
    const refreshed = await refreshedCopy(copy, '2026-11-03', table('none/0', []), false);
    expect(refreshed?.copy.rows).toEqual([]);
  });
});
