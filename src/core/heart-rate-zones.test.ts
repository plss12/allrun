import {
  type HeartRateZones,
  timeInZones,
  zoneEdges,
  zoneIndex,
  zoneRange,
} from './heart-rate-zones';

/** Heart rate zones as Strava writes an activity's: whole beats that don't overlap. */
const ZONES: HeartRateZones = [
  { min: 0, max: 143 },
  { min: 144, max: 162 },
  { min: 163, max: 171 },
  { min: 172, max: 184 },
  { min: 185, max: null },
];

/** Pace zones, in m/s, sharing their edges. */
const PACE: HeartRateZones = [
  { min: 0, max: 2.558 },
  { min: 2.558, max: 3.049 },
  { min: 3.049, max: null },
];

describe('zoneEdges', () => {
  it('puts the edge halfway between two zones of whole beats', () => {
    expect(zoneEdges(ZONES)).toEqual([143.5, 162.5, 171.5, 184.5]);
  });

  it('keeps an edge two zones share', () => {
    expect(zoneEdges(PACE)).toEqual([2.558, 3.049]);
  });
});

describe('zoneIndex', () => {
  const edges = zoneEdges(ZONES);

  it("finds a heart rate's zone as Strava writes it, a zone's top included", () => {
    expect(zoneIndex(90, edges)).toBe(0);
    expect(zoneIndex(143, edges)).toBe(0);
    expect(zoneIndex(144, edges)).toBe(1);
    expect(zoneIndex(162, edges)).toBe(1);
    expect(zoneIndex(162.7, edges)).toBe(2);
    expect(zoneIndex(200, edges)).toBe(4);
  });

  it('puts a value on a shared edge in the lower zone', () => {
    expect(zoneIndex(3.049, zoneEdges(PACE))).toBe(1);
    expect(zoneIndex(3.05, zoneEdges(PACE))).toBe(2);
  });

  it('puts a value under every zone in the first', () => {
    expect(zoneIndex(-1, edges)).toBe(0);
  });
});

describe('timeInZones', () => {
  it('counts the time since the sample before in the zone of each sample', () => {
    const time = [0, 10, 20, 30, 50];
    const heartRate = [100, 150, 162, 165, 190];
    expect(timeInZones(time, heartRate, ZONES)).toEqual([0, 20, 10, 0, 20]);
  });

  it('counts only while moving, when Strava says', () => {
    const time = [0, 10, 20, 30];
    const moving = [true, true, false, true];
    expect(timeInZones(time, [150, 150, 150, 150], ZONES, moving)).toEqual([0, 20, 0, 0, 0]);
  });

  it('skips samples the sensor missed', () => {
    expect(timeInZones([0, 10, 20], [150, Number.NaN, 150], ZONES)).toEqual([0, 10, 0, 0, 0]);
  });

  it('rejects streams of different lengths', () => {
    expect(() => timeInZones([0, 1], [120], ZONES)).toThrow(RangeError);
    expect(() => timeInZones([0, 1], [120, 120], ZONES, [true])).toThrow(RangeError);
  });
});

describe('zoneRange', () => {
  it('writes the first zone as under, the middle ones as spans and the last as over', () => {
    expect([0, 1, 2, 3, 4].map((i) => zoneRange(i, ZONES))).toEqual([
      '<144',
      '144–162',
      '163–171',
      '172–184',
      '185+',
    ]);
  });

  it("ends a zone a unit under the next one's start when they share an edge", () => {
    const power = [
      { min: 0, max: 138 },
      { min: 138, max: 188 },
      { min: 188, max: null },
    ];
    expect([0, 1, 2].map((i) => zoneRange(i, power))).toEqual(['<138', '138–187', '188+']);
  });
});
