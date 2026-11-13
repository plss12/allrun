import { useRef, useState } from 'react';

import type { Activity } from '@/core/activity';
import {
  nextPageBefore,
  OLDER_PAGE,
  type OlderPages,
  startPages,
  withPage,
} from '@/core/activity-pages';
import type { ActivitySource } from '@/sources/activity-source';
import { logError } from '@/ui/log';

/**
 * The home's activities past its `newest` (`asked` were asked for), a page at a time from
 * `loadMore`, which the list calls as it nears its end. They start again with no pages when `key`
 * changes (new activities, another account or privacy trim): they follow on from the newest.
 */
export function useOlderActivities(
  source: ActivitySource,
  key: string,
  newest: readonly Activity[],
  asked: number,
): OlderPages & { readonly loadMore: () => void } {
  const [kept, setKept] = useState<{ readonly key: string; readonly pages: OlderPages } | null>(
    null,
  );
  // The list may say it nears its end twice before the first page shows: one request.
  const asking = useRef<string | null>(null);
  const pages = kept !== null && kept.key === key ? kept.pages : startPages(newest.length, asked);
  const loadMore = () => {
    if (asking.current === key || pages.status === 'loading' || pages.status === 'done') {
      return;
    }
    const before = nextPageBefore(newest, pages);
    if (before === null) {
      return;
    }
    asking.current = key;
    setKept({ key, pages: { ...pages, status: 'loading' } });
    const settle = (next: (now: OlderPages) => OlderPages) => {
      if (asking.current === key) {
        asking.current = null;
      }
      setKept((now) => (now === null || now.key !== key ? now : { key, pages: next(now.pages) }));
    };
    source.listBefore(before, OLDER_PAGE).then(
      (page) => settle((now) => withPage(newest, now, page, OLDER_PAGE)),
      (error: unknown) => {
        logError('Could not load the older activities', error);
        settle((now) => ({ ...now, status: 'error' }));
      },
    );
  };
  return { ...pages, loadMore };
}
