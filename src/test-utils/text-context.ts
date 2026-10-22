import type { MetricUnit } from '@/core/metrics';
import type { TextContext } from '@/editor/editor-data';
import { es } from '@/i18n/locales/es';

/** Abbreviations of the units of a time written in words, as the Spanish app writes them. */
export const TEST_DURATION_UNITS: TextContext['durationUnits'] = {
  hours: 'h',
  minutes: 'min',
  seconds: 'seg',
};

/** Metric units as the Spanish app writes them ("ppm" for heart rate). */
export const testUnitLabel = (unit: MetricUnit): string => es.metricUnits[unit];
