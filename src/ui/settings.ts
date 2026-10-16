import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DistanceUnit } from '@/core/units';
import { deviceDistanceUnit } from '@/i18n';

/**
 * Display preferences. They follow the device for now; a settings screen can override them
 * later without touching the callers.
 */
export function useDisplaySettings(): { readonly unit: DistanceUnit; readonly locale: string } {
  const [unit] = useState(deviceDistanceUnit);
  const { i18n } = useTranslation();
  return { unit, locale: i18n.language };
}
