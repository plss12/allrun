import { parseStravaActivities } from './schema';

// Shape of an item from GET /athlete/activities, with fields AllRun ignores.
const stravaRun = {
  resource_state: 2,
  athlete: { id: 1, resource_state: 1 },
  name: 'Evening Run',
  distance: 10_012.4,
  moving_time: 2950,
  elapsed_time: 3020,
  total_elevation_gain: 42.1,
  type: 'Run',
  sport_type: 'Run',
  id: 15_234_567_890,
  start_date: '2026-10-14T17:31:05Z',
  start_date_local: '2026-10-14T19:31:05Z',
  timezone: '(GMT+01:00) Europe/Copenhagen',
  map: { id: 'a15234567890', summary_polyline: '_p~iF~ps|U_ulLnnqC', resource_state: 2 },
  average_speed: 3.394,
  max_speed: 4.81,
  average_cadence: 85.6,
  has_heartrate: true,
  average_heartrate: 152.3,
  max_heartrate: 176,
  elev_high: 31.4,
  elev_low: 2.2,
  kudos_count: 4,
};

describe('parseStravaActivities', () => {
  it('maps a Strava activity to the domain model', () => {
    const [activity] = parseStravaActivities([stravaRun]);
    expect(activity).toEqual({
      id: 'strava:15234567890',
      name: 'Evening Run',
      sportType: 'Run',
      sportModality: 'roadRun',
      sportFamily: 'run',
      startUtc: '2026-10-14T17:31:05Z',
      startLocal: '2026-10-14T19:31:05',
      localDate: '2026-10-14',
      distanceMeters: 10_012.4,
      movingTimeSeconds: 2950,
      elapsedTimeSeconds: 3020,
      elevationGainMeters: 42.1,
      maxElevationMeters: 31.4,
      averageSpeed: 3.394,
      maxSpeed: 4.81,
      averageHeartRate: 152.3,
      maxHeartRate: 176,
      averagePowerWatts: null,
      weightedAveragePowerWatts: null,
      averageCadence: 85.6,
      calories: null,
      routePolyline: '_p~iF~ps|U_ulLnnqC',
    });
  });

  it('uses the local date, not the UTC one, for late activities', () => {
    const [activity] = parseStravaActivities([
      {
        ...stravaRun,
        start_date: '2026-10-14T22:30:00Z',
        start_date_local: '2026-10-15T00:30:00Z',
      },
    ]);
    expect(activity.localDate).toBe('2026-10-15');
  });

  it('accepts activities without GPS, heart rate or distance', () => {
    const [gym] = parseStravaActivities([
      {
        ...stravaRun,
        sport_type: 'WeightTraining',
        distance: 0,
        average_speed: 0,
        max_speed: 0,
        map: { id: 'a1', summary_polyline: '' },
        average_heartrate: undefined,
        max_heartrate: undefined,
        average_cadence: null,
        elev_high: undefined,
      },
    ]);
    expect(gym).toMatchObject({
      sportModality: 'workout',
      sportFamily: 'training',
      routePolyline: null,
      averageSpeed: null,
      averageHeartRate: null,
      maxElevationMeters: null,
    });
  });

  it('rejects malformed payloads naming the bad field', () => {
    expect(() => parseStravaActivities([{ ...stravaRun, distance: 'far' }])).toThrow(/distance/);
    expect(() => parseStravaActivities([{ ...stravaRun, start_date: 'yesterday' }])).toThrow(
      /start_date/,
    );
    expect(() => parseStravaActivities({ activities: [] })).toThrow(/Invalid Strava/);
  });
});
