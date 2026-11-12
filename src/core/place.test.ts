import { makeActivity } from '@/test-utils/make-activity';

import { readyDesign } from './designs';
import { formatPlace, type GeocodedAddress, namesPlace, placeOfAddress, startOf } from './place';
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

describe('namesPlace', () => {
  const data = { mode: 'activity', activity: makeActivity() } as const;

  it('tells the designs that write the place from the others', () => {
    expect(namesPlace(readyDesign('polaroid', data, 'story').template.layers)).toBe(true);
    expect(namesPlace(readyDesign('margins', data, 'story').template.layers)).toBe(true);
    expect(namesPlace(readyDesign('crop', data, 'story').template.layers)).toBe(false);
    expect(namesPlace(readyDesign('messageOne', data, 'story').template.layers)).toBe(false);
  });
});

describe('placeOfAddress', () => {
  const address = (parts: Partial<GeocodedAddress>): GeocodedAddress => ({
    city: null,
    region: null,
    subregion: null,
    country: 'España',
    isoCountryCode: 'ES',
    ...parts,
  });

  it("names a Spanish town by its province, where Google's geocoder puts it", () => {
    expect(
      placeOfAddress(address({ city: 'Andújar', region: 'Andalucía', subregion: 'Jaén' })),
    ).toEqual({ city: 'Andújar', region: 'Jaén', country: 'España' });
  });

  it("and where Apple's puts it", () => {
    expect(placeOfAddress(address({ city: 'Andújar', region: 'Jaén' })).region).toBe('Jaén');
  });

  it('names a provincial capital by its community, so as not to say it twice', () => {
    expect(
      placeOfAddress(address({ city: 'Jaén', region: 'Andalucía', subregion: 'Jaén' })).region,
    ).toBe('Andalucía');
    expect(placeOfAddress(address({ city: 'Madrid', region: 'Madrid' })).region).toBe(
      'Comunidad de Madrid',
    );
  });

  it('writes the province the same whatever language or form the phone gives it in', () => {
    expect(
      placeOfAddress(address({ city: 'Dos Hermanas', subregion: 'Provincia de Sevilla' })).region,
    ).toBe('Sevilla');
    expect(placeOfAddress(address({ city: 'Utrera', region: 'Seville' })).region).toBe('Sevilla');
    expect(placeOfAddress(address({ city: 'Figueres', subregion: 'Gerona' })).region).toBe(
      'Girona',
    );
    expect(placeOfAddress(address({ city: 'Getxo', subregion: 'Bizkaia' })).region).toBe('Vizcaya');
  });

  it('knows a capital by its name in another language', () => {
    expect(
      placeOfAddress(address({ city: 'Seville', region: 'Andalusia', subregion: 'Seville' }))
        .region,
    ).toBe('Andalucía');
  });

  it('keeps what the geocoder gives when it names no province', () => {
    expect(placeOfAddress(address({ city: 'Andújar', region: 'Andalucía' })).region).toBe(
      'Andalucía',
    );
  });

  it('leaves other countries as the geocoder names them, not by their county', () => {
    expect(
      placeOfAddress({
        city: 'Boulder',
        region: 'Colorado',
        subregion: 'Boulder County',
        country: 'United States',
        isoCountryCode: 'US',
      }),
    ).toEqual({ city: 'Boulder', region: 'Colorado', country: 'United States' });
    expect(
      placeOfAddress({
        city: 'Lyon',
        region: 'Auvergne-Rhône-Alpes',
        subregion: 'Rhône',
        country: 'France',
        isoCountryCode: 'fr',
      }).region,
    ).toBe('Auvergne-Rhône-Alpes');
  });
});
