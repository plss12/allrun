import { makeActivity } from '@/test-utils/make-activity';

import {
  activityBlocks,
  blockDataCount,
  blockLettering,
  blockMetrics,
  fastestIndex,
  framesCanvas,
  isAppReplica,
  sentencePlan,
  sportIcon,
  tyreCompounds,
} from './activity-block';

describe('blockMetrics', () => {
  it("leads with the card's data, then the sport's, then second readings", () => {
    const run = makeActivity({ sportType: 'Run' });
    expect(blockMetrics(run, 3)).toEqual(['distance', 'pace', 'movingTime']);
    expect(blockMetrics(run, 6)).toEqual([
      'distance',
      'pace',
      'movingTime',
      'elevationGain',
      'averageHeartRate',
      'calories',
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
      { design: 'tall', layout: 'thin' },
      { design: 'tall', layout: 'heavy' },
      { design: 'wide', layout: 'pair' },
      { design: 'wide', layout: 'trio' },
      { design: 'wide', layout: 'weekday' },
      { design: 'day', layout: 'stacked' },
      { design: 'day', layout: 'inline' },
      { design: 'weekday', layout: 'grid' },
      { design: 'weekday', layout: 'inline' },
      { design: 'sport', layout: 'centered' },
      { design: 'sport', layout: 'list' },
      { design: 'poster' },
      { design: 'serif' },
      // The verse and the quote with their first phrase: the others are chosen from a list.
      { design: 'verse', verse: 'philippians4v13' },
      { design: 'quote', quote: 'kipchoge' },
      { design: 'sentence' },
      { design: 'verified', layout: 'dark' },
      { design: 'verified', layout: 'light' },
      { design: 'message', layout: 'dark' },
      { design: 'message', layout: 'light' },
      // The chat message with its first phrase: the others are chosen from a list.
      { design: 'chat', layout: 'dark', phrase: 'zombieMode' },
      { design: 'chat', layout: 'light', phrase: 'zombieMode' },
      { design: 'music', layout: 'dark', cover: 'red' },
      { design: 'music', layout: 'dark', cover: 'ink' },
      { design: 'music', layout: 'light', cover: 'red' },
      { design: 'music', layout: 'light', cover: 'ink' },
      { design: 'camera', cover: 'red' },
      { design: 'camera', cover: 'ink' },
      { design: 'alarm', layout: 'dark' },
      { design: 'alarm', layout: 'light' },
      { design: 'receipt' },
      { design: 'boardingPass', cover: 'red' },
      { design: 'boardingPass', cover: 'ink' },
    ]);
  });

  it('offers the timing tables only for an activity with splits or laps, each by its look', () => {
    const designs = activityBlocks(makeActivity(), true, false, true).map((block) => block.design);
    expect(designs.slice(designs.indexOf('verified') + 2, designs.indexOf('message'))).toEqual([
      // AURA's board of laps and its bars of splits; the karting's sheet and the ladder of
      // splits; the race on TV and the note.
      'laps',
      'laps',
      'splitBars',
      'laps',
      'laps',
      'splitLadder',
      'splitLadder',
      'grandPrix',
      'notes',
      'notes',
    ]);
    expect(activityBlocks(makeActivity()).map((block) => block.design)).not.toContain('notes');
    // The laps need laps, not splits.
    const splitsOnly = activityBlocks(makeActivity(), true).map((block) => block.design);
    expect(splitsOnly).toContain('grandPrix');
    expect(splitsOnly).not.toContain('laps');
    // A board and a timing sheet, each with the fastest lap in either brand color.
    expect(
      activityBlocks(makeActivity(), false, false, true).filter((block) => block.design === 'laps'),
    ).toEqual([
      { design: 'laps', layout: 'board', cover: 'red' },
      { design: 'laps', layout: 'board', cover: 'ink' },
      { design: 'laps', layout: 'sheet', cover: 'red' },
      { design: 'laps', layout: 'sheet', cover: 'ink' },
    ]);
  });

  it('offers the location sticker after the alarm, only when the place can be named', () => {
    const blocks = activityBlocks(makeActivity(), false, true);
    const alarm = blocks.findIndex((block) => block.design === 'location') - 2;
    expect(blocks.slice(alarm, alarm + 4)).toEqual([
      { design: 'alarm', layout: 'dark' },
      { design: 'alarm', layout: 'light' },
      { design: 'location', layout: 'dark' },
      { design: 'location', layout: 'light' },
    ]);
    expect(activityBlocks(makeActivity()).map((block) => block.design)).not.toContain('location');
  });

  it('offers the bars and the ladder of splits only with splits, the ladder in both brand colors', () => {
    expect(
      activityBlocks(makeActivity(), true).filter((block) => block.design.startsWith('split')),
    ).toEqual([
      { design: 'splitBars' },
      { design: 'splitLadder', cover: 'red' },
      { design: 'splitLadder', cover: 'ink' },
    ]);
    const designs = activityBlocks(makeActivity()).map((block) => block.design);
    expect(designs).not.toContain('splitBars');
    expect(designs).not.toContain('splitLadder');
  });

  it('offers the sentence only when it can be written', () => {
    const designs = (activity: ReturnType<typeof makeActivity>) =>
      activityBlocks(activity).map((block) => block.design);
    expect(designs(makeActivity())).toContain('sentence');
    // Heart rate and calories alone don't make a sentence: it opens with a distance or a time.
    expect(
      designs(
        makeActivity({
          sportType: 'Workout',
          distanceMeters: 0,
          movingTimeSeconds: 0,
          averageSpeed: null,
        }),
      ),
    ).not.toContain('sentence');
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

  it('offers the camera in both brand colors with a route, and once without its thumbnail', () => {
    const cameras = (routePolyline: string | null) =>
      activityBlocks(makeActivity({ routePolyline })).filter((block) => block.design === 'camera');
    expect(cameras('_p~iF~ps|U_ulLnnqC')).toEqual([
      { design: 'camera', cover: 'red' },
      { design: 'camera', cover: 'ink' },
    ]);
    expect(cameras(null)).toHaveLength(1);
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
    expect(blockDataCount({ design: 'poster' })).toBe(3);
    // A note lists the splits under the distance.
    expect(blockDataCount({ design: 'notes', layout: 'light' })).toBe(1);
    expect(blockDataCount({ design: 'headline', layout: 'condensed' })).toBe(3);
    // Two at the ends of a wide datum, three spread under it.
    expect(blockDataCount({ design: 'wide', layout: 'pair' })).toBe(3);
    expect(blockDataCount({ design: 'wide', layout: 'trio' })).toBe(4);
    expect(blockDataCount({ design: 'weekday', layout: 'grid' })).toBe(4);
    // The song's two ends; the message's two data and the time where its time goes; and the
    // three data where the camera's settings go.
    expect(blockDataCount({ design: 'music', layout: 'dark', cover: 'red' })).toBe(2);
    expect(blockDataCount({ design: 'message', layout: 'dark' })).toBe(3);
    expect(blockDataCount({ design: 'camera', cover: 'ink' })).toBe(3);
    // The tables list splits; the alarm's label and the sticker carry the main datum.
    expect(blockDataCount({ design: 'grandPrix' })).toBe(1);
    expect(blockDataCount({ design: 'alarm', layout: 'light' })).toBe(1);
    expect(blockDataCount({ design: 'location', layout: 'dark' })).toBe(1);
    // The bars, the ladder and the badge show the main datum or the splits; the chat message
    // two data, the receipt a line per datum and the boarding pass its data under the trip.
    expect(blockDataCount({ design: 'splitBars' })).toBe(1);
    expect(blockDataCount({ design: 'splitLadder', cover: 'ink' })).toBe(1);
    expect(blockDataCount({ design: 'verified', layout: 'dark' })).toBe(1);
    expect(blockDataCount({ design: 'chat', layout: 'light', phrase: { own: 'hola' } })).toBe(3);
    expect(blockDataCount({ design: 'receipt' })).toBe(6);
    expect(blockDataCount({ design: 'boardingPass', cover: 'red' })).toBe(4);
    // A verse or a quote shows none.
    expect(blockDataCount({ design: 'verse', verse: 'romans8v18' })).toBe(0);
    expect(blockDataCount({ design: 'quote', quote: 'kipchoge' })).toBe(0);
  });
});

describe('framesCanvas', () => {
  it('is only the camera, which frames the photo', () => {
    expect(framesCanvas({ design: 'camera', cover: 'red' })).toBe(true);
    expect(framesCanvas({ design: 'music', layout: 'dark', cover: 'ink' })).toBe(false);
    expect(framesCanvas({ design: 'poster' })).toBe(false);
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

describe('isAppReplica and blockLettering', () => {
  it('tells the replicas of apps from the typographic widgets', () => {
    expect(isAppReplica('notes')).toBe(true);
    expect(isAppReplica('message')).toBe(true);
    expect(isAppReplica('music')).toBe(true);
    expect(isAppReplica('camera')).toBe(true);
    expect(isAppReplica('laps')).toBe(true);
    expect(isAppReplica('grandPrix')).toBe(true);
    expect(isAppReplica('alarm')).toBe(true);
    expect(isAppReplica('location')).toBe(true);
    // Things with a look of their own too: paper, a receipt, a boarding pass.
    expect(isAppReplica('splitBars')).toBe(true);
    expect(isAppReplica('splitLadder')).toBe(true);
    expect(isAppReplica('verified')).toBe(true);
    expect(isAppReplica('chat')).toBe(true);
    expect(isAppReplica('sentence')).toBe(true);
    expect(isAppReplica('receipt')).toBe(true);
    expect(isAppReplica('boardingPass')).toBe(true);
    expect(isAppReplica('verse')).toBe(false);
    expect(isAppReplica('quote')).toBe(false);
    expect(isAppReplica('poster')).toBe(false);
    expect(isAppReplica('serif')).toBe(false);
    expect(isAppReplica('headline')).toBe(false);
  });

  it("gives each version the font that suits it, and replicas the apps' one", () => {
    const capitals = { italic: false, uppercase: true };
    expect(blockLettering({ design: 'poster' })).toEqual({
      font: 'anton',
      bold: false,
      ...capitals,
    });
    expect(blockLettering({ design: 'day', layout: 'inline' }).font).toBe('bowlbyOneSC');
    expect(blockLettering({ design: 'weekday', layout: 'grid' }).font).toBe('bowlbyOneSC');
    expect(blockLettering({ design: 'headline', layout: 'stacked' })).toEqual({
      font: 'bigShoulders',
      bold: false,
      ...capitals,
    });
    expect(blockLettering({ design: 'tall', layout: 'heavy' })).toEqual({
      font: 'bigShoulders',
      bold: true,
      ...capitals,
    });
    expect(blockLettering({ design: 'wide', layout: 'trio' }).font).toBe('unbounded');
    // The serif writes in small letters, slanted.
    expect(blockLettering({ design: 'serif' })).toEqual({
      font: 'playfairDisplay',
      bold: false,
      italic: true,
      uppercase: false,
    });
    expect(blockLettering({ design: 'headline', layout: 'inline' }).font).toBe('unbounded');
    expect(blockLettering({ design: 'headline', layout: 'condensed' }).font).toBe('anton');
    expect(blockLettering({ design: 'notes', layout: 'dark' }).font).toBe('inter');
    expect(blockLettering({ design: 'music', layout: 'light', cover: 'red' }).font).toBe('inter');
    // A verse and a quote are quotations in a serif italic.
    expect(blockLettering({ design: 'verse', verse: 'timothy4v7' })).toEqual({
      font: 'playfairDisplay',
      bold: false,
      italic: true,
      uppercase: false,
    });
    expect(blockLettering({ design: 'quote', quote: 'ali' })).toEqual(
      blockLettering({ design: 'verse', verse: 'romans8v18' }),
    );
    expect(blockLettering({ design: 'columns', count: 3 })).toEqual({
      font: 'barlowCondensed',
      bold: true,
      ...capitals,
    });
  });
});

describe('sentencePlan', () => {
  const datum = <C extends string, M extends string>(clause: C, metric: M) => ({ clause, metric });
  const PLACE = { clause: 'place', metric: null };

  it('writes a run with its distance, where, how long and its pace', () => {
    expect(sentencePlan(makeActivity({ sportType: 'Run' }), true)).toEqual({
      lead: { lead: 'run', metric: 'distance' },
      clauses: [PLACE, datum('time', 'movingTime'), datum('pace', 'pace')],
    });
    // Without a place to name, the rest.
    expect(sentencePlan(makeActivity({ sportType: 'Run' }), false)?.clauses).toEqual([
      datum('time', 'movingTime'),
      datum('pace', 'pace'),
    ]);
  });

  it('gives each sport its word and its way of going fast; a walk says how long, not how fast', () => {
    expect(sentencePlan(makeActivity({ sportType: 'Ride' }), false)).toEqual({
      lead: { lead: 'ride', metric: 'distance' },
      clauses: [datum('time', 'movingTime'), datum('speed', 'speed')],
    });
    expect(sentencePlan(makeActivity({ sportType: 'Walk' }), true)).toEqual({
      lead: { lead: 'walk', metric: 'distance' },
      clauses: [PLACE, datum('time', 'movingTime')],
    });
    expect(sentencePlan(makeActivity({ sportType: 'Hike' }), false)?.lead.lead).toBe('hike');
    // A swim has no place to go through, and its pace is per 100 m.
    expect(sentencePlan(makeActivity({ sportType: 'Swim' }), true)).toEqual({
      lead: { lead: 'swim', metric: 'distance' },
      clauses: [datum('time', 'movingTime'), datum('pace', 'swimPace')],
    });
    // A sport without a word of its own goes by its name, after the distance.
    expect(sentencePlan(makeActivity({ sportType: 'AlpineSki' }), false)?.lead.lead).toBe(
      'distance',
    );
  });

  it('writes a session without distance with its time and its calories, or else its heart rate', () => {
    const gym = { sportType: 'WeightTraining', distanceMeters: 0, averageSpeed: null } as const;
    expect(sentencePlan(makeActivity(gym), true)).toEqual({
      lead: { lead: 'time', metric: 'movingTime' },
      clauses: [datum('calories', 'calories')],
    });
    expect(sentencePlan(makeActivity({ ...gym, calories: null }), true)?.clauses).toEqual([
      datum('heartRate', 'averageHeartRate'),
    ]);
    expect(
      sentencePlan(makeActivity({ ...gym, calories: null, averageHeartRate: null }), true)?.clauses,
    ).toEqual([]);
  });

  it('has nothing to say without a distance or a time', () => {
    expect(
      sentencePlan(
        makeActivity({
          sportType: 'Workout',
          distanceMeters: 0,
          movingTimeSeconds: 0,
          averageSpeed: null,
        }),
        true,
      ),
    ).toBeNull();
  });
});

describe('fastestIndex', () => {
  it('is the fastest, the first of equals, or none', () => {
    expect(fastestIndex([3, 4.2, 3.9, 4.2])).toBe(1);
    expect(fastestIndex([])).toBe(-1);
  });
});

describe('tyreCompounds', () => {
  it('gives the fastest third soft, the middle medium and the slowest hard', () => {
    expect(tyreCompounds([3.1, 3.6, 2.9, 3.4, 3.3, 3.0])).toEqual([
      'medium',
      'soft',
      'hard',
      'soft',
      'medium',
      'hard',
    ]);
  });

  it('keeps the order of equal speeds, and copes with one split or none', () => {
    expect(tyreCompounds([3, 3, 3])).toEqual(['soft', 'medium', 'hard']);
    expect(tyreCompounds([3])).toEqual(['soft']);
    expect(tyreCompounds([])).toEqual([]);
  });
});
