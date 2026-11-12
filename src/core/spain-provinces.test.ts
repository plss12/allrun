import { normalizePlaceName, SPANISH_PROVINCE_COUNT, spanishProvince } from './spain-provinces';

describe('spanishProvince', () => {
  it('has the 50 provinces and the 2 autonomous cities', () => {
    expect(SPANISH_PROVINCE_COUNT).toBe(52);
  });

  it('finds the first name that is a province, and its community', () => {
    expect(spanishProvince(null, 'Andalucía', 'Jaén')).toEqual({
      province: 'Jaén',
      community: 'Andalucía',
    });
    expect(spanishProvince('Lérida')).toEqual({ province: 'Lleida', community: 'Cataluña' });
  });

  it('is null for a name that is no province', () => {
    expect(spanishProvince('Andalucía', null)).toBeNull();
    expect(spanishProvince()).toBeNull();
  });
});

describe('normalizePlaceName', () => {
  it('drops accents, case and a province prefix', () => {
    expect(normalizePlaceName('Provincia de Ávila')).toBe('avila');
    expect(normalizePlaceName('Province of Cádiz ')).toBe('cadiz');
    expect(normalizePlaceName('A Coruña')).toBe('a coruna');
  });
});
