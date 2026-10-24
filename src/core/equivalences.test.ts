import { EQUIVALENCES, equivalences } from './equivalences';

describe('equivalences', () => {
  it('compares each measure with the biggest thing it reaches at least once', () => {
    expect(
      equivalences({ distance: 94_230, elevation: 1_099, time: 26_280, calories: 4_501 }),
    ).toEqual([
      { measure: 'distance', reference: 'madridToledo', times: 94_230 / 72_000, amount: 94_230 },
      { measure: 'elevation', reference: 'burjKhalifa', times: 1_099 / 828, amount: 1_099 },
      { measure: 'time', reference: 'godfather', times: 26_280 / 10_500, amount: 26_280 },
      { measure: 'calories', reference: 'pizza', times: 4_501 / 2_000, amount: 4_501 },
    ]);
  });

  it('counts a short run in laps of a track, and a year round the world', () => {
    expect(equivalences({ distance: 11_340, elevation: null, time: null, calories: null })).toEqual(
      [{ measure: 'distance', reference: 'track', times: 11_340 / 400, amount: 11_340 }],
    );
    const [year] = equivalences({ distance: 45_000_000, elevation: 0, time: 0, calories: 0 });
    expect(year.reference).toBe('earth');
  });

  it('leaves out a measure there is none of, or too little of to reach anything', () => {
    expect(equivalences({ distance: 0, elevation: 2, time: 3_000, calories: null })).toEqual([
      { measure: 'time', reference: 'song', times: 3_000 / 210, amount: 3_000 },
    ]);
    expect(equivalences({ distance: null, elevation: null, time: 100, calories: 50 })).toEqual([]);
  });

  it('takes a thing it reaches exactly', () => {
    const [marathon] = equivalences({
      distance: EQUIVALENCES.marathon.amount,
      elevation: null,
      time: null,
      calories: null,
    });
    expect(marathon).toMatchObject({ reference: 'marathon', times: 1 });
  });
});
