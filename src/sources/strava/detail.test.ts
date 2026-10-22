import { parseStravaDetail } from './detail';

const streams = {
  time: { data: [0, 1, 2] },
  distance: { data: [0, 3.1, 6.3] },
  heartrate: { data: [120, null, 124] },
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
