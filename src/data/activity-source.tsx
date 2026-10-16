import { createContext, type ReactNode, use, useState } from 'react';

import type { ActivitySource } from '@/sources/activity-source';
import { FixtureActivitySource } from '@/sources/fixtures/fixture-source';
import { todayLocal } from '@/ui/today';

const ActivitySourceContext = createContext<ActivitySource | null>(null);

/**
 * Provides the app's activity source. Until the Strava integration (milestone 4) it serves a
 * synthetic history ending today.
 */
export function ActivitySourceProvider({ children }: { readonly children: ReactNode }) {
  const [source] = useState<ActivitySource>(
    () => new FixtureActivitySource({ endDate: todayLocal(), days: 400, seed: 1 }),
  );
  return <ActivitySourceContext value={source}>{children}</ActivitySourceContext>;
}

/** The activity source provided by {@link ActivitySourceProvider}. */
export function useActivitySource(): ActivitySource {
  const source = use(ActivitySourceContext);
  if (source === null) {
    throw new Error('useActivitySource must be used inside <ActivitySourceProvider>');
  }
  return source;
}
