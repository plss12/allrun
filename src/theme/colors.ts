import { Color } from 'expo-router';
import { Platform } from 'react-native';

/** Native semantic colors: they follow light and dark mode and accessibility settings. */
export const colors = {
  label: Platform.select({
    ios: Color.ios.label,
    android: Color.android.dynamic.onSurface,
    default: '#000000',
  }),
  secondaryLabel: Platform.select({
    ios: Color.ios.secondaryLabel,
    android: Color.android.dynamic.onSurfaceVariant,
    default: '#3c3c43',
  }),
  tertiaryLabel: Platform.select({
    ios: Color.ios.tertiaryLabel,
    android: Color.android.dynamic.outline,
    default: '#48484a',
  }),
  separator: Platform.select({
    ios: Color.ios.separator,
    android: Color.android.dynamic.outlineVariant,
    default: '#c6c6c8',
  }),
  systemBackground: Platform.select({
    ios: Color.ios.systemBackground,
    android: Color.android.dynamic.surface,
    default: '#ffffff',
  }),
  secondarySystemBackground: Platform.select({
    ios: Color.ios.secondarySystemBackground,
    android: Color.android.dynamic.surfaceVariant,
    default: '#f2f2f7',
  }),
  /** Controls laid on a `secondarySystemBackground` card. */
  tertiarySystemBackground: Platform.select({
    ios: Color.ios.tertiarySystemBackground,
    android: Color.android.dynamic.surfaceContainerHighest,
    default: '#2c2c2e',
  }),
  // Brand: Track Red. White text on it has a 4.7:1 contrast (WCAG AA for text and buttons).
  tint: '#C94A2E',
  onTint: '#ffffff',
  error: Platform.select({
    ios: Color.ios.systemRed,
    android: Color.android.dynamic.error,
    default: '#ff3b30',
  }),
};
