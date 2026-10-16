import { addDays, dayOfWeek, type LocalDate } from '@/core/dates';
import type { LatLng } from '@/core/geo';
import { encodePolyline } from '@/core/polyline';
import type { StravaActivity } from '@/sources/strava/schema';

/** Options of {@link generateStravaFixtures}. */
export interface FixtureOptions {
  /** Last day of the generated history (inclusive). */
  readonly endDate: LocalDate;
  /** Days of history to generate, ending on `endDate`. */
  readonly days: number;
  /** PRNG seed: the same seed always yields the same activities. */
  readonly seed?: number;
}

/**
 * Generates a synthetic training history in the shape of Strava's API, so the editor and the
 * summaries can be built and tested without a Strava subscription or real personal data.
 *
 * The week follows a typical runner's plan (easy runs, a quality session, a long run on
 * Saturdays) mixed with rides, swims, walks, hikes and gym sessions, plus random rest days.
 * Routes are synthetic loops and out-and-backs around central Copenhagen, never real tracks.
 * Local time is treated as a fixed UTC+1 for simplicity.
 *
 * Time and space: O(d + p) for d days and p route points.
 */
export function generateStravaFixtures(options: FixtureOptions): StravaActivity[] {
  if (!Number.isInteger(options.days) || options.days < 1) {
    throw new RangeError(`Invalid number of days: ${options.days}`);
  }
  const random = mulberry32(options.seed ?? 1);
  const activities: StravaActivity[] = [];
  for (let offset = options.days - 1; offset >= 0; offset--) {
    const date = addDays(options.endDate, -offset);
    // Roughly one unplanned rest day in ten (work, travel, a cold).
    if (random() < 0.1) {
      continue;
    }
    const plan = planFor(dayOfWeek(date), random);
    if (plan !== null) {
      activities.push(buildActivity(plan, date, activities.length, random));
    }
  }
  return activities;
}

type Random = () => number;

interface SessionPlan {
  readonly sportType: string;
  readonly distanceMeters: number;
  /** Average moving speed in m/s; ignored without distance. */
  readonly speed: number;
  /** Duration in seconds for sessions without distance. */
  readonly durationSeconds?: number;
  readonly hasRoute: boolean;
  readonly elevationGain: number;
}

const between = (random: Random, min: number, max: number) => min + (max - min) * random();
/** Speed in m/s for a pace given in seconds per kilometer. */
const paceSpeed = (secondsPerKm: number) => 1000 / secondsPerKm;

function planFor(weekday: number, random: Random): SessionPlan | null {
  const roll = random();
  switch (weekday) {
    case 0: // Monday: gym or rest
      return roll < 0.5 ? gym('WeightTraining', between(random, 2700, 4200)) : null;
    case 1: // Tuesday: easy run
      return run('Run', between(random, 7000, 11_000), between(random, 310, 340), random);
    case 2: // Wednesday: cross-training
      return roll < 0.6
        ? ride('Ride', between(random, 35_000, 70_000), random)
        : {
            sportType: 'Swim',
            distanceMeters: Math.round(between(random, 1500, 3000) / 50) * 50,
            speed: 100 / between(random, 110, 135),
            hasRoute: false,
            elevationGain: 0,
          };
    case 3: // Thursday: quality session, sometimes on the treadmill
      return roll < 0.2
        ? {
            ...run('VirtualRun', between(random, 8000, 11_000), between(random, 270, 295), random),
            hasRoute: false,
            elevationGain: 0,
          }
        : run('Run', between(random, 8000, 12_000), between(random, 270, 295), random);
    case 4: // Friday: walk or rest
      return roll < 0.5
        ? {
            sportType: 'Walk',
            distanceMeters: between(random, 4000, 7000),
            speed: paceSpeed(between(random, 660, 780)),
            hasRoute: true,
            elevationGain: between(random, 10, 60),
          }
        : null;
    case 5: // Saturday: long run, sometimes on trails
      return roll < 0.25
        ? {
            ...run('TrailRun', between(random, 12_000, 20_000), between(random, 390, 450), random),
            elevationGain: between(random, 300, 900),
          }
        : run('Run', between(random, 14_000, 24_000), between(random, 315, 350), random);
    default: // Sunday: long ride, hike or rest
      if (roll < 0.5) {
        return ride('Ride', between(random, 50_000, 100_000), random);
      }
      return roll < 0.65
        ? {
            sportType: 'Hike',
            distanceMeters: between(random, 8000, 15_000),
            speed: paceSpeed(between(random, 720, 900)),
            hasRoute: true,
            elevationGain: between(random, 200, 700),
          }
        : null;
  }
}

function run(
  sportType: string,
  distanceMeters: number,
  secondsPerKm: number,
  random: Random,
): SessionPlan {
  return {
    sportType,
    distanceMeters,
    speed: paceSpeed(secondsPerKm),
    hasRoute: true,
    elevationGain: between(random, 20, 120),
  };
}

function ride(sportType: string, distanceMeters: number, random: Random): SessionPlan {
  return {
    sportType,
    distanceMeters,
    speed: between(random, 26, 31) / 3.6,
    hasRoute: true,
    elevationGain: between(random, 150, 900),
  };
}

function gym(sportType: string, durationSeconds: number): SessionPlan {
  return {
    sportType,
    distanceMeters: 0,
    speed: 0,
    durationSeconds,
    hasRoute: false,
    elevationGain: 0,
  };
}

const HEART_RATE: Readonly<Record<string, readonly [number, number]>> = {
  Run: [145, 160],
  VirtualRun: [150, 165],
  TrailRun: [140, 155],
  Ride: [130, 145],
  Swim: [130, 145],
  Walk: [95, 110],
  Hike: [110, 125],
  WeightTraining: [100, 120],
};

const LABELS: Readonly<Record<string, string>> = {
  Run: 'Run',
  VirtualRun: 'Treadmill Run',
  TrailRun: 'Trail Run',
  Ride: 'Ride',
  Swim: 'Swim',
  Walk: 'Walk',
  Hike: 'Hike',
  WeightTraining: 'Weight Training',
};

function buildActivity(
  plan: SessionPlan,
  date: LocalDate,
  index: number,
  random: Random,
): StravaActivity {
  const weekend = dayOfWeek(date) >= 5;
  const hour = weekend ? Math.floor(between(random, 8, 11)) : random() < 0.5 ? 7 : 18;
  const minute = Math.floor(between(random, 0, 60));
  const local = `${date}T${pad(hour)}:${pad(minute)}:00`;
  // Fixed UTC+1: the UTC start is one hour earlier, possibly on the previous day.
  const utc = new Date(Date.parse(`${local}Z`) - 3_600_000).toISOString().replace('.000', '');

  const hasDistance = plan.distanceMeters > 0;
  const movingTime = Math.round(
    hasDistance ? plan.distanceMeters / plan.speed : (plan.durationSeconds ?? 3600),
  );
  const [minHr, maxHr] = HEART_RATE[plan.sportType] ?? [120, 140];
  const averageHeartRate = round(between(random, minHr, maxHr), 1);
  const isRide = plan.sportType === 'Ride';
  const hasPower = isRide && random() < 0.6;
  const averageWatts = hasPower ? Math.round(between(random, 170, 230)) : null;
  const elevationGain = round(plan.elevationGain, 1);
  const timeOfDay = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';

  return {
    id: 10_000_000_000 + index,
    name: `${timeOfDay} ${LABELS[plan.sportType] ?? 'Workout'}`,
    sport_type: plan.sportType,
    start_date: utc,
    start_date_local: `${local}Z`,
    distance: round(plan.distanceMeters, 1),
    moving_time: movingTime,
    elapsed_time: movingTime + Math.floor(between(random, 0, 300)),
    total_elevation_gain: elevationGain,
    elev_high: plan.hasRoute ? round(12 + elevationGain * between(random, 0.3, 0.6), 1) : null,
    average_speed: hasDistance ? round(plan.speed, 3) : 0,
    max_speed: hasDistance ? round(plan.speed * between(random, 1.25, 1.6), 3) : 0,
    average_heartrate: averageHeartRate,
    max_heartrate: Math.round(averageHeartRate + between(random, 15, 25)),
    average_watts: averageWatts,
    weighted_average_watts:
      averageWatts === null ? null : averageWatts + Math.round(between(random, 5, 15)),
    average_cadence: plan.sportType.endsWith('Run')
      ? round(between(random, 82, 90), 1)
      : isRide
        ? round(between(random, 80, 95), 1)
        : null,
    calories: Math.round(movingTime * caloriesPerSecond(plan.sportType)),
    map: {
      summary_polyline: plan.hasRoute
        ? encodePolyline(syntheticRoute(plan.distanceMeters, random))
        : '',
    },
  };
}

function caloriesPerSecond(sportType: string): number {
  switch (sportType) {
    case 'Ride':
      return 0.17;
    case 'Walk':
    case 'Hike':
      return 0.08;
    case 'WeightTraining':
      return 0.09;
    default:
      return 0.2;
  }
}

/** Central Copenhagen: an arbitrary, public base for the synthetic routes. */
const BASE: LatLng = [55.6761, 12.5683];
const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Synthetic route of the given length: a wobbly loop, or an out-and-back one time in three.
 * The shape is built in meters around a random start near {@link BASE} and then scaled so its
 * length matches `distanceMeters`.
 */
function syntheticRoute(distanceMeters: number, random: Random): LatLng[] {
  const pointCount = Math.min(300, Math.max(30, Math.round(distanceMeters / 80)));
  const offsets: [number, number][] =
    random() < 1 / 3 ? outAndBack(pointCount, random) : loop(pointCount, random);

  let length = 0;
  for (let i = 1; i < offsets.length; i++) {
    length += Math.hypot(offsets[i][0] - offsets[i - 1][0], offsets[i][1] - offsets[i - 1][1]);
  }
  const scale = distanceMeters / length;
  const startNorth = between(random, -1500, 1500);
  const startEast = between(random, -1500, 1500);
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((BASE[0] * Math.PI) / 180);
  return offsets.map(([east, north]) => [
    BASE[0] + (startNorth + north * scale) / METERS_PER_DEGREE_LAT,
    BASE[1] + (startEast + east * scale) / metersPerDegreeLng,
  ]);
}

function loop(pointCount: number, random: Random): [number, number][] {
  const stretch = between(random, 0.6, 1.4);
  const phase = between(random, 0, 2 * Math.PI);
  const points: [number, number][] = [];
  for (let i = 0; i <= pointCount; i++) {
    const angle = (2 * Math.PI * i) / pointCount;
    const radius = 1 + 0.15 * Math.sin(3 * angle + phase) + between(random, -0.02, 0.02);
    // Start and finish at the same place: the loop's point at angle 0.
    points.push([
      radius * Math.cos(angle) * stretch - stretch,
      (radius * Math.sin(angle)) / stretch,
    ]);
  }
  points[points.length - 1] = points[0];
  return points;
}

function outAndBack(pointCount: number, random: Random): [number, number][] {
  const heading = between(random, 0, 2 * Math.PI);
  const half = Math.floor(pointCount / 2);
  const out: [number, number][] = [];
  for (let i = 0; i <= half; i++) {
    const along = i / half;
    const sideways = 0.04 * Math.sin(along * 7) + between(random, -0.005, 0.005);
    out.push([
      along * Math.cos(heading) - sideways * Math.sin(heading),
      along * Math.sin(heading) + sideways * Math.cos(heading),
    ]);
  }
  return [...out, ...out.slice(0, -1).reverse()];
}

/**
 * Mulberry32: a small, fast 32-bit seeded PRNG, good enough for test data (not cryptography).
 * Source: Tommy Ettinger, public domain:
 * https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 */
function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const pad = (value: number) => String(value).padStart(2, '0');
const round = (value: number, decimals: number) =>
  Math.round(value * 10 ** decimals) / 10 ** decimals;
