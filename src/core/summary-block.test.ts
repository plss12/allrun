import { makeActivity } from '@/test-utils/make-activity';

import { customRange, type DateRange, monthRange, weekRange, yearRange } from './dates';
import { summarize } from './summary';
import {
  gridColumns,
  isSummaryDataWidget,
  isSummaryReplica,
  listsNoteActivities,
  MAX_NOTES_ACTIVITIES,
  mainFamily,
  noteActivities,
  periodSentencePlan,
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

  it('offers the period with one, two and three data, its tables and nothing per sport alone', () => {
    expect(summaryBlocks(summarize([run], week))).toEqual([
      { design: 'periodData', count: 1 },
      { design: 'periodData', count: 2 },
      { design: 'periodData', count: 3 },
      { design: 'periodTable', value: 'distance' },
      { design: 'periodTable', value: 'movingTime' },
      { design: 'periodIcons', layout: 'days' },
      { design: 'periodCards' },
      { design: 'periodRoutes', layout: 'grid' },
      { design: 'periodRoutes', layout: 'overlay' },
      { design: 'quote', quote: QUOTES[0] },
      { design: 'verse', verse: VERSES[0] },
      { design: 'periodSentence' },
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
      { design: 'periodCards' },
      { design: 'periodRoutes', layout: 'grid' },
      // Without any route, its sport's icon in their place: the page isn't lost.
      { design: 'periodRoutes', layout: 'overlay' },
      { design: 'quote', quote: QUOTES[0] },
      { design: 'verse', verse: VERSES[0] },
      { design: 'periodSentence' },
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
