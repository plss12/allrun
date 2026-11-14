import { parseStravaDetail } from './detail';

const streams = {
  time: { data: [0, 1, 2] },
  distance: { data: [0, 3.1, 6.3] },
  heartrate: { data: [120, null, 124] },
  cadence: { data: [84, 86.5, null] },
  moving: { data: [true, false, null] },
};
const splits = {
  splits_metric: [
    {
      distance: 1000,
      moving_time: 300,
      elevation_difference: 4.2,
      average_speed: 3.33,
      average_heartrate: 151.4,
    },
    { distance: 1000, moving_time: 310, elevation_difference: null, average_speed: 3.22 },
  ],
  splits_standard: null,
  laps: [
    { distance: 2000, moving_time: 610, average_speed: 3.28, average_heartrate: 160.2 },
    { distance: 400.5, moving_time: 180, average_speed: 2.225 },
  ],
};

describe('best efforts', () => {
  const efforts = (bestEfforts: unknown[]) =>
    parseStravaDetail(null, { ...splits, best_efforts: bestEfforts }).bestEfforts;

  it("knows each distance by Strava's name, however long it measured, shortest first", () => {
    expect(
      efforts([
        { name: '10 mile', distance: 16_090, elapsed_time: 4800, pr_rank: 1 },
        { name: 'Half-Marathon', distance: 21_100, elapsed_time: 6400, pr_rank: null },
        { name: '1/2 mile', distance: 805, elapsed_time: 190 },
        { name: 'Marathon', distance: 42_195, elapsed_time: 14_000, pr_rank: 4 },
      ]),
    ).toEqual([
      { distance: 'halfMile', distanceMeters: 805, elapsedTimeSeconds: 190, prRank: null },
      { distance: 'tenMiles', distanceMeters: 16_090, elapsedTimeSeconds: 4800, prRank: 1 },
      { distance: 'half', distanceMeters: 21_100, elapsedTimeSeconds: 6400, prRank: null },
      // Only the athlete's first three count as records.
      { distance: 'marathon', distanceMeters: 42_195, elapsedTimeSeconds: 14_000, prRank: null },
    ]);
  });

  it('knows one without a name by its length, within 1 %, and none that is no standard one', () => {
    expect(
      efforts([
        { distance: 5020, elapsed_time: 1300 },
        { distance: 12_000, elapsed_time: 3300 },
      ])?.map((effort) => effort.distance),
    ).toEqual(['k5', null]);
    expect(efforts([])).toEqual([]);
  });
});

describe('parseStravaDetail', () => {
  it('maps streams, splits and laps, a missed sample or heart rate becoming NaN or null', () => {
    const detail = parseStravaDetail(streams, splits);
    expect(detail.streams).toEqual({
      time: [0, 1, 2],
      distance: [0, 3.1, 6.3],
      altitude: null,
      speed: null,
      heartRate: [120, Number.NaN, 124],
      power: null,
      cadence: [84, 86.5, Number.NaN],
      // A sample without the flag counts as moving.
      moving: [true, false, true],
    });
    expect(detail.splits).toEqual({
      metric: [
        {
          distanceMeters: 1000,
          movingTimeSeconds: 300,
          elevationDifferenceMeters: 4.2,
          averageSpeed: 3.33,
          averageHeartRate: 151.4,
        },
        {
          distanceMeters: 1000,
          movingTimeSeconds: 310,
          elevationDifferenceMeters: 0,
          averageSpeed: 3.22,
          averageHeartRate: null,
        },
      ],
      imperial: [],
    });
    expect(detail.laps).toEqual([
      { distanceMeters: 2000, movingTimeSeconds: 610, averageSpeed: 3.28, averageHeartRate: 160.2 },
      {
        distanceMeters: 400.5,
        movingTimeSeconds: 180,
        averageSpeed: 2.225,
        averageHeartRate: null,
      },
    ]);
  });

  it('takes an activity without streams, splits or laps', () => {
    const bare = parseStravaDetail(null, {});
    expect(bare.streams).toBeNull();
    expect(bare.laps).toEqual([]);
  });

  it('rejects streams of different lengths, naming the stream', () => {
    expect(() => parseStravaDetail({ ...streams, altitude: { data: [1, 2] } }, splits)).toThrow(
      /altitude/,
    );
  });
});
