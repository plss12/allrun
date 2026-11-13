import { makeActivity } from '@/test-utils/make-activity';

import { nextPageBefore, startPages, withPage } from './activity-pages';

const run = (id: string, startUtc: string) => makeActivity({ id, startUtc });

const newest = [run('a', '2026-11-12T08:00:00Z'), run('b', '2026-11-10T08:00:00Z')];

describe('the home pages of older activities', () => {
  it('has nothing older when the newest were fewer than asked for', () => {
    expect(startPages(1, 2).status).toBe('done');
    expect(startPages(2, 2).status).toBe('idle');
  });

  it('asks from the oldest shown: the newest, then the last page', () => {
    const start = startPages(2, 2);
    expect(nextPageBefore(newest, start)).toBe('2026-11-10T08:00:00Z');
    const next = withPage(newest, start, [run('c', '2026-11-01T08:00:00Z')], 1);
    expect(nextPageBefore(newest, next)).toBe('2026-11-01T08:00:00Z');
    expect(nextPageBefore([], startPages(0, 2))).toBeNull();
  });

  it('adds a page without what is already shown, and stops at a short page', () => {
    const start = startPages(2, 2);
    const full = withPage(
      newest,
      start,
      [run('b', '2026-11-10T08:00:00Z'), run('c', '2026-11-01T08:00:00Z')],
      2,
    );
    expect(full.older.map((activity) => activity.id)).toEqual(['c']);
    expect(full.status).toBe('idle');
    const last = withPage(newest, full, [run('d', '2026-10-01T08:00:00Z')], 2);
    expect(last.older.map((activity) => activity.id)).toEqual(['c', 'd']);
    expect(last.status).toBe('done');
  });
});
