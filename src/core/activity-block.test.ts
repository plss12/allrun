import { makeActivity } from '@/test-utils/make-activity';

import {
  activityBlocks,
  bigMetrics,
  blockDataCount,
  blockLettering,
  blockMetrics,
  fastestIndex,
  framesCanvas,
  isAppReplica,
  isDataWidget,
  sentencePlan,
  sportIcon,
  towerMetrics,
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

describe('bigMetrics', () => {
  const gym = makeActivity({ sportType: 'WeightTraining', distanceMeters: 0, averageSpeed: null });

  it("puts the main datum or the time on top, then the rest in the sport's order", () => {
    const run = makeActivity({ sportType: 'Run' });
    expect(bigMetrics(run, 'main', 4)).toEqual(['distance', 'pace', 'movingTime', 'elevationGain']);
    expect(bigMetrics(run, 'time', 4)).toEqual(['movingTime', 'distance', 'pace', 'elevationGain']);
    expect(bigMetrics(run, 'time', 3)).toEqual(['movingTime', 'distance', 'pace']);
  });

  it('leaves out the second readings of a measure, which nothing would tell from the first', () => {
    // The highest heart rate and the elapsed time would read as a second "ppm" and time.
    expect(bigMetrics(gym, 'main', 4)).toEqual(['movingTime', 'averageHeartRate', 'calories']);
    const ride = makeActivity({
      sportType: 'Ride',
      averagePowerWatts: 210,
      weightedAveragePowerWatts: 225,
      elevationGainMeters: 0,
      averageHeartRate: null,
      calories: null,
      averageCadence: null,
    });
    // Without its gain, the highest altitude would read as one; the weighted power, as a second.
    expect(bigMetrics(ride, 'main', 6)).toEqual([
      'distance',
      'speed',
      'movingTime',
      'averagePower',
    ]);
  });
});

describe('activityBlocks', () => {
  it('offers every version of every design, in the order of the gallery', () => {
    expect(activityBlocks(makeActivity())).toEqual([
      // The data widgets, never with the time on top: a datum big over two or three more, wide
      // and stretched; under the weekday, wide and stretched; alone under it, small first.
      { design: 'bigPair', layout: 'wide', top: 'main' },
      { design: 'bigTrio', layout: 'wide', top: 'main' },
      { design: 'bigPair', layout: 'stretched', top: 'main' },
      { design: 'bigTrio', layout: 'stretched', top: 'main' },
      { design: 'bigPair', layout: 'day', top: 'main' },
      { design: 'bigTrio', layout: 'day', top: 'main' },
      { design: 'bigPair', layout: 'stretchedDay', top: 'main' },
      { design: 'bigTrio', layout: 'stretchedDay', top: 'main' },
      { design: 'bigSolo', layout: 'smallDay', top: 'main' },
      { design: 'bigSolo', layout: 'day', top: 'main' },
      { design: 'bigSolo', layout: 'stretchedDay', top: 'main' },
      // The tower; the data alone, stacked and in a line; the card.
      { design: 'tower' },
      { design: 'dataStack', layout: 'three' },
      { design: 'dataStack', layout: 'two' },
      { design: 'dataLine', layout: 'namedThree' },
      { design: 'dataLine', layout: 'three' },
      { design: 'dataLine', layout: 'namedTwo' },
      { design: 'dataLine', layout: 'two' },
      { design: 'card', layout: 'nameThree' },
      { design: 'card', layout: 'nameSix' },
      { design: 'card', layout: 'three' },
      { design: 'card', layout: 'six' },
      // Around the weekday: between the data, over them in columns, beside them.
      { design: 'dayBetween', layout: 'four' },
      { design: 'dayBetween', layout: 'two' },
      { design: 'dayOver', layout: 'wide' },
      { design: 'dayOver', layout: 'narrow' },
      { design: 'dayColumns', layout: 'three' },
      { design: 'dayColumns', layout: 'four' },
      // Around the route, for activities with GPS.
      { design: 'bigPair', layout: 'route', top: 'main' },
      { design: 'bigTrio', layout: 'route', top: 'main' },
      { design: 'dayRoute', top: 'main' },
      // Words: the quote and the verse with their first phrase (the others are chosen from a
      // list), the two chat messages, the sentence and the badge.
      { design: 'quote', quote: 'kipchoge' },
      { design: 'verse', verse: 'philippians4v13' },
      { design: 'message', layout: 'dark' },
      { design: 'message', layout: 'light' },
      { design: 'chat', layout: 'dark', phrase: 'zombieMode' },
      { design: 'chat', layout: 'light', phrase: 'zombieMode' },
      { design: 'sentence' },
      { design: 'equivalences', layout: 'dark' },
      { design: 'equivalences', layout: 'light' },
      { design: 'verified', layout: 'dark' },
      { design: 'verified', layout: 'light' },
      // The phone's apps.
      { design: 'music', layout: 'dark', cover: 'red' },
      { design: 'music', layout: 'dark', cover: 'ink' },
      { design: 'music', layout: 'light', cover: 'red' },
      { design: 'music', layout: 'light', cover: 'ink' },
      { design: 'alarm', layout: 'dark' },
      { design: 'alarm', layout: 'light' },
      { design: 'camera', cover: 'red' },
      { design: 'camera', cover: 'ink' },
      // Things of paper.
      { design: 'receipt' },
      { design: 'nutrition', label: 'facts', layout: 'light' },
      { design: 'nutrition', label: 'facts', layout: 'dark' },
      { design: 'nutrition', label: 'table', layout: 'light' },
      { design: 'nutrition', label: 'table', layout: 'dark' },
      { design: 'boardingPass', cover: 'red' },
      { design: 'boardingPass', cover: 'ink' },
    ]);
  });

  it('offers the data widgets only full', () => {
    const gym = makeActivity({
      sportType: 'WeightTraining',
      distanceMeters: 0,
      averageSpeed: null,
      routePolyline: null,
    });
    // A gym session: its time over its heart rate and calories, and no route.
    expect(activityBlocks(gym).filter((block) => isDataWidget(block.design))).toEqual([
      { design: 'bigPair', layout: 'wide', top: 'main' },
      { design: 'bigPair', layout: 'stretched', top: 'main' },
      { design: 'bigPair', layout: 'day', top: 'main' },
      { design: 'bigPair', layout: 'stretchedDay', top: 'main' },
      { design: 'bigSolo', layout: 'smallDay', top: 'main' },
      { design: 'bigSolo', layout: 'day', top: 'main' },
      { design: 'bigSolo', layout: 'stretchedDay', top: 'main' },
      // The tower with its calories, time and heart rate.
      { design: 'tower' },
      { design: 'dataStack', layout: 'three' },
      { design: 'dataStack', layout: 'two' },
      { design: 'dataLine', layout: 'namedThree' },
      { design: 'dataLine', layout: 'three' },
      { design: 'dataLine', layout: 'namedTwo' },
      { design: 'dataLine', layout: 'two' },
      { design: 'card', layout: 'nameThree' },
      { design: 'card', layout: 'three' },
      // Its time, heart rate and calories fill the date widgets of two data.
      { design: 'dayBetween', layout: 'two' },
      { design: 'dayOver', layout: 'narrow' },
      { design: 'dayColumns', layout: 'three' },
    ]);
  });

  it('offers the big datum under the route only for an activity with a route', () => {
    const layouts = (routePolyline: string | null) =>
      activityBlocks(makeActivity({ routePolyline })).flatMap((block) =>
        block.design === 'bigPair' ? [block.layout] : [],
      );
    expect(layouts('_p~iF~ps|U_ulLnnqC')).toContain('route');
    expect(layouts(null)).not.toContain('route');
  });

  it('offers the timing tables only for an activity with splits or laps, after the apps', () => {
    const designs = activityBlocks(makeActivity(), true, false, true).map((block) => block.design);
    expect(designs.slice(designs.lastIndexOf('camera') + 1, designs.indexOf('receipt'))).toEqual([
      // The note, with the phone's apps, after the camera; then the races: the laps as AURA's
      // board and a karting's sheet beside the splits as a race on TV, and the splits as AURA's
      // bars and a typewriter's ladder.
      'notes',
      'notes',
      'laps',
      'laps',
      'laps',
      'laps',
      'grandPrix',
      'splitBars',
      'splitLadder',
      'splitLadder',
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

  it('offers the location sticker after the verified badge, only when the place can be named', () => {
    const blocks = activityBlocks(makeActivity(), false, true);
    const badge = blocks.findIndex((block) => block.design === 'location') - 2;
    expect(blocks.slice(badge, badge + 4)).toEqual([
      { design: 'verified', layout: 'dark' },
      { design: 'verified', layout: 'light' },
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

describe('towerMetrics', () => {
  it('writes the distance big, and how fast and how long small, in the sport order', () => {
    expect(towerMetrics(makeActivity({ sportType: 'Run' }))).toEqual([
      'distance',
      'pace',
      'movingTime',
    ]);
    expect(towerMetrics(makeActivity({ sportType: 'Ride' }))).toEqual([
      'distance',
      'speed',
      'movingTime',
    ]);
    // A walk puts its time before its pace, and never its elevation gain.
    expect(towerMetrics(makeActivity({ sportType: 'Walk', elevationGainMeters: 80 }))).toEqual([
      'distance',
      'movingTime',
      'pace',
    ]);
  });

  it('writes the calories big without a distance, and the time and heart rate small', () => {
    const gym = makeActivity({
      sportType: 'WeightTraining',
      distanceMeters: 0,
      averageSpeed: null,
    });
    expect(towerMetrics(gym)).toEqual(['calories', 'movingTime', 'averageHeartRate']);
  });

  it("is empty when the activity can't fill it", () => {
    const gym = makeActivity({
      sportType: 'WeightTraining',
      distanceMeters: 0,
      averageSpeed: null,
      calories: null,
    });
    expect(towerMetrics(gym)).toEqual([]);
  });
});

describe('blockDataCount', () => {
  it('is the number of data each design writes', () => {
    // The main datum and three or two more under it.
    expect(blockDataCount({ design: 'bigTrio', layout: 'stretched', top: 'main' })).toBe(4);
    expect(blockDataCount({ design: 'bigPair', layout: 'wide', top: 'time' })).toBe(3);
    expect(blockDataCount({ design: 'bigSolo', layout: 'day', top: 'main' })).toBe(1);
    // The date widgets: the data beside the short weekday, under the sport and start time, beside
    // the date, and stacked.
    expect(blockDataCount({ design: 'dayRoute', top: 'time' })).toBe(1);
    expect(blockDataCount({ design: 'dayBetween', layout: 'four' })).toBe(4);
    expect(blockDataCount({ design: 'dayOver', layout: 'wide' })).toBe(4);
    expect(blockDataCount({ design: 'dayOver', layout: 'narrow' })).toBe(2);
    expect(blockDataCount({ design: 'dayColumns', layout: 'three' })).toBe(3);
    expect(blockDataCount({ design: 'dataStack', layout: 'two' })).toBe(2);
    // The tower's big datum and two more beside its sport.
    expect(blockDataCount({ design: 'tower' })).toBe(3);
    expect(blockDataCount({ design: 'dataLine', layout: 'three' })).toBe(3);
    expect(blockDataCount({ design: 'dataLine', layout: 'two' })).toBe(2);
    expect(blockDataCount({ design: 'dataLine', layout: 'namedThree' })).toBe(3);
    expect(blockDataCount({ design: 'dataLine', layout: 'namedTwo' })).toBe(2);
    expect(blockDataCount({ design: 'card', layout: 'nameSix' })).toBe(6);
    expect(blockDataCount({ design: 'card', layout: 'three' })).toBe(3);
    // A note lists the splits under the distance.
    expect(blockDataCount({ design: 'notes', layout: 'light' })).toBe(1);
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
    expect(framesCanvas({ design: 'receipt' })).toBe(false);
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
    expect(isAppReplica('nutrition')).toBe(true);
    expect(isAppReplica('equivalences')).toBe(true);
    expect(isAppReplica('verse')).toBe(false);
    expect(isAppReplica('quote')).toBe(false);
    expect(isAppReplica('bigTrio')).toBe(false);
    expect(isAppReplica('bigPair')).toBe(false);
  });

  it('tells the data widgets from the creative ones', () => {
    expect(isDataWidget('bigTrio')).toBe(true);
    expect(isDataWidget('bigPair')).toBe(true);
    expect(isDataWidget('bigSolo')).toBe(true);
    expect(isDataWidget('dataStack')).toBe(true);
    expect(isDataWidget('tower')).toBe(true);
    expect(isDataWidget('dataLine')).toBe(true);
    expect(isDataWidget('card')).toBe(true);
    expect(isDataWidget('verse')).toBe(false);
    expect(isDataWidget('receipt')).toBe(false);
  });

  it("gives each version the font that suits it, and replicas the apps' one", () => {
    const capitals = { italic: false, uppercase: true };
    // The big datum wide and heavy, or heavy and stretched upwards.
    expect(blockLettering({ design: 'bigTrio', layout: 'wide', top: 'main' })).toEqual({
      font: 'unbounded',
      bold: true,
      ...capitals,
    });
    // Under the weekday and under the route, wide and heavy too (the user's pick for the route).
    expect(blockLettering({ design: 'bigPair', layout: 'day', top: 'main' }).font).toBe(
      'unbounded',
    );
    expect(blockLettering({ design: 'bigTrio', layout: 'route', top: 'main' }).font).toBe(
      'unbounded',
    );
    // Each date widget in a lettering of its own, for a varied gallery.
    const fontOf = (block: Parameters<typeof blockLettering>[0]) => blockLettering(block).font;
    expect([
      fontOf({ design: 'bigSolo', layout: 'smallDay', top: 'main' }),
      fontOf({ design: 'dayRoute', top: 'main' }),
      fontOf({ design: 'dayBetween', layout: 'four' }),
      fontOf({ design: 'dayOver', layout: 'wide' }),
      fontOf({ design: 'dayOver', layout: 'narrow' }),
      fontOf({ design: 'dataStack', layout: 'three' }),
    ]).toEqual([
      'inter',
      'permanentMarker',
      'bigShoulders',
      'graduate',
      'anton',
      'barlowCondensed',
    ]);
    // The tower heavy and stretched upwards; the line of data wide and heavy.
    expect(blockLettering({ design: 'tower' })).toEqual({
      font: 'bowlbyOneSC',
      bold: false,
      ...capitals,
    });
    expect(blockLettering({ design: 'dataLine', layout: 'three' })).toEqual({
      font: 'unbounded',
      bold: true,
      ...capitals,
    });
    // Named, as Strava writes them: in small letters.
    expect(blockLettering({ design: 'dataLine', layout: 'namedThree' })).toEqual({
      font: 'unbounded',
      bold: true,
      italic: false,
      uppercase: false,
    });
    // The card in a typewriter's letters, in small letters as its names and units are written.
    expect(blockLettering({ design: 'card', layout: 'six' })).toEqual({
      font: 'spaceMono',
      bold: false,
      italic: false,
      uppercase: false,
    });
    expect(blockLettering({ design: 'bigSolo', layout: 'stretchedDay', top: 'main' }).font).toBe(
      'bowlbyOneSC',
    );
    expect(blockLettering({ design: 'bigPair', layout: 'stretched', top: 'time' })).toEqual({
      font: 'bowlbyOneSC',
      bold: false,
      ...capitals,
    });
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
