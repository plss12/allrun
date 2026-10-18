import { parseStravaDetail } from './detail';

const streams = {
  time: { data: [0, 1, 2] },
  distance: { data: [0, 3.1, 6.3] },
  heartrate: { data: [120, null, 124] },
};
const splits = {
  splits_metric: [
    { distance: 1000, moving_time: 300, elevation_difference: 4.2, average_speed: 3.33 },
  ],
  splits_standard: null,
};

describe('parseStravaDetail', () => {
  it('maps streams and splits, a missed sample becoming NaN', () => {
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
        },
      ],
      imperial: [],
    });
  });

  it('takes an activity without streams', () => {
    expect(parseStravaDetail(null, {}).streams).toBeNull();
  });

  it('rejects streams of different lengths, naming the stream', () => {
    expect(() => parseStravaDetail({ ...streams, altitude: { data: [1, 2] } }, splits)).toThrow(
      /altitude/,
    );
  });
});
