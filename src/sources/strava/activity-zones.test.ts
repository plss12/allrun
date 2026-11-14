import { parseStravaActivityZones } from './activity-zones';

const buckets = (starts: readonly number[], seconds = 60) =>
  starts.map((min, i) => ({ min, max: starts[i + 1] ?? -1, time: seconds * (i + 1) }));

describe('parseStravaActivityZones', () => {
  it("maps a run's six pace zones, slowest first, the last without a top", () => {
    const zones = parseStravaActivityZones([
      { type: 'heartrate', distribution_buckets: buckets([0, 120, 140]) },
      // Strava may list them in any order: they are sorted by where they start.
      {
        type: 'pace',
        distribution_buckets: [...buckets([0, 2.6, 3.1, 3.45, 3.7, 3.95])].reverse(),
      },
    ]);
    expect(zones.pace?.zones.map((zone) => zone.min)).toEqual([0, 2.6, 3.1, 3.45, 3.7, 3.95]);
    expect(zones.pace?.zones[5].max).toBeNull();
    expect(zones.pace?.seconds).toEqual([60, 120, 180, 240, 300, 360]);
    expect(zones.power).toBeNull();
  });

  it('maps the heart rate zones as Strava wrote them, a beat apart', () => {
    const zones = parseStravaActivityZones([
      {
        type: 'heartrate',
        distribution_buckets: [
          { min: 0, max: 143, time: 247 },
          { min: 144, max: 162, time: 1800 },
          { min: 163, max: -1, time: 608 },
        ],
      },
    ]);
    expect(zones.heartRate).toEqual({
      zones: [
        { min: 0, max: 143 },
        { min: 144, max: 162 },
        { min: 163, max: null },
      ],
      seconds: [247, 1800, 608],
    });
  });

  it("keeps a ride's seven power zones, but not a run's histogram of 50 W", () => {
    const ride = parseStravaActivityZones([
      { type: 'power', distribution_buckets: buckets([0, 138, 188, 225, 263, 300, 375]) },
    ]);
    expect(ride.power?.zones).toHaveLength(7);
    const run = parseStravaActivityZones([
      {
        type: 'power',
        distribution_buckets: buckets(Array.from({ length: 10 }, (_, i) => i * 50)),
      },
    ]);
    expect(run.power).toBeNull();
  });

  it('has no zones of a measure with fewer than two buckets, or none at all', () => {
    expect(parseStravaActivityZones([])).toEqual({ heartRate: null, pace: null, power: null });
    expect(
      parseStravaActivityZones([{ type: 'pace', distribution_buckets: buckets([0]) }]).pace,
    ).toBeNull();
    expect(
      parseStravaActivityZones([{ type: 'pace', distribution_buckets: null }]).pace,
    ).toBeNull();
  });

  it("refuses what isn't Strava's zones, or zones that don't rise", () => {
    expect(() => parseStravaActivityZones({ type: 'pace' })).toThrow(/Invalid Strava/);
    expect(() =>
      parseStravaActivityZones([{ type: 'pace', distribution_buckets: buckets([0, 3, 3]) }]),
    ).toThrow(/zone 3 starts at or under zone 2/);
  });
});
