import { makeActivity } from '@/test-utils/make-activity';

import { availableMetrics, metricValue, toDisplayMetric } from './metrics';

describe('availableMetrics', () => {
  it('offers pace, not speed, for runs', () => {
    const metrics = availableMetrics(makeActivity({ sportType: 'TrailRun' }));
    expect(metrics).toContain('pace');
    expect(metrics).not.toContain('speed');
    expect(metrics[0]).toBe('distance');
  });

  it('offers speed and power for rides with a power meter', () => {
    const metrics = availableMetrics(
      makeActivity({ sportType: 'Ride', averagePowerWatts: 210, weightedAveragePowerWatts: 225 }),
    );
    expect(metrics).toEqual(
      expect.arrayContaining(['speed', 'averagePower', 'weightedAveragePower']),
    );
    expect(metrics).not.toContain('pace');
  });

  it('offers pace per 100 m for swims', () => {
    const metrics = availableMetrics(makeActivity({ sportType: 'Swim', routePolyline: null }));
    expect(metrics).toContain('swimPace');
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

  it('shows only what a generic activity has (gym session without distance)', () => {
    const gym = makeActivity({
      sportType: 'WeightTraining',
      distanceMeters: 0,
      averageSpeed: 0,
      maxSpeed: 0,
      elevationGainMeters: 0,
      maxElevationMeters: null,
      averageCadence: null,
      routePolyline: null,
    });
    expect(availableMetrics(gym)).toEqual([
      'movingTime',
      'elapsedTime',
      'averageHeartRate',
      'maxHeartRate',
      'calories',
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
  const metric = { unit: 'km', sportGroup: 'run' } as const;
  const imperial = { unit: 'mi', sportGroup: 'run' } as const;

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
    expect(toDisplayMetric('swimPace', 100 / 105, { unit: 'km', sportGroup: 'swim' })).toEqual({
      kind: 'time',
      text: '1:45',
      unit: 'min/100m',
    });
  });

  it('rejects a pace without speed', () => {
    expect(() => toDisplayMetric('pace', 0, metric)).toThrow(RangeError);
  });

  it('converts speed and elevation to imperial units', () => {
    expect(toDisplayMetric('speed', 10, { unit: 'km', sportGroup: 'ride' })).toMatchObject({
      amount: 36,
      unit: 'km/h',
    });
    expect(
      toDisplayMetric('speed', 1609.344 / 3600, { unit: 'mi', sportGroup: 'ride' }),
    ).toMatchObject({ amount: 1, unit: 'mph' });
    expect(toDisplayMetric('elevationGain', 100, imperial)).toMatchObject({ unit: 'ft' });
  });

  it('shows running cadence in steps per minute and cycling cadence in rpm', () => {
    expect(toDisplayMetric('averageCadence', 86, metric)).toMatchObject({
      amount: 172,
      unit: 'spm',
    });
    expect(toDisplayMetric('averageCadence', 88, { unit: 'km', sportGroup: 'ride' })).toMatchObject(
      {
        amount: 88,
        unit: 'rpm',
      },
    );
  });

  it('formats durations without a unit', () => {
    expect(toDisplayMetric('movingTime', 5025, metric)).toEqual({
      kind: 'time',
      text: '1:23:45',
      unit: null,
    });
  });
});
