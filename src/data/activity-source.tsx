import { createContext, type ReactNode, use, useMemo, useState } from 'react';

import type { ActivitySource } from '@/sources/activity-source';
import { FixtureActivitySource } from '@/sources/fixtures/fixture-source';
import { PrivateRoutesSource } from '@/sources/private-routes-source';
import { todayLocal } from '@/ui/today';

import { useProfile } from './profile';

/** The source and what its activities depend on, so that loads redo when it changes. */
interface ProvidedSource {
  readonly source: ActivitySource;
  readonly key: string;
}

const ActivitySourceContext = createContext<ProvidedSource | null>(null);

/**
 * Provides the app's activity source, with the ends of every route hidden as the profile says
 * (ADR 019). Until the Strava integration (milestone 4) it serves a synthetic history ending today.
 */
export function ActivitySourceProvider({ children }: { readonly children: ReactNode }) {
  const [base] = useState<ActivitySource>(
    () => new FixtureActivitySource({ endDate: todayLocal(), days: 400, seed: 1 }),
  );
  const { routePrivacyMeters } = useProfile();
  const provided = useMemo(
    (): ProvidedSource => ({
      source: routePrivacyMeters === 0 ? base : new PrivateRoutesSource(base, routePrivacyMeters),
      key: `routes-${routePrivacyMeters}`,
    }),
    [base, routePrivacyMeters],
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
 * What the source's activities depend on (the profile's hidden distance), to add to the key of a
 * load from it (`useAsync`), which then loads again when that changes.
 */
export function useActivitySourceKey(): string {
  return useProvided().key;
}
