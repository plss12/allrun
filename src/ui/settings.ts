import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { distanceUnit } from '@/core/profile';
import type { DistanceUnit } from '@/core/units';
import { useProfile } from '@/data/profile';
import { deviceDistanceUnit } from '@/i18n';

/**
 * Display preferences: the unit of distance the profile chose (the phone's region's with
 * "System") and the app's language. A design can still write its own (see `units`).
 */
export function useDisplaySettings(): { readonly unit: DistanceUnit; readonly locale: string } {
  const [phone] = useState(deviceDistanceUnit);
  const { distanceUnits } = useProfile();
  const { i18n } = useTranslation();
  return { unit: distanceUnit(distanceUnits, phone), locale: i18n.language };
}
