import { makeActivity } from '@/test-utils/make-activity';

import { formatPlace, startOf } from './place';
import { encodePolyline } from './polyline';

describe('startOf', () => {
  it("is the first point of the activity's route, and nothing without one", () => {
    const routePolyline = encodePolyline([
      [37.38283, -5.97317],
      [37.39, -5.98],
    ]);
    expect(startOf(makeActivity({ routePolyline }))).toEqual([37.38283, -5.97317]);
    expect(startOf(makeActivity({ routePolyline: null }))).toBeNull();
  });
});

describe('formatPlace', () => {
  const seville = { city: 'Sevilla', region: 'Andalucía', country: 'España' };

  it('writes the city alone, with its region or with its country', () => {
    expect(formatPlace(seville, 'city')).toBe('Sevilla');
    expect(formatPlace(seville, 'cityRegion')).toBe('Sevilla, Andalucía');
    expect(formatPlace(seville, 'cityCountry')).toBe('Sevilla, España');
  });

  it('never repeats a name, and leaves out unknown parts', () => {
    const madrid = { city: 'Madrid', region: 'Madrid', country: 'España' };
    expect(formatPlace(madrid, 'cityRegion')).toBe('Madrid');
    expect(formatPlace({ ...seville, country: null }, 'cityCountry')).toBe('Sevilla');
  });

  it('names a place without a city by its region, or by its country, or not at all', () => {
    expect(formatPlace({ ...seville, city: null }, 'city')).toBe('Andalucía');
    expect(formatPlace({ city: null, region: null, country: 'España' }, 'city')).toBe('España');
    expect(formatPlace({ city: null, region: null, country: null }, 'city')).toBeNull();
  });
});
