import { makeActivity } from '@/test-utils/make-activity';

import { customRange, type DateRange, monthRange, weekRange, yearRange } from './dates';
import { summarize } from './summary';
import {
  calendarFigures,
  calendarMonths,
  calendarView,
  calendarWeeks,
  GRAND_PRIX_TOP,
  grandPrixActivities,
  gridColumns,
  ingredientShares,
  MAX_INGREDIENTS,
  MAX_METRO_ACROSS,
  metroLayout,
  metroStations,
  isSummaryDataWidget,
  isSummaryReplica,
  listsNoteActivities,
  MAX_NOTES_ACTIVITIES,
  mainFamily,
  noteActivities,
  periodSentencePlan,
  periodStreak,
  streakStrip,
  weatherCondition,
  PLAYLIST_TOP,
  periodWrapped,
  playlistSongs,
  WRAPPED_TOP,
  summaryBlocks,
  tableBucket,
} from './summary-block';
import { QUOTES, VERSES } from './template';

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

  it('offers the period with one, two and three data, its tables and its one sport written', () => {
    expect(summaryBlocks(summarize([run], week))).toEqual([
      { design: 'periodData', count: 1 },
      { design: 'periodData', count: 2 },
      { design: 'periodData', count: 3 },
      { design: 'periodTable', value: 'distance' },
      { design: 'periodTable', value: 'movingTime' },
      { design: 'periodSports' },
      { design: 'periodIcons', layout: 'days' },
      { design: 'periodCards' },
      { design: 'periodRoutes', layout: 'grid' },
      { design: 'periodRoutes', layout: 'overlay' },
      { design: 'quote', quote: QUOTES[0] },
      { design: 'verse', verse: VERSES[0] },
      { design: 'periodSentence' },
      { design: 'periodEquivalences', layout: 'dark' },
      { design: 'periodEquivalences', layout: 'light' },
      { design: 'periodPlaylist', layout: 'dark', cover: 'red' },
      { design: 'periodPlaylist', layout: 'dark', cover: 'ink' },
      { design: 'periodPlaylist', layout: 'light', cover: 'red' },
      { design: 'periodPlaylist', layout: 'light', cover: 'ink' },
      { design: 'periodWrapped', layout: 'dark', cover: 'red' },
      { design: 'periodWrapped', layout: 'dark', cover: 'ink' },
      { design: 'periodWrapped', layout: 'light', cover: 'red' },
      { design: 'periodWrapped', layout: 'light', cover: 'ink' },
      { design: 'periodNotes', layout: 'dark', rows: 'activities' },
      { design: 'periodNotes', layout: 'light', rows: 'activities' },
      { design: 'periodNotes', layout: 'dark', rows: 'buckets' },
      { design: 'periodNotes', layout: 'light', rows: 'buckets' },
      { design: 'periodWeather', layout: 'light' },
      { design: 'periodWeather', layout: 'dark' },
      { design: 'periodCalendar', layout: 'dark' },
      { design: 'periodCalendar', layout: 'light' },
      { design: 'periodStreak', layout: 'dark' },
      { design: 'periodStreak', layout: 'light' },
      { design: 'periodLaps', layout: 'board', cover: 'red' },
      { design: 'periodLaps', layout: 'board', cover: 'ink' },
      { design: 'periodLaps', layout: 'sheet', cover: 'red' },
      { design: 'periodLaps', layout: 'sheet', cover: 'ink' },
      { design: 'periodGrandPrix' },
      { design: 'periodReceipt' },
      { design: 'periodNutrition', label: 'facts', layout: 'light' },
      { design: 'periodNutrition', label: 'facts', layout: 'dark' },
      { design: 'periodNutrition', label: 'table', layout: 'light' },
      { design: 'periodNutrition', label: 'table', layout: 'dark' },
      { design: 'periodBoardingPass', cover: 'red' },
      { design: 'periodBoardingPass', cover: 'ink' },
      { design: 'periodMetro', cover: 'red' },
      { design: 'periodMetro', cover: 'ink' },
    ]);
  });

  it('offers the total per sport, written and with icons, when the period mixes sports', () => {
    const blocks = summaryBlocks(summarize([run, ride], week));
    expect(blocks).toContainEqual({ design: 'periodSports' });
    expect(blocks).toContainEqual({ design: 'periodIcons', layout: 'sports' });
  });

  it('offers the total per sport with icons for one sport too, without a page of days', () => {
    const october = summaryBlocks(summarize([run], monthRange('2026-10-01')));
    expect(october).toContainEqual({ design: 'periodIcons', layout: 'sports' });
    // A week of one sport has its days with icons instead.
    expect(summaryBlocks(summarize([run], week))).not.toContainEqual({
      design: 'periodIcons',
      layout: 'sports',
    });
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
      { design: 'periodSports' },
      { design: 'periodIcons', layout: 'days' },
      { design: 'periodCards' },
      { design: 'periodRoutes', layout: 'grid' },
      // Without any route, its sport's icon in their place: the page isn't lost.
      { design: 'periodRoutes', layout: 'overlay' },
      { design: 'quote', quote: QUOTES[0] },
      { design: 'verse', verse: VERSES[0] },
      { design: 'periodSentence' },
      { design: 'periodEquivalences', layout: 'dark' },
      { design: 'periodEquivalences', layout: 'light' },
      { design: 'periodPlaylist', layout: 'dark', cover: 'red' },
      { design: 'periodPlaylist', layout: 'dark', cover: 'ink' },
      { design: 'periodPlaylist', layout: 'light', cover: 'red' },
      { design: 'periodPlaylist', layout: 'light', cover: 'ink' },
      { design: 'periodWrapped', layout: 'dark', cover: 'red' },
      { design: 'periodWrapped', layout: 'dark', cover: 'ink' },
      { design: 'periodWrapped', layout: 'light', cover: 'red' },
      { design: 'periodWrapped', layout: 'light', cover: 'ink' },
      { design: 'periodNotes', layout: 'dark', rows: 'activities' },
      { design: 'periodNotes', layout: 'light', rows: 'activities' },
      { design: 'periodNotes', layout: 'dark', rows: 'buckets' },
      { design: 'periodNotes', layout: 'light', rows: 'buckets' },
      { design: 'periodWeather', layout: 'light' },
      { design: 'periodWeather', layout: 'dark' },
      { design: 'periodCalendar', layout: 'dark' },
      { design: 'periodCalendar', layout: 'light' },
      { design: 'periodStreak', layout: 'dark' },
      { design: 'periodStreak', layout: 'light' },
      // Its laps by their calories.
      { design: 'periodLaps', layout: 'board', cover: 'red' },
      { design: 'periodLaps', layout: 'board', cover: 'ink' },
      { design: 'periodLaps', layout: 'sheet', cover: 'red' },
      { design: 'periodLaps', layout: 'sheet', cover: 'ink' },
      { design: 'periodGrandPrix' },
      { design: 'periodReceipt' },
      { design: 'periodNutrition', label: 'facts', layout: 'light' },
      { design: 'periodNutrition', label: 'facts', layout: 'dark' },
      { design: 'periodNutrition', label: 'table', layout: 'light' },
      { design: 'periodNutrition', label: 'table', layout: 'dark' },
      { design: 'periodBoardingPass', cover: 'red' },
      { design: 'periodBoardingPass', cover: 'ink' },
      { design: 'periodMetro', cover: 'red' },
      { design: 'periodMetro', cover: 'ink' },
    ]);
  });

  it("lists a week's activities in a note, and a longer period's weeks or months, however few", () => {
    const notes = (range: DateRange) =>
      summaryBlocks(summarize([run], range)).filter((block) => block.design === 'periodNotes');
    expect(notes(monthRange('2026-10-01'))).toEqual([
      { design: 'periodNotes', layout: 'dark', rows: 'buckets' },
      { design: 'periodNotes', layout: 'light', rows: 'buckets' },
    ]);
    expect(notes(yearRange('2026-01-01'))).toHaveLength(2);
    const crowded = Array.from({ length: MAX_NOTES_ACTIVITIES + 1 }, () => run);
    expect(listsNoteActivities(summarize(crowded, week))).toBe(false);
    expect(listsNoteActivities(summarize([run], week))).toBe(true);
  });

  it('shows the phrases and the replicas with the creative widgets, apart from the data ones', () => {
    expect(isSummaryDataWidget('periodCards')).toBe(true);
    expect(isSummaryDataWidget('quote')).toBe(false);
    expect(isSummaryDataWidget('periodNotes')).toBe(false);
    // Only a replica keeps its app's look.
    expect(isSummaryReplica('periodNotes')).toBe(true);
    expect(isSummaryReplica('periodSentence')).toBe(true);
    expect(isSummaryReplica('periodPlaylist')).toBe(true);
    expect(isSummaryReplica('periodWrapped')).toBe(true);
    expect(isSummaryReplica('periodLaps')).toBe(true);
    expect(isSummaryReplica('periodGrandPrix')).toBe(true);
    expect(isSummaryReplica('periodReceipt')).toBe(true);
    expect(isSummaryReplica('periodBoardingPass')).toBe(true);
    expect(isSummaryReplica('periodCalendar')).toBe(true);
    expect(isSummaryReplica('periodStreak')).toBe(true);
    expect(isSummaryReplica('periodWeather')).toBe(true);
    expect(isSummaryReplica('periodNutrition')).toBe(true);
    expect(isSummaryReplica('periodMetro')).toBe(true);
    expect(isSummaryReplica('periodEquivalences')).toBe(true);
    expect(isSummaryReplica('verse')).toBe(false);
  });

  it('offers nothing for a period without activities', () => {
    expect(summaryBlocks(summarize([], week))).toEqual([]);
  });
});

describe('periodSentencePlan', () => {
  const run = makeActivity({ sportType: 'Run', localDate: '2026-10-13' });
  const ride = makeActivity({ sportType: 'Ride', localDate: '2026-10-14' });
  const gym = makeActivity({
    sportType: 'WeightTraining',
    distanceMeters: 0,
    elevationGainMeters: 0,
    routePolyline: null,
    localDate: '2026-10-15',
  });

  it('opens with the distance by its sport and the time, then the activities, never the climbing', () => {
    expect(periodSentencePlan(summarize([run], week))).toEqual({
      lead: 'run',
      clauses: ['time', 'count'],
    });
  });

  it('says the distance alone when the period mixes sports, or its sport has no verb', () => {
    expect(periodSentencePlan(summarize([run, ride, gym], week)).lead).toBe('distance');
  });

  it('opens with the time alone without a distance', () => {
    expect(periodSentencePlan(summarize([gym], week))).toEqual({
      lead: 'training',
      clauses: ['count'],
    });
  });
});

describe('playlistSongs', () => {
  const run = (day: number, minutes: number) =>
    makeActivity({
      sportType: 'Run',
      localDate: `2026-10-${String(day).padStart(2, '0')}`,
      startLocal: `2026-10-${String(day).padStart(2, '0')}T08:00:00`,
      movingTimeSeconds: minutes * 60,
    });

  it("lists a week's activities, oldest first", () => {
    const week = [run(15, 30), run(13, 50), run(14, 40)];
    const { songs, top } = playlistSongs(summarize(week, weekRange('2026-10-14')), week);
    expect(songs.map((song) => song.localDate)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15']);
    expect(top).toBe(false);
  });

  it("lists a month's longest in time, longest first, and says so when it leaves some out", () => {
    const month = Array.from({ length: PLAYLIST_TOP + 2 }, (_, i) => run(i + 1, 20 + i));
    const { songs, top } = playlistSongs(summarize(month, monthRange('2026-10-01')), month);
    expect(songs).toHaveLength(PLAYLIST_TOP);
    expect(songs[0].movingTimeSeconds).toBe((20 + PLAYLIST_TOP + 1) * 60);
    expect(top).toBe(true);
    // A month of a few lists them all, still longest first, as all it has.
    const few = [run(3, 30), run(9, 50)];
    const all = playlistSongs(summarize(few, monthRange('2026-10-01')), few);
    expect(all.songs.map((song) => song.localDate)).toEqual(['2026-10-09', '2026-10-03']);
    expect(all.top).toBe(false);
  });
});

describe('periodWrapped', () => {
  const session = (sportType: string, minutes: number) =>
    makeActivity({ sportType, movingTimeSeconds: minutes * 60 });

  it('ranks the sports and the activities by time, and its families for the favorite', () => {
    const ride = session('Ride', 120);
    const runs = [session('Run', 70), session('Run', 60)];
    const trail = session('TrailRun', 80);
    const review = periodWrapped([...runs, ride, trail]);
    // The runs add up to more than the ride, which is the longest activity.
    expect(review.sports).toEqual(['roadRun', 'roadRide', 'trailRun']);
    expect(review.favorite).toBe('run');
    // A trail run is a run: with it, the runs outweigh a ride that tops the sports.
    const long = session('Ride', 100);
    const mixed = periodWrapped([long, session('Run', 60), session('TrailRun', 60)]);
    expect(mixed.sports[0]).toBe('roadRide');
    expect(mixed.favorite).toBe('run');
    expect(review.activities).toEqual([ride, trail, runs[0], runs[1]]);
    expect(review.minutes).toBe(330);
  });

  it(`lists ${WRAPPED_TOP} sports and activities at most`, () => {
    const types = ['Run', 'TrailRun', 'Ride', 'Walk', 'Hike', 'Swim', 'Workout'];
    const review = periodWrapped(types.map((type, i) => session(type, 10 + i)));
    expect(review.sports).toHaveLength(WRAPPED_TOP);
    expect(review.activities).toHaveLength(WRAPPED_TOP);
  });

  it('has nothing to review without activities', () => {
    expect(() => periodWrapped([])).toThrow(RangeError);
  });
});

describe('grandPrixActivities', () => {
  const run = (day: number, minutes: number) =>
    makeActivity({
      sportType: 'Run',
      localDate: `2026-10-${String(day).padStart(2, '0')}`,
      movingTimeSeconds: minutes * 60,
    });

  it("classifies a week's activities, longest first", () => {
    const week = [run(13, 30), run(14, 50), run(15, 40)];
    expect(
      grandPrixActivities(summarize(week, weekRange('2026-10-14')), week).map(
        (activity) => activity.movingTimeSeconds / 60,
      ),
    ).toEqual([50, 40, 30]);
  });

  it("classifies a month's longest only", () => {
    const month = Array.from({ length: GRAND_PRIX_TOP + 3 }, (_, i) => run(i + 1, 10 + i));
    const racers = grandPrixActivities(summarize(month, monthRange('2026-10-01')), month);
    expect(racers).toHaveLength(GRAND_PRIX_TOP);
    expect(racers[0].movingTimeSeconds).toBe((10 + GRAND_PRIX_TOP + 2) * 60);
  });
});

describe('mainFamily', () => {
  it('is the sport the period spent most time on', () => {
    const ride = makeActivity({ sportType: 'Ride', movingTimeSeconds: 7_200 });
    const runs = [1, 2].map(() => makeActivity({ sportType: 'Run', movingTimeSeconds: 3_000 }));
    expect(mainFamily([ride, ...runs])).toBe('ride');
    expect(mainFamily([...runs, ...runs, ride])).toBe('run');
  });
});

describe('noteActivities', () => {
  const run = (day: string, km: number) =>
    makeActivity({
      sportType: 'Run',
      localDate: `2026-10-${day}`,
      startLocal: `2026-10-${day}T08:00:00`,
      distanceMeters: km * 1000,
    });
  const gym = (day: string, minutes: number) =>
    makeActivity({
      sportType: 'WeightTraining',
      localDate: `2026-10-${day}`,
      startLocal: `2026-10-${day}T19:00:00`,
      distanceMeters: 0,
      movingTimeSeconds: minutes * 60,
    });

  it('lists the activities oldest first, the longest of each sport done twice highlighted', () => {
    const lines = noteActivities([run('15', 6), gym('14', 50), run('13', 11), gym('12', 30)]);
    expect(lines.map((line) => [line.activity.localDate, line.highlighted])).toEqual([
      ['2026-10-12', false],
      ['2026-10-13', true],
      ['2026-10-14', true],
      ['2026-10-15', false],
    ]);
  });

  it('highlights nothing of a sport done once', () => {
    expect(noteActivities([run('13', 11), gym('14', 50)]).some((line) => line.highlighted)).toBe(
      false,
    );
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

describe('calendarView', () => {
  it("draws a week's, a month's and a short range's days, and a year's months", () => {
    expect(calendarView(week)).toBe('days');
    // October 2026 starts on a Thursday and ends on a Saturday: 5 weeks; August 2026, 6.
    expect(calendarView(monthRange('2026-10-01'))).toBe('days');
    expect(calendarView(monthRange('2026-08-01'))).toBe('days');
    expect(calendarView(customRange('2026-09-01', '2026-10-11'))).toBe('days');
    expect(calendarView(customRange('2026-09-01', '2026-10-12'))).toBe('months');
    expect(calendarView(yearRange('2026-01-01'))).toBe('months');
  });

  it('draws nothing of a range touching more than 12 months', () => {
    expect(calendarView(customRange('2025-10-15', '2026-10-14'))).toBeNull();
    expect(
      summaryBlocks(
        summarize(
          [makeActivity({ sportType: 'Run', localDate: '2026-10-13' })],
          customRange('2025-10-15', '2026-10-14'),
        ),
      ).some((block) => block.design === 'periodCalendar'),
    ).toBe(false);
  });
});

describe('calendarWeeks', () => {
  it('draws whole weeks from Monday to Sunday around the period', () => {
    const weeks = calendarWeeks(monthRange('2026-10-01'));
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe('2026-09-28');
    expect(weeks[0][3]).toBe('2026-10-01');
    expect(weeks[4][6]).toBe('2026-11-01');
    expect(calendarWeeks(week)).toEqual([
      [
        '2026-10-12',
        '2026-10-13',
        '2026-10-14',
        '2026-10-15',
        '2026-10-16',
        '2026-10-17',
        '2026-10-18',
      ],
    ]);
  });
});

describe('calendarMonths', () => {
  it('lists the whole months a period touches', () => {
    expect(calendarMonths(yearRange('2026-01-01'))).toHaveLength(12);
    expect(calendarMonths(customRange('2026-08-20', '2026-10-05'))).toEqual([
      { start: '2026-08-01', end: '2026-08-31' },
      { start: '2026-09-01', end: '2026-09-30' },
      { start: '2026-10-01', end: '2026-10-31' },
    ]);
  });
});

describe('calendarFigures', () => {
  const run = (localDate: string, km: number) =>
    makeActivity({ sportType: 'Run', localDate, distanceMeters: km * 1000 });
  const gym = (localDate: string, minutes: number) =>
    makeActivity({
      sportType: 'WeightTraining',
      localDate,
      distanceMeters: 0,
      elevationGainMeters: 0,
      routePolyline: null,
      movingTimeSeconds: minutes * 60,
    });

  it("adds up each day's distance, a rest day's 0 and a gym day's sport", () => {
    const short = gym('2026-10-14', 30);
    const long = gym('2026-10-14', 60);
    const activities = [run('2026-10-12', 10), run('2026-10-12', 5), short, long];
    const figures = calendarFigures(summarize(activities, week), activities);
    expect(figures.size).toBe(7);
    expect(figures.get('2026-10-12')).toEqual({ kind: 'amount', amount: 15_000 });
    expect(figures.get('2026-10-13')).toEqual({ kind: 'amount', amount: 0 });
    // A gym day by its longest session, not as a rest day.
    expect(figures.get('2026-10-14')).toEqual({ kind: 'sport', activity: long });
  });

  it("adds up each day's time in a period without any distance", () => {
    const activities = [gym('2026-10-14', 30), gym('2026-10-14', 45)];
    const figures = calendarFigures(summarize(activities, week), activities);
    expect(figures.get('2026-10-14')).toEqual({ kind: 'amount', amount: 75 * 60 });
    expect(figures.get('2026-10-15')).toEqual({ kind: 'amount', amount: 0 });
  });
});

describe('periodStreak', () => {
  const on = (localDate: string) => makeActivity({ sportType: 'Run', localDate });

  it('counts the most days in a row with activities, twice on a day counting once', () => {
    const activities = [
      on('2026-10-12'),
      on('2026-10-14'),
      on('2026-10-15'),
      on('2026-10-15'),
      on('2026-10-16'),
      on('2026-10-18'),
    ];
    const streak = periodStreak(summarize(activities, week), activities);
    expect(streak.longest).toBe(3);
    expect(streak.activeDays).toBe(5);
    expect(streak.days).toBe(7);
    expect(streak.active.has('2026-10-13')).toBe(false);
  });

  it('counts only the days within the period', () => {
    const activities = [on('2026-10-11'), on('2026-10-12'), on('2026-10-13')];
    const streak = periodStreak(summarize(activities, week), activities);
    expect(streak.longest).toBe(2);
    expect(streak.activeDays).toBe(2);
  });
});

describe('streakStrip', () => {
  it("draws a week's days, a month's weeks and a year's months", () => {
    expect(streakStrip(week)).toBe('days');
    expect(streakStrip(monthRange('2026-10-01'))).toBe('weeks');
    expect(streakStrip(yearRange('2026-01-01'))).toBe('months');
    expect(streakStrip(customRange('2025-10-15', '2026-10-14'))).toBe('months');
  });
});

describe('weatherCondition', () => {
  it('reads sunnier the more of its days had activities', () => {
    expect(weatherCondition(7, 7)).toBe('sunny');
    expect(weatherCondition(6, 8)).toBe('sunny');
    expect(weatherCondition(4, 7)).toBe('partlyCloudy');
    expect(weatherCondition(2, 7)).toBe('mostlyCloudy');
    expect(weatherCondition(1, 7)).toBe('cloudy');
    expect(weatherCondition(78, 365)).toBe('cloudy');
  });
});

describe('ingredientShares', () => {
  it('lists its sports by their share of the time, most first', () => {
    const shares = ingredientShares([
      makeActivity({ sportType: 'Run', movingTimeSeconds: 3000 }),
      makeActivity({ sportType: 'Ride', movingTimeSeconds: 6000 }),
      makeActivity({ sportType: 'Run', movingTimeSeconds: 1000 }),
    ]);
    expect(shares).toEqual([
      { sport: 'roadRide', share: 0.6 },
      { sport: 'roadRun', share: 0.4 },
    ]);
  });

  it(`keeps its ${MAX_INGREDIENTS} main sports, and none without any time`, () => {
    const sports = ['Run', 'Ride', 'Swim', 'Walk', 'Hike', 'Yoga', 'Rowing'] as const;
    const shares = ingredientShares(
      sports.map((sportType, i) => makeActivity({ sportType, movingTimeSeconds: 1000 * (i + 1) })),
    );
    expect(shares).toHaveLength(MAX_INGREDIENTS);
    expect(shares[0].share).toBeGreaterThan(shares[MAX_INGREDIENTS - 1].share);
    expect(ingredientShares([makeActivity({ movingTimeSeconds: 0 })])).toEqual([]);
    expect(ingredientShares([])).toEqual([]);
  });
});

describe('metroLayout', () => {
  it(`runs across up to ${MAX_METRO_ACROSS} stations, and down beyond`, () => {
    expect(metroLayout(1)).toBe('across');
    expect(metroLayout(MAX_METRO_ACROSS)).toBe('across');
    expect(metroLayout(MAX_METRO_ACROSS + 1)).toBe('down');
    expect(metroLayout(12)).toBe('down');
  });
});

describe('metroStations', () => {
  const run = makeActivity({
    sportType: 'Run',
    localDate: '2026-10-13',
    distanceMeters: 10_000,
    movingTimeSeconds: 3000,
  });
  const gym = makeActivity({
    sportType: 'WeightTraining',
    localDate: '2026-10-15',
    distanceMeters: 0,
    movingTimeSeconds: 2700,
  });

  it("makes a station of each of a week's days, by how far it went and its main sport", () => {
    const activities = [run, gym];
    const stations = metroStations(summarize(activities, week), activities);
    expect(stations.map((station) => station.range.start)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(stations[0]).toMatchObject({ activityCount: 0, amount: 0, sport: null });
    expect(stations[1]).toMatchObject({ activityCount: 1, amount: 10_000, sport: 'run' });
    // A gym day in a period with a distance goes none: its sport stands for it.
    expect(stations[3]).toMatchObject({ activityCount: 1, amount: 0, sport: 'training' });
  });

  it('measures by time a period without any distance', () => {
    const stations = metroStations(summarize([gym], week), [gym]);
    expect(stations[3].amount).toBe(2700);
  });

  it("makes a station of each of a year's months", () => {
    const year = yearRange('2026-01-01');
    expect(metroStations(summarize([run], year), [run])).toHaveLength(12);
  });
});
