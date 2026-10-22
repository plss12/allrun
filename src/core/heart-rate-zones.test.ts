import { type HeartRateZones, timeInZones, zoneIndex, zoneRange } from './heart-rate-zones';

const ZONES: HeartRateZones = [
  { min: 0, max: 112 },
  { min: 112, max: 131 },
  { min: 131, max: 150 },
  { min: 150, max: 168 },
  { min: 168, max: null },
];

describe('zoneIndex', () => {
  it('finds the zone a heart rate reaches, its start included', () => {
    expect(zoneIndex(90, ZONES)).toBe(0);
    expect(zoneIndex(112, ZONES)).toBe(1);
    expect(zoneIndex(149.9, ZONES)).toBe(2);
    expect(zoneIndex(200, ZONES)).toBe(4);
  });

  it('puts a heart rate under every zone in the first', () => {
    expect(
      zoneIndex(40, [
        { min: 60, max: 100 },
        { min: 100, max: null },
      ]),
    ).toBe(0);
  });
});

describe('timeInZones', () => {
  it('counts the time since the sample before in the zone of each sample', () => {
    const time = [0, 10, 20, 30, 50];
    const heartRate = [100, 120, 120, 160, 170];
    expect(timeInZones(time, heartRate, ZONES)).toEqual([0, 20, 0, 10, 20]);
  });

  it('skips samples the sensor missed', () => {
    expect(timeInZones([0, 10, 20], [140, Number.NaN, 140], ZONES)).toEqual([0, 0, 10, 0, 0]);
  });

  it('rejects streams of different lengths', () => {
    expect(() => timeInZones([0, 1], [120], ZONES)).toThrow(RangeError);
  });
});

describe('zoneRange', () => {
  it('writes the first zone as under, the middle ones as spans and the last as over', () => {
    expect([0, 1, 2, 3, 4].map((i) => zoneRange(i, ZONES))).toEqual([
      '<112',
      '112–130',
      '131–149',
      '150–167',
      '168+',
    ]);
  });
});
