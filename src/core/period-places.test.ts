import { makeActivity } from '@/test-utils/make-activity';

import { customRange, type LocalDate } from './dates';
import type { LatLng } from './geo';
import { MAX_PERIOD_PLACES, periodPlaces } from './period-places';
import { encodePolyline } from './polyline';

const OCTOBER = customRange('2026-10-01', '2026-10-31');

/** A short loop around `center`, about a kilometer across. */
const loopAt = ([lat, lng]: LatLng): LatLng[] => [
  [lat, lng],
  [lat + 0.005, lng],
  [lat + 0.005, lng + 0.006],
  [lat, lng],
];

const MADRID: LatLng = [40.41, -3.7];
const ANDUJAR: LatLng = [38.04, -4.05];
const VALENCIA: LatLng = [39.47, -0.37];

const run = (id: string, localDate: LocalDate, center: LatLng | null, km = 10) =>
  makeActivity({
    id,
    localDate,
    distanceMeters: km * 1000,
    routePolyline: center === null ? null : encodePolyline(loopAt(center)),
  });

describe('periodPlaces', () => {
  it('groups the routes by place, most activities first, each with its totals', () => {
    const places = periodPlaces(
      [
        run('v1', '2026-10-02', VALENCIA, 42),
        run('m1', '2026-10-03', MADRID),
        run('a1', '2026-10-04', ANDUJAR),
        run('m2', '2026-10-05', MADRID),
        run('a2', '2026-10-06', ANDUJAR),
        run('m3', '2026-10-07', MADRID),
        run('gym', '2026-10-08', null),
      ],
      OCTOBER,
    );
    expect(places.map((place) => place.activities.map((activity) => activity.id))).toEqual([
      ['m1', 'm2', 'm3'],
      ['a1', 'a2'],
      ['v1'],
    ]);
    expect(places[0].summary.activityCount).toBe(3);
    expect(places[0].summary.totalDistanceMeters).toBe(30_000);
    expect(places[0].summary.range).toEqual(OCTOBER);
    expect(places[0].routes).toHaveLength(3);
    expect(places[0].start[0]).toBeCloseTo(MADRID[0], 4);
    expect(places[2].summary.totalDistanceMeters).toBe(42_000);
  });

  it('breaks a tie by distance, then by the earliest', () => {
    const places = periodPlaces(
      [
        run('a', '2026-10-02', ANDUJAR, 5),
        run('m', '2026-10-03', MADRID, 20),
        run('v', '2026-10-01', VALENCIA, 5),
      ],
      OCTOBER,
    );
    expect(places.map((place) => place.activities[0].id)).toEqual(['m', 'v', 'a']);
  });

  it('leaves out what is out of the period, and finds no place without routes', () => {
    expect(periodPlaces([run('late', '2026-11-02', MADRID)], OCTOBER)).toEqual([]);
    expect(periodPlaces([run('gym', '2026-10-02', null)], OCTOBER)).toEqual([]);
    expect(periodPlaces([], OCTOBER)).toEqual([]);
  });

  it(`offers at most ${MAX_PERIOD_PLACES} places`, () => {
    const trips = Array.from({ length: MAX_PERIOD_PLACES + 3 }, (_, i) =>
      run(`trip-${i}`, '2026-10-10', [36 + i, -5 + i]),
    );
    expect(periodPlaces(trips, OCTOBER)).toHaveLength(MAX_PERIOD_PLACES);
  });
});
