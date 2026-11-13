import { athletePhoto, stravaAthleteSchema } from './athlete';

describe('athletePhoto', () => {
  it("takes the athlete's own photo", () => {
    const url = 'https://dgalywyr863hv.cloudfront.net/pictures/athletes/1/1/large.jpg';
    expect(athletePhoto(stravaAthleteSchema.parse({ id: 1, profile: url }))).toBe(url);
  });

  it("leaves out Strava's generic avatar and a missing photo", () => {
    expect(athletePhoto({ profile: 'avatar/athlete/large.png' })).toBeNull();
    expect(athletePhoto({ profile: null })).toBeNull();
    expect(athletePhoto(stravaAthleteSchema.parse({ id: 1 }))).toBeNull();
  });

  it('refuses an address that is not secure', () => {
    expect(athletePhoto({ profile: 'http://example.com/large.jpg' })).toBeNull();
  });
});
