import type { StravaZones } from '@/sources/strava/zones';

/** Maximum heart rate of the synthetic athlete. */
const MAX_HEART_RATE = 187;

/** Where each zone starts, as a share of the maximum heart rate (the usual five-zone model). */
const ZONE_STARTS = [0.6, 0.7, 0.8, 0.9] as const;

/**
 * The synthetic athlete's zones, in the shape of Strava's `GET /athlete/zones`: five heart rate
 * zones from a maximum of 187 bpm (<112, 112–130, 131–149, 150–167, 168+), the last without a
 * top (`-1`).
 */
export function generateStravaZones(): StravaZones {
  const starts = [0, ...ZONE_STARTS.map((share) => Math.round(MAX_HEART_RATE * share))];
  return {
    heart_rate: {
      custom_zones: false,
      zones: starts.map((min, i) => ({ min, max: starts[i + 1] ?? -1 })),
    },
  };
}
