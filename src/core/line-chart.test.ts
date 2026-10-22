import { lineChartPoints, peakIndex } from './line-chart';

describe('lineChartPoints', () => {
  it('spreads the values from edge to edge, from zero at the bottom to the top', () => {
    expect(lineChartPoints([0, 5, 10], 100, 50)).toEqual([
      { x: 0, y: 50 },
      { x: 50, y: 25 },
      { x: 100, y: 0 },
    ]);
  });

  it('centers a single value and lays an empty chart on the bottom', () => {
    expect(lineChartPoints([7], 100, 50)).toEqual([{ x: 50, y: 0 }]);
    expect(lineChartPoints([0, 0], 100, 50)).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ]);
    expect(lineChartPoints([], 100, 50)).toEqual([]);
  });
});

describe('peakIndex', () => {
  it('finds the first highest value, and none without values above zero', () => {
    expect(peakIndex([3, 9, 2, 9])).toBe(1);
    expect(peakIndex([0, 0])).toBeNull();
    expect(peakIndex([])).toBeNull();
  });
});
