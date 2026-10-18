import { durationParts, formatDuration, formatPace, metersToUnit } from './units';

describe('metersToUnit', () => {
  it('converts meters to kilometers and miles', () => {
    expect(metersToUnit(21097.5, 'km')).toBeCloseTo(21.0975);
    expect(metersToUnit(1609.344, 'mi')).toBe(1);
  });
});

describe('formatDuration', () => {
  it('formats durations under an hour as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(275)).toBe('4:35');
  });

  it('formats durations of an hour or more as h:mm:ss', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3 * 3600 + 5 * 60 + 9)).toBe('3:05:09');
  });

  it('carries rounded seconds into minutes', () => {
    expect(formatDuration(59.6)).toBe('1:00');
  });

  it('rejects negative or non-finite durations', () => {
    expect(() => formatDuration(-1)).toThrow(RangeError);
    expect(() => formatDuration(Number.NaN)).toThrow(RangeError);
  });
});

describe('formatPace', () => {
  it('formats pace per kilometer and per mile', () => {
    // 1000 m / 275 s = 4:35 min/km
    expect(formatPace(1000 / 275, 'km')).toBe('4:35');
    expect(formatPace(1609.344 / 480, 'mi')).toBe('8:00');
  });

  it('returns null when there is no meaningful speed', () => {
    expect(formatPace(0, 'km')).toBeNull();
    expect(formatPace(Number.POSITIVE_INFINITY, 'km')).toBeNull();
  });
});

describe('durationParts', () => {
  const h = (amount: number) => ({ amount, unit: 'hours' });
  const min = (amount: number) => ({ amount, unit: 'minutes' });
  const s = (amount: number) => ({ amount, unit: 'seconds' });

  it('splits a duration down to seconds, minutes or hours', () => {
    expect(durationParts(6030, 'seconds')).toEqual([h(1), min(40), s(30)]);
    expect(durationParts(6030, 'minutes')).toEqual([h(1), min(41)]);
    expect(durationParts(6030, 'hours')).toEqual([h(2)]);
  });

  it('leaves out the parts that are zero, but never all of them', () => {
    expect(durationParts(3030, 'seconds')).toEqual([min(50), s(30)]);
    expect(durationParts(3630, 'seconds')).toEqual([h(1), s(30)]);
    expect(durationParts(7200, 'seconds')).toEqual([h(2)]);
    expect(durationParts(0, 'minutes')).toEqual([min(0)]);
    expect(durationParts(20, 'minutes')).toEqual([min(0)]);
  });

  it('carries a rounded unit over to the next one', () => {
    expect(durationParts(3599.6, 'seconds')).toEqual([h(1)]);
    expect(durationParts(3570, 'minutes')).toEqual([h(1)]);
  });

  it('rejects negative or non-finite durations', () => {
    expect(() => durationParts(-1, 'seconds')).toThrow(RangeError);
    expect(() => durationParts(Number.NaN, 'minutes')).toThrow(RangeError);
  });
});
