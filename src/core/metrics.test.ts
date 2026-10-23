import { makeActivity } from '@/test-utils/make-activity';

import {
  availableMetrics,
  cardMetrics,
  metricValue,
  toDisplayMetric,
  withPaceMarks,
} from './metrics';

describe('availableMetrics', () => {
  // Every sport leads with what matters most for it, the same in every widget: the rest follows
  // in a common tail, and the second readings of a datum (highest, weighted, elapsed) close it.
  it('orders runs by distance, pace, time, elevation and heart rate', () => {
    for (const sportType of ['Run', 'TrailRun']) {
      expect(availableMetrics(makeActivity({ sportType }))).toEqual([
        'distance',
        'pace',
        'movingTime',
        'elevationGain',
        'averageHeartRate',
        'calories',
        'averageCadence',
        'maxElevation',
        'maxHeartRate',
        'elapsedTime',
      ]);
    }
    expect(availableMetrics(makeActivity({ sportType: 'Run' }))).not.toContain('speed');
  });

  it('leaves elevation out of treadmill runs even if the source reports some', () => {
    const metrics = availableMetrics(
      makeActivity({ sportType: 'VirtualRun', routePolyline: null, elevationGainMeters: 12 }),
    );
    expect(metrics).not.toContain('elevationGain');
    expect(metrics).not.toContain('maxElevation');
  });

  it('orders rides by distance, speed, time, elevation, power and heart rate', () => {
    const power = { averagePowerWatts: 210, weightedAveragePowerWatts: 225 };
    for (const sportType of ['Ride', 'MountainBikeRide', 'GravelRide']) {
      expect(availableMetrics(makeActivity({ sportType, ...power }))).toEqual([
        'distance',
        'speed',
        'movingTime',
        'elevationGain',
        'averagePower',
        'averageHeartRate',
        'calories',
        'averageCadence',
        'maxElevation',
        'weightedAveragePower',
        'maxHeartRate',
        'elapsedTime',
      ]);
    }
    const indoor = availableMetrics(makeActivity({ sportType: 'VirtualRide', ...power }));
    expect(indoor.slice(0, 6)).toEqual([
      'distance',
      'speed',
      'movingTime',
      'elevationGain',
      'averagePower',
      'averageHeartRate',
    ]);
    expect(indoor).not.toContain('pace');
  });

  it('orders walks by distance, time and elevation, with the pace after them', () => {
    for (const sportType of ['Walk', 'Hike']) {
      expect(availableMetrics(makeActivity({ sportType })).slice(0, 5)).toEqual([
        'distance',
        'movingTime',
        'elevationGain',
        'pace',
        'averageHeartRate',
      ]);
    }
  });

  it('orders swims by distance, pace per 100 m, time and heart rate', () => {
    const metrics = availableMetrics(makeActivity({ sportType: 'Swim', routePolyline: null }));
    expect(metrics.slice(0, 4)).toEqual(['distance', 'swimPace', 'movingTime', 'averageHeartRate']);
    expect(metrics).not.toContain('pace');
  });

  it('drops missing and zero values', () => {
    const metrics = availableMetrics(
      makeActivity({ averageHeartRate: null, maxHeartRate: null, elevationGainMeters: 0 }),
    );
    expect(metrics).not.toContain('averageHeartRate');
    expect(metrics).not.toContain('maxHeartRate');
    expect(metrics).not.toContain('elevationGain');
  });

  const withoutDistance = {
    distanceMeters: 0,
    averageSpeed: 0,
    maxSpeed: 0,
    elevationGainMeters: 0,
    maxElevationMeters: null,
    averageCadence: null,
    routePolyline: null,
  };

  it('orders a training session by time, heart rate and calories', () => {
    const gym = makeActivity({ sportType: 'WeightTraining', ...withoutDistance });
    expect(availableMetrics(gym)).toEqual([
      'movingTime',
      'averageHeartRate',
      'calories',
      'maxHeartRate',
      'elapsedTime',
    ]);
  });

  it('shows only what a generic activity has, in the order of a training session', () => {
    const climb = makeActivity({ sportType: 'RockClimbing', ...withoutDistance });
    expect(availableMetrics(climb)).toEqual([
      'movingTime',
      'averageHeartRate',
      'calories',
      'maxHeartRate',
      'elapsedTime',
    ]);
    const kayak = makeActivity({ sportType: 'Kayaking' });
    expect(availableMetrics(kayak).slice(0, 4)).toEqual([
      'movingTime',
      'averageHeartRate',
      'calories',
      'distance',
    ]);
  });
});

describe('metricValue', () => {
  it('returns the raw SI value, with speed behind every pace metric', () => {
    const activity = makeActivity();
    expect(metricValue(activity, 'distance')).toBe(10_000);
    expect(metricValue(activity, 'pace')).toBe(metricValue(activity, 'speed'));
    expect(metricValue(activity, 'averagePower')).toBeNull();
  });
});

describe('toDisplayMetric', () => {
  const metric = { unit: 'km', sportFamily: 'run' } as const;
  const imperial = { unit: 'mi', sportFamily: 'run' } as const;

  it('converts distance', () => {
    expect(toDisplayMetric('distance', 21_097.5, metric)).toEqual({
      kind: 'number',
      amount: 21.0975,
      fractionDigits: 2,
      unit: 'km',
    });
    expect(toDisplayMetric('distance', 1609.344, imperial)).toMatchObject({
      amount: 1,
      unit: 'mi',
    });
  });

  it('formats paces as time per unit', () => {
    expect(toDisplayMetric('pace', 1000 / 275, metric)).toEqual({
      kind: 'time',
      text: '4:35',
      unit: 'min/km',
    });
    expect(toDisplayMetric('swimPace', 100 / 105, { unit: 'km', sportFamily: 'swim' })).toEqual({
      kind: 'time',
      text: '1:45',
      unit: 'min/100m',
    });
  });

  it('rejects a pace without speed', () => {
    expect(() => toDisplayMetric('pace', 0, metric)).toThrow(RangeError);
  });

  it('converts speed and elevation to imperial units', () => {
    expect(toDisplayMetric('speed', 10, { unit: 'km', sportFamily: 'ride' })).toMatchObject({
      amount: 36,
      unit: 'km/h',
    });
    expect(
      toDisplayMetric('speed', 1609.344 / 3600, { unit: 'mi', sportFamily: 'ride' }),
    ).toMatchObject({ amount: 1, unit: 'mph' });
    expect(toDisplayMetric('elevationGain', 100, imperial)).toMatchObject({ unit: 'ft' });
  });

  it('shows running cadence in steps per minute and cycling cadence in rpm', () => {
    expect(toDisplayMetric('averageCadence', 86, metric)).toMatchObject({
      amount: 172,
      unit: 'spm',
    });
    expect(
      toDisplayMetric('averageCadence', 88, { unit: 'km', sportFamily: 'ride' }),
    ).toMatchObject({
      amount: 88,
      unit: 'rpm',
    });
  });

  it('formats durations without a unit', () => {
    expect(toDisplayMetric('movingTime', 5025, metric)).toEqual({
      kind: 'time',
      text: '1:23:45',
      unit: null,
    });
  });
});

describe('withPaceMarks', () => {
  const context = { unit: 'km', sportFamily: 'run' } as const;

  it('writes a pace as 5\'28" and leaves "min" out of its unit', () => {
    expect(withPaceMarks(toDisplayMetric('pace', 1000 / 328, context))).toEqual({
      kind: 'time',
      text: `5'28"`,
      unit: '/km',
    });
    expect(
      withPaceMarks(toDisplayMetric('swimPace', 100 / 105, { ...context, unit: 'mi' })),
    ).toMatchObject({ unit: '/100yd' });
    expect(
      withPaceMarks(toDisplayMetric('pace', 1000 / 328, { ...context, unit: 'mi' })),
    ).toMatchObject({ unit: '/mi' });
  });

  it('keeps the hours of a pace of an hour or more', () => {
    expect(withPaceMarks(toDisplayMetric('pace', 1000 / 3930, context))).toMatchObject({
      text: `1h 05'30"`,
    });
  });

  it('leaves anything that is not a pace as it is', () => {
    for (const display of [
      toDisplayMetric('movingTime', 3000, context),
      toDisplayMetric('distance', 10_000, context),
      toDisplayMetric('speed', 5, context),
    ]) {
      expect(withPaceMarks(display)).toBe(display);
    }
  });
});

describe('cardMetrics', () => {
  it("shows the first three data of the sport's order", () => {
    expect(cardMetrics(makeActivity({ sportType: 'Run' }))).toEqual([
      'distance',
      'pace',
      'movingTime',
    ]);
    expect(cardMetrics(makeActivity({ sportType: 'Hike' }))).toEqual([
      'distance',
      'movingTime',
      'elevationGain',
    ]);
    expect(cardMetrics(makeActivity({ sportType: 'Ride' }))).toEqual([
      'distance',
      'speed',
      'movingTime',
    ]);
    expect(cardMetrics(makeActivity({ sportType: 'Swim' }))).toEqual([
      'distance',
      'swimPace',
      'movingTime',
    ]);
    expect(cardMetrics(makeActivity({ sportType: 'Kayaking' }))).toEqual([
      'movingTime',
      'averageHeartRate',
      'calories',
    ]);
  });

  it('shows the time, heart rate and calories without a distance', () => {
    const run = makeActivity({
      sportType: 'Run',
      distanceMeters: 0,
      averageSpeed: null,
      elevationGainMeters: 40,
    });
    expect(cardMetrics(run)).toEqual(['movingTime', 'averageHeartRate', 'calories']);
  });

  it('makes up missing data without repeating the time or the heart rate', () => {
    const climb = makeActivity({
      sportType: 'RockClimbing',
      distanceMeters: 0,
      averageSpeed: null,
      elevationGainMeters: 120,
      averageHeartRate: null,
      maxHeartRate: null,
      calories: 400,
    });
    expect(cardMetrics(climb)).toEqual(['movingTime', 'calories', 'elevationGain']);
  });

  it('makes up how fast with the next datum when the activity has no speed', () => {
    expect(cardMetrics(makeActivity({ sportType: 'Run', averageSpeed: null }))).toEqual([
      'distance',
      'movingTime',
      'elevationGain',
    ]);
  });
});
