import { makeActivity } from '@/test-utils/make-activity';

import { availableMetrics, metricValue, toDisplayMetric } from './metrics';

describe('availableMetrics', () => {
  it('offers pace, not speed, for road runs, leading with distance, time and pace', () => {
    const metrics = availableMetrics(makeActivity({ sportType: 'Run' }));
    expect(metrics.slice(0, 3)).toEqual(['distance', 'movingTime', 'pace']);
    expect(metrics).not.toContain('speed');
  });

  it('puts elevation before pace on trails and hikes', () => {
    for (const sportType of ['TrailRun', 'Hike']) {
      const metrics = availableMetrics(makeActivity({ sportType }));
      expect(metrics[1]).toBe('elevationGain');
      expect(metrics.indexOf('elevationGain')).toBeLessThan(metrics.indexOf('pace'));
    }
  });

  it('leaves elevation out of treadmill runs even if the source reports some', () => {
    const metrics = availableMetrics(
      makeActivity({ sportType: 'VirtualRun', routePolyline: null, elevationGainMeters: 12 }),
    );
    expect(metrics).not.toContain('elevationGain');
    expect(metrics).not.toContain('maxElevation');
  });

  it('leads mountain bike rides with elevation', () => {
    expect(availableMetrics(makeActivity({ sportType: 'MountainBikeRide' }))[1]).toBe(
      'elevationGain',
    );
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

  const withoutDistance = {
    distanceMeters: 0,
    averageSpeed: 0,
    maxSpeed: 0,
    elevationGainMeters: 0,
    maxElevationMeters: null,
    averageCadence: null,
    routePolyline: null,
  };

  it('shows time and effort for a training session', () => {
    const gym = makeActivity({ sportType: 'WeightTraining', ...withoutDistance });
    expect(availableMetrics(gym)).toEqual([
      'movingTime',
      'averageHeartRate',
      'maxHeartRate',
      'calories',
      'elapsedTime',
    ]);
  });

  it('shows only what a generic activity has (climbing without distance)', () => {
    const climb = makeActivity({ sportType: 'RockClimbing', ...withoutDistance });
    expect(availableMetrics(climb)).toEqual([
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
