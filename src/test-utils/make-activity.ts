import type { Activity } from '@/core/activity';
import { sportGroupOf } from '@/core/sports';

let nextId = 1;

/**
 * Builds a test activity: a 10 km run at 5:00/km on the given local date, at 08:00 UTC.
 * Override any field; `sportGroup` follows `sportType` unless set explicitly.
 */
export function makeActivity(overrides: Partial<Activity> = {}): Activity {
  const localDate = overrides.localDate ?? '2026-10-14';
  const sportType = overrides.sportType ?? 'Run';
  return {
    id: `test:${nextId++}`,
    name: 'Morning Run',
    sportType,
    sportGroup: sportGroupOf(sportType),
    startUtc: `${localDate}T08:00:00Z`,
    startLocal: `${localDate}T10:00:00`,
    localDate,
    distanceMeters: 10_000,
    movingTimeSeconds: 3000,
    elapsedTimeSeconds: 3100,
    elevationGainMeters: 50,
    maxElevationMeters: 30,
    averageSpeed: 10_000 / 3000,
    maxSpeed: 5,
    averageHeartRate: 150,
    maxHeartRate: 172,
    averagePowerWatts: null,
    weightedAveragePowerWatts: null,
    averageCadence: 86,
    calories: 650,
    routePolyline: '_p~iF~ps|U_ulLnnqC',
    ...overrides,
  };
}
