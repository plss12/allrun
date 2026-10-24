import { makeActivity } from '@/test-utils/make-activity';

import { customRange, monthRange, weekRange, yearRange } from './dates';
import { summarize } from './summary';
import { summaryBlocks, tableBucket } from './summary-block';

const week = weekRange('2026-10-14');

describe('tableBucket', () => {
  it("makes a row of each of a week's days, a month's weeks and a year's months", () => {
    expect(tableBucket(week)).toBe('day');
    expect(tableBucket(monthRange('2026-10-01'))).toBe('week');
    expect(tableBucket(yearRange('2026-01-01'))).toBe('month');
    // A 10-week training block, by weeks; ten days, by days.
    expect(tableBucket(customRange('2026-08-10', '2026-10-18'))).toBe('week');
    expect(tableBucket(customRange('2026-10-01', '2026-10-10'))).toBe('day');
  });
});

describe('summaryBlocks', () => {
  const run = makeActivity({ sportType: 'Run', localDate: '2026-10-13' });
  const ride = makeActivity({ sportType: 'Ride', localDate: '2026-10-14' });
  const gym = makeActivity({
    sportType: 'WeightTraining',
    distanceMeters: 0,
    elevationGainMeters: 0,
    localDate: '2026-10-15',
  });

  it('offers the period with one, two and three data, its tables and nothing per sport alone', () => {
    expect(summaryBlocks(summarize([run], week))).toEqual([
      { design: 'periodData', count: 1 },
      { design: 'periodData', count: 2 },
      { design: 'periodData', count: 3 },
      { design: 'periodTable', value: 'distance' },
      { design: 'periodTable', value: 'movingTime' },
    ]);
  });

  it('offers the total per sport when the period mixes sports', () => {
    expect(summaryBlocks(summarize([run, ride], week))).toContainEqual({
      design: 'periodSports',
    });
  });

  it('offers as many data as the period has, and only its table of time without distance', () => {
    expect(summaryBlocks(summarize([gym], week))).toEqual([
      { design: 'periodData', count: 1 },
      { design: 'periodData', count: 2 },
      { design: 'periodTable', value: 'movingTime' },
    ]);
  });

  it('offers nothing for a period without activities', () => {
    expect(summaryBlocks(summarize([], week))).toEqual([]);
  });
});
