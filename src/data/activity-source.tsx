import { createContext, type ReactNode, use, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import type { ActivitySource } from '@/sources/activity-source';
import { FixtureActivitySource } from '@/sources/fixtures/fixture-source';
import { PrivateRoutesSource } from '@/sources/private-routes-source';
import { stravaApi } from '@/sources/strava/api';
import { StravaActivitySource } from '@/sources/strava/strava-source';
import { logError } from '@/ui/log';
import { todayLocal } from '@/ui/today';

import { useAuth } from './auth';
import { useProfile } from './profile';
import { stravaAccessToken, useStrava } from './strava';
import { stravaCacheStore } from './strava-cache-store';

/**
 * Whether the activities come from Strava (ADR 020). A development build can use the synthetic
 * history instead, without connecting Strava, with `EXPO_PUBLIC_ACTIVITY_SOURCE=fixtures`; a
 * release build always uses Strava.
 */
export function usesStrava(): boolean {
  return !(__DEV__ && process.env.EXPO_PUBLIC_ACTIVITY_SOURCE === 'fixtures');
}

/** The source and what its activities depend on, so that loads redo when it changes. */
interface ProvidedSource {
  readonly source: ActivitySource;
  readonly key: string;
  /** Pulled to refresh: asks the source again (see `usePullToRefresh`). */
  readonly pull: () => Promise<void>;
}

const ActivitySourceContext = createContext<ProvidedSource | null>(null);

/** The account's Strava (ADR 020), or the synthetic history ending today in development. */
function makeSource(): StravaActivitySource | FixtureActivitySource {
  if (!usesStrava()) {
    return new FixtureActivitySource({ endDate: todayLocal(), days: 400, seed: 1 });
  }
  return new StravaActivitySource({
    api: stravaApi(stravaAccessToken),
    store: stravaCacheStore,
    today: todayLocal,
    onError: logError,
  });
}

/**
 * Provides the app's activity source, with the ends of every route hidden as the profile says
 * (ADR 019): the user's Strava, which asks for the newest activities
 * again when the app comes back to the front and, when they changed, makes every load redo.
 */
export function ActivitySourceProvider({ children }: { readonly children: ReactNode }) {
  const auth = useAuth();
  const strava = useStrava();
  // A new source, with nothing in memory, for each account and each time Strava is connected:
  // what the last one kept is another connection's.
  const owner =
    auth.status !== 'signedIn'
      ? 'none'
      : `${auth.userId}-${strava.status === 'connected' ? 'strava' : 'no-strava'}`;
  const { source: base } = useMemo(() => ({ owner, source: makeSource() }), [owner]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!(base instanceof StravaActivitySource)) {
      return;
    }
    const unsubscribe = base.onChange(() => setRevision((before) => before + 1));
    const listening = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        base.refresh();
      }
    });
    return () => {
      unsubscribe();
      listening.remove();
    };
  }, [base]);
  const { routePrivacyMeters } = useProfile();
  const provided = useMemo(
    (): ProvidedSource => ({
      source: routePrivacyMeters === 0 ? base : new PrivateRoutesSource(base, routePrivacyMeters),
      key: `${owner}-${revision}-routes-${routePrivacyMeters}`,
      // The synthetic history has nothing to ask again.
      pull: base instanceof StravaActivitySource ? () => base.pull() : () => Promise.resolve(),
    }),
    [owner, base, revision, routePrivacyMeters],
  );
  return <ActivitySourceContext value={provided}>{children}</ActivitySourceContext>;
}

function useProvided(): ProvidedSource {
  const provided = use(ActivitySourceContext);
  if (provided === null) {
    throw new Error('useActivitySource must be used inside <ActivitySourceProvider>');
  }
  return provided;
}

/** The activity source provided by {@link ActivitySourceProvider}. */
export function useActivitySource(): ActivitySource {
  return useProvided().source;
}

/**
 * What pulling a list to refresh does: asks Strava again for the newest activities and the
 * athlete's profile and zones, not sooner than a while after the last time (see
 * `StravaActivitySource.pull`); resolves once done, and what changed loads again by itself.
 */
export function usePullToRefresh(): () => Promise<void> {
  return useProvided().pull;
}

/**
 * What the source's activities depend on (the profile's hidden distance), to add to the key of a
 * load from it (`useAsync`), which then loads again when that changes.
 */
export function useActivitySourceKey(): string {
  return useProvided().key;
}
