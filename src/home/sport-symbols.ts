import type { SFSymbol } from 'sf-symbols-typescript';

import type { SummaryPage } from '@/core/summary';

/** Icon of each sport (and of all of them) in the interface: SF Symbol on iOS, Material on Android. */
export const SPORT_SYMBOLS = {
  all: { ios: 'square.grid.2x2', android: 'apps' },
  run: { ios: 'figure.run', android: 'directions_run' },
  ride: { ios: 'bicycle', android: 'directions_bike' },
  walk: { ios: 'figure.walk', android: 'directions_walk' },
  swim: { ios: 'figure.pool.swim', android: 'pool' },
  training: { ios: 'dumbbell.fill', android: 'fitness_center' },
  other: { ios: 'figure.mixed.cardio', android: 'sports' },
} as const satisfies Readonly<
  Record<SummaryPage, { readonly ios: SFSymbol; readonly android: string }>
>;
