import { makeActivity } from '@/test-utils/make-activity';

import { activityBlocks, blockDataCount, blockMetrics, sportIcon } from './activity-block';

describe('blockMetrics', () => {
  it("leads with the card's data, then the sport's, then second readings", () => {
    const run = makeActivity({ sportType: 'Run' });
    expect(blockMetrics(run, 3)).toEqual(['distance', 'pace', 'movingTime']);
    expect(blockMetrics(run, 6)).toEqual([
      'distance',
      'pace',
      'movingTime',
      'elevationGain',
      'maxElevation',
      'averageHeartRate',
    ]);
    expect(blockMetrics(run, 20).slice(-2)).toEqual(['maxHeartRate', 'elapsedTime']);
  });

  it('writes a ride with its speed and a gym session with its effort', () => {
    expect(blockMetrics(makeActivity({ sportType: 'Ride' }), 3)).toEqual([
      'distance',
      'speed',
      'movingTime',
    ]);
    const gym = makeActivity({
      sportType: 'WeightTraining',
      distanceMeters: 0,
      averageSpeed: null,
    });
    expect(blockMetrics(gym, 6)).toEqual([
      'movingTime',
      'averageHeartRate',
      'calories',
      'maxHeartRate',
      'elapsedTime',
    ]);
  });

  it('pairs the distance with the time, or takes the first two without a distance', () => {
    expect(blockMetrics(makeActivity({ sportType: 'Run' }), 2)).toEqual(['distance', 'movingTime']);
    const gym = makeActivity({
      sportType: 'WeightTraining',
      distanceMeters: 0,
      averageSpeed: null,
    });
    expect(blockMetrics(gym, 2)).toEqual(['movingTime', 'averageHeartRate']);
  });

  it('gives fewer data when the activity has fewer', () => {
    const bare = makeActivity({
      sportType: 'Workout',
      distanceMeters: 0,
      averageSpeed: null,
      averageHeartRate: null,
      maxHeartRate: null,
      calories: null,
      elapsedTimeSeconds: 0,
    });
    expect(blockMetrics(bare, 6)).toEqual(['movingTime']);
  });
});

describe('activityBlocks', () => {
  it('offers every version of every design, in the order of the gallery', () => {
    expect(activityBlocks(makeActivity())).toEqual([
      { design: 'headline', layout: 'stacked' },
      { design: 'headline', layout: 'inline' },
      { design: 'headline', layout: 'condensed' },
      { design: 'columns', count: 2 },
      { design: 'columns', count: 3 },
      { design: 'columns', count: 4 },
      { design: 'columns', count: 6 },
      { design: 'route', layout: 'stacked' },
      { design: 'route', layout: 'inline' },
      { design: 'route', layout: 'between' },
      { design: 'day', layout: 'stacked' },
      { design: 'day', layout: 'inline' },
      { design: 'sport', layout: 'centered' },
      { design: 'sport', layout: 'list' },
    ]);
  });

  it('offers columns only up to the data the activity has', () => {
    const gym = makeActivity({
      sportType: 'WeightTraining',
      distanceMeters: 0,
      averageSpeed: null,
    });
    const counts = activityBlocks(gym).flatMap((block) =>
      block.design === 'columns' ? [block.count] : [],
    );
    expect(counts).toEqual([2, 3, 4]);
  });

  it('offers the route designs only for an activity with a route', () => {
    const designs = (routePolyline: string | null) =>
      new Set(activityBlocks(makeActivity({ routePolyline })).map((block) => block.design));
    expect(designs('_p~iF~ps|U_ulLnnqC')).toContain('route');
    expect(designs(null)).not.toContain('route');
  });

  it('offers nothing for an activity without data', () => {
    const empty = makeActivity({
      sportType: 'Workout',
      distanceMeters: 0,
      movingTimeSeconds: 0,
      elapsedTimeSeconds: 0,
      averageSpeed: null,
      averageHeartRate: null,
      maxHeartRate: null,
      calories: null,
    });
    expect(activityBlocks(empty)).toEqual([]);
  });
});

describe('blockDataCount', () => {
  it('is the number of columns, four for a list and three otherwise', () => {
    expect(blockDataCount({ design: 'columns', count: 6 })).toBe(6);
    expect(blockDataCount({ design: 'sport', layout: 'list' })).toBe(4);
    expect(blockDataCount({ design: 'sport', layout: 'centered' })).toBe(3);
    expect(blockDataCount({ design: 'route', layout: 'between' })).toBe(2);
    expect(blockDataCount({ design: 'headline', layout: 'condensed' })).toBe(3);
  });
});

describe('sportIcon', () => {
  it("is the family's icon, or the hiker's for a hike", () => {
    expect(sportIcon(makeActivity({ sportType: 'TrailRun' }))).toBe('run');
    expect(sportIcon(makeActivity({ sportType: 'Hike' }))).toBe('hike');
    expect(sportIcon(makeActivity({ sportType: 'Walk' }))).toBe('walk');
    expect(sportIcon(makeActivity({ sportType: 'RockClimbing' }))).toBe('other');
  });
});
