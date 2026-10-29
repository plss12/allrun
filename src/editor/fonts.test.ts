import { FONT_IDS } from '@/core/template';

import { CAP_HEIGHTS, hasBold, lettersExtent, looksBold } from './fonts';

// Only the measures are tested: the font loading hooks need the native modules.
jest.mock('@shopify/react-native-skia', () => ({ useFonts: jest.fn() }));
jest.mock('expo-font', () => ({ useFonts: jest.fn() }));

describe('lettersExtent', () => {
  it('rises to the capitals in capitals and figures, with nothing under the baseline', () => {
    expect(lettersExtent('11.34 KM', 'inter')).toEqual({ top: CAP_HEIGHTS.inter, descent: 0 });
  });

  it('rises to the ascenders with small letters, and to their marks with accents or dots', () => {
    const km = lettersExtent('11.34 km', 'inter').top ?? 0;
    const marked = lettersExtent('Mié', 'inter').top ?? 0;
    expect(km).toBeGreaterThan(CAP_HEIGHTS.inter);
    expect(marked).toBeGreaterThan(km);
    expect(lettersExtent('1h 5min', 'inter').top).toBe(marked);
  });

  it('keeps the line of an accented capital, whose accent rises over the rest', () => {
    expect(lettersExtent('MIÉRCOLES', 'inter').top).toBeNull();
  });

  it('goes under the baseline only with small letters that do, and not in small capitals', () => {
    expect(lettersExtent('150 ppm', 'inter').descent).toBeGreaterThan(0);
    expect(lettersExtent('150 PPM', 'inter').descent).toBe(0);
    expect(lettersExtent('150 ppm', 'bowlbyOneSC').descent).toBe(0);
  });
});

describe('looksBold', () => {
  it('follows the option in fonts with a bold face', () => {
    expect(looksBold('inter', true)).toBe(true);
    expect(looksBold('inter', false)).toBe(false);
  });

  it('is always on in heavy fonts without one, and off in light ones, whatever was asked', () => {
    for (const font of [
      'bangers',
      'permanentMarker',
      'anton',
      'bowlbyOneSC',
      'rubikGlitch',
    ] as const) {
      expect([font, looksBold(font, false)]).toEqual([font, true]);
    }
    for (const font of ['graduate', 'sacramento'] as const) {
      expect([font, looksBold(font, true)]).toEqual([font, false]);
    }
  });

  it('knows every font without a bold face as heavy or light', () => {
    const without = FONT_IDS.filter((font) => !hasBold(font));
    expect(new Set(without)).toEqual(
      new Set([
        'bangers',
        'permanentMarker',
        'anton',
        'bowlbyOneSC',
        'rubikGlitch',
        'graduate',
        'sacramento',
      ]),
    );
  });
});
