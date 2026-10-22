import { parseStravaZones } from './zones';

describe('parseStravaZones', () => {
  it('maps the heart rate zones, the last one without a top', () => {
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
    expect(parseStravaZones(json)).toEqual([
      { min: 0, max: 115 },
      { min: 115, max: 152 },
      { min: 152, max: null },
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
