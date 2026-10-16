/** English strings; the source of truth for translation keys. */
export const en = {
  app: {
    name: 'AllRun',
  },
  home: {
    title: 'Your activities',
  },
  metrics: {
    distance: 'Distance',
    movingTime: 'Time',
    elapsedTime: 'Elapsed time',
    pace: 'Pace',
    swimPace: 'Pace',
    speed: 'Speed',
    elevationGain: 'Elevation gain',
    maxElevation: 'Max elevation',
    averageHeartRate: 'Avg heart rate',
    maxHeartRate: 'Max heart rate',
    averagePower: 'Avg power',
    weightedAveragePower: 'Weighted power',
    averageCadence: 'Cadence',
    calories: 'Calories',
  },
  summaryMetrics: {
    totalDistance: 'Distance',
    totalMovingTime: 'Time',
    activityCount: 'Activities',
    totalElevationGain: 'Elevation gain',
    averagePace: 'Avg pace',
    longestDistance: 'Longest',
  },
  modalities: {
    roadRun: 'Run',
    trailRun: 'Trail run',
    treadmillRun: 'Treadmill run',
    walk: 'Walk',
    hike: 'Hike',
    roadRide: 'Road ride',
    mountainBikeRide: 'Mountain bike',
    gravelRide: 'Gravel ride',
    eBikeRide: 'E-bike ride',
    indoorRide: 'Indoor ride',
    swim: 'Swim',
    other: 'Workout',
  },
  families: {
    run: 'Running',
    ride: 'Cycling',
    walk: 'Walking and hiking',
    swim: 'Swimming',
    other: 'Other',
  },
  formats: {
    story: 'Story 9:16',
    portrait: 'Portrait 4:5',
    square: 'Square 1:1',
  },
};

type Strings<T> = { readonly [K in keyof T]: T[K] extends string ? string : Strings<T[K]> };

/** Shape every language must match, checked by the compiler. */
export type Translations = Strings<typeof en>;
