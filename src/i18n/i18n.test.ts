import { getLocales, type Locale } from 'expo-localization';

import { deviceDistanceUnit, deviceLanguage, i18n } from './index';

const locale = (
  languageCode: string,
  measurementSystem: Locale['measurementSystem'] = 'metric',
): Locale => ({
  languageTag: languageCode,
  languageCode,
  languageScriptCode: null,
  regionCode: null,
  languageRegionCode: null,
  currencyCode: null,
  currencySymbol: null,
  languageCurrencyCode: null,
  languageCurrencySymbol: null,
  decimalSeparator: '.',
  digitGroupingSeparator: ',',
  textDirection: 'ltr',
  measurementSystem,
  temperatureUnit: 'celsius',
});

// The i18n module reads the device locale when imported, so the mock needs a default.
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [locale('en')]),
}));

const mockLocales = (first: Locale, ...rest: Locale[]) =>
  jest.mocked(getLocales).mockReturnValue([first, ...rest]);

describe('deviceLanguage', () => {
  it('picks the first supported device language', () => {
    mockLocales(locale('de'), locale('es'));
    expect(deviceLanguage()).toBe('es');
  });

  it('falls back to English', () => {
    mockLocales(locale('fr'));
    expect(deviceLanguage()).toBe('en');
  });
});

describe('deviceDistanceUnit', () => {
  it('uses miles in the US and UK and kilometers elsewhere', () => {
    mockLocales(locale('en', 'us'));
    expect(deviceDistanceUnit()).toBe('mi');
    mockLocales(locale('en', 'uk'));
    expect(deviceDistanceUnit()).toBe('mi');
    mockLocales(locale('es', 'metric'));
    expect(deviceDistanceUnit()).toBe('km');
  });
});

describe('translations', () => {
  it('translates in both languages', async () => {
    await i18n.changeLanguage('es');
    expect(i18n.t('metrics.elevationGain')).toBe('Desnivel');
    await i18n.changeLanguage('en');
    expect(i18n.t('metrics.elevationGain')).toBe('Elevation gain');
  });
});
