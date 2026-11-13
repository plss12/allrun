import type { Activity } from './activity';

/**
 * Activities the home asks for each time its list nears the end: Strava's largest page, so that
 * scrolling far takes as few of the app's limited requests as can be (ADR 020).
 */
export const OLDER_PAGE = 200;

/**
 * The home's list past its newest activities, a page at a time (newest first): what it shows,
 * whether it is asking for more, failed to, or has reached the athlete's first activity.
 */
export interface OlderPages {
  readonly older: readonly Activity[];
  readonly status: 'idle' | 'loading' | 'error' | 'done';
}

/** Before asking for any: with fewer newest than asked for, there is nothing older. */
export function startPages(newestCount: number, asked: number): OlderPages {
  return { older: [], status: newestCount < asked ? 'done' : 'idle' };
}

/**
 * Where the next page starts: the start of the oldest activity shown, newest or older; `null`
 * with none shown. Time O(1).
 */
export function nextPageBefore(newest: readonly Activity[], pages: OlderPages): string | null {
  const shown = pages.older.length > 0 ? pages.older : newest;
  return shown.length === 0 ? null : shown[shown.length - 1].startUtc;
}

/**
 * The pages with one more, `asked` long at most: activities already shown are left out (one
 * that starts in the same second as the oldest shown can come again), and a short page is the
 * last. Time O(n + p) for n shown and p in the page, space O(n + p).
 */
export function withPage(
  newest: readonly Activity[],
  pages: OlderPages,
  page: readonly Activity[],
  asked: number,
): OlderPages {
  const shown = new Set([...newest, ...pages.older].map((activity) => activity.id));
  return {
    older: [...pages.older, ...page.filter((activity) => !shown.has(activity.id))],
    status: page.length < asked ? 'done' : 'idle',
  };
}
