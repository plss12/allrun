import { makeActivity } from '@/test-utils/make-activity';

import { customRange, monthRange, weekRange, yearRange } from './dates';
import { summarize } from './summary';
import { gridColumns, summaryBlocks, tableBucket } from './summary-block';

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
    routePolyline: null,
    localDate: '2026-10-15',
  });

  it('offers the period with one, two and three data, its tables and nothing per sport alone', () => {
    expect(summaryBlocks(summarize([run], week))).toEqual([
      { design: 'periodData', count: 1 },
      { design: 'periodData', count: 2 },
      { design: 'periodData', count: 3 },
      { design: 'periodTable', value: 'distance' },
      { design: 'periodTable', value: 'movingTime' },
      { design: 'periodIcons', layout: 'days' },
      { design: 'periodRoutes', layout: 'grid' },
      { design: 'periodRoutes', layout: 'overlay' },
      { design: 'periodCards' },
    ]);
  });

  it('offers the total per sport, written and with icons, when the period mixes sports', () => {
    const blocks = summaryBlocks(summarize([run, ride], week));
    expect(blocks).toContainEqual({ design: 'periodSports' });
    expect(blocks).toContainEqual({ design: 'periodIcons', layout: 'sports' });
  });

  it("lists the days only in a week, and the activities' routes only up to a month", () => {
    const october = summaryBlocks(summarize([run], monthRange('2026-10-01')));
    expect(october).not.toContainEqual({ design: 'periodIcons', layout: 'days' });
    expect(october).toContainEqual({ design: 'periodRoutes', layout: 'grid' });
    const year = summaryBlocks(summarize([run], yearRange('2026-01-01')));
    expect(year).not.toContainEqual({ design: 'periodRoutes', layout: 'grid' });
    // A year's routes, overlaid.
    expect(year).toContainEqual({ design: 'periodRoutes', layout: 'overlay' });
    // The cards suit any period.
    expect(year).toContainEqual({ design: 'periodCards' });
  });

  it('offers as many data as the period has, and only its table of time without distance', () => {
    expect(summaryBlocks(summarize([gym], week))).toEqual([
      { design: 'periodData', count: 1 },
      { design: 'periodData', count: 2 },
      { design: 'periodTable', value: 'movingTime' },
      { design: 'periodIcons', layout: 'days' },
      { design: 'periodRoutes', layout: 'grid' },
      // Without any route, its sport's icon in their place: the page isn't lost.
      { design: 'periodRoutes', layout: 'overlay' },
      { design: 'periodCards' },
    ]);
  });

  it('offers nothing for a period without activities', () => {
    expect(summaryBlocks(summarize([], week))).toEqual([]);
  });
});

describe('gridColumns', () => {
  it('puts a few activities in two columns, and more in more, six at most', () => {
    expect(gridColumns(1)).toBe(1);
    expect(gridColumns(2)).toBe(2);
    expect(gridColumns(6)).toBe(2);
    expect(gridColumns(7)).toBe(3);
    expect(gridColumns(10)).toBe(4);
    expect(gridColumns(13)).toBe(5);
    expect(gridColumns(16)).toBe(6);
    expect(gridColumns(30)).toBe(6);
  });
});
