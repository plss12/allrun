import { FAMILY_OF_MODALITY, modalityOfStravaType } from './sports';

describe('modalityOfStravaType', () => {
  it.each([
    ['Run', 'roadRun', 'run'],
    ['TrailRun', 'trailRun', 'run'],
    ['VirtualRun', 'treadmillRun', 'run'],
    ['Walk', 'walk', 'other'],
    ['Hike', 'hike', 'other'],
    ['Ride', 'roadRide', 'ride'],
    ['MountainBikeRide', 'mountainBikeRide', 'ride'],
    ['GravelRide', 'gravelRide', 'ride'],
    ['EBikeRide', 'eBikeRide', 'ride'],
    ['EMountainBikeRide', 'eBikeRide', 'ride'],
    ['VirtualRide', 'indoorRide', 'ride'],
    ['Swim', 'swim', 'swim'],
    ['WeightTraining', 'workout', 'training'],
    ['Crossfit', 'workout', 'training'],
    ['Workout', 'workout', 'training'],
    ['HighIntensityIntervalTraining', 'workout', 'training'],
    ['Yoga', 'workout', 'training'],
    ['Pilates', 'workout', 'training'],
    ['Elliptical', 'workout', 'training'],
    ['StairStepper', 'workout', 'training'],
  ] as const)('maps %s to the %s modality in the %s family', (sportType, modality, family) => {
    expect(modalityOfStravaType(sportType)).toBe(modality);
    expect(FAMILY_OF_MODALITY[modalityOfStravaType(sportType)]).toBe(family);
  });

  it('falls back to the generic modality for other or unknown sport types', () => {
    expect(modalityOfStravaType('RockClimbing')).toBe('other');
    expect(modalityOfStravaType('Golf')).toBe('other');
    expect(modalityOfStravaType('SomethingStravaAddsTomorrow')).toBe('other');
  });
});
