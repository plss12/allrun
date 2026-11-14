import { parseStravaZones } from './zones';

describe('parseStravaZones', () => {
  it('maps the heart rate zones as Strava counts them, an edge in the lower zone', () => {
    const json = {
      heart_rate: {
        custom_zones: false,
        zones: [
          { min: 0, max: 115 },
          { min: 115, max: 152 },
          { min: 152, max: -1 },
        ],
      },
      power: { zones: [] },
    };
    // As Strava writes an activity's time in them: 0–115, 116–152, 153 and over.
    expect(parseStravaZones(json)).toEqual([
      { min: 0, max: 115 },
      { min: 116, max: 152 },
      { min: 153, max: null },
    ]);
  });

  it('gives no zones for an athlete without them', () => {
    expect(parseStravaZones({})).toBeNull();
    expect(parseStravaZones({ heart_rate: { zones: [] } })).toBeNull();
  });

  it('rejects malformed or unordered zones', () => {
    expect(() => parseStravaZones({ heart_rate: { zones: [{ min: 'a', max: 1 }] } })).toThrow(
      /Invalid Strava zones/,
    );
    expect(() =>
      parseStravaZones({
        heart_rate: {
          zones: [
            { min: 120, max: 150 },
            { min: 100, max: -1 },
          ],
        },
      }),
    ).toThrow(/zone 2/);
  });
});
