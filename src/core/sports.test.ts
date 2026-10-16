import { sportGroupOf } from './sports';

describe('sportGroupOf', () => {
  it.each([
    ['Run', 'run'],
    ['TrailRun', 'run'],
    ['VirtualRun', 'run'],
    ['Ride', 'ride'],
    ['GravelRide', 'ride'],
    ['VirtualRide', 'ride'],
    ['Hike', 'walk'],
    ['Walk', 'walk'],
    ['Swim', 'swim'],
  ])('maps %s to %s', (sportType, group) => {
    expect(sportGroupOf(sportType)).toBe(group);
  });

  it('falls back to the generic group for other or unknown sport types', () => {
    expect(sportGroupOf('WeightTraining')).toBe('other');
    expect(sportGroupOf('Crossfit')).toBe('other');
    expect(sportGroupOf('SomethingStravaAddsTomorrow')).toBe('other');
  });
});
