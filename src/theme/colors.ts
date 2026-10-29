import { Color } from 'expo-router';
import { Platform } from 'react-native';

/**
 * iOS's dark mode colors as plain strings: the app is always dark (ADR 009). Android uses them
 * as they are, rather than its dynamic colors, which follow each phone's wallpaper: Skia (the
 * sports' icons) can't take a platform color, so with plain strings what it draws matches the
 * text next to it, and the app looks the same on every phone.
 */
const dark = {
  label: '#FFFFFF',
  secondaryLabel: 'rgba(235, 235, 245, 0.6)',
  tertiaryLabel: 'rgba(235, 235, 245, 0.3)',
  separator: 'rgba(84, 84, 88, 0.6)',
  systemBackground: '#000000',
  secondarySystemBackground: '#1C1C1E',
  tertiarySystemBackground: '#2C2C2E',
  systemRed: '#FF453A',
} as const;

/**
 * The app's colors: iOS's semantic ones, which also follow its accessibility settings (Increase
 * Contrast), and the same values, fixed, elsewhere.
 */
export const colors = {
  label: Platform.select({ ios: Color.ios.label, default: dark.label }),
  secondaryLabel: Platform.select({ ios: Color.ios.secondaryLabel, default: dark.secondaryLabel }),
  tertiaryLabel: Platform.select({ ios: Color.ios.tertiaryLabel, default: dark.tertiaryLabel }),
  separator: Platform.select({ ios: Color.ios.separator, default: dark.separator }),
  systemBackground: Platform.select({
    ios: Color.ios.systemBackground,
    default: dark.systemBackground,
  }),
  secondarySystemBackground: Platform.select({
    ios: Color.ios.secondarySystemBackground,
    default: dark.secondarySystemBackground,
  }),
  /** Controls laid on a `secondarySystemBackground` card. */
  tertiarySystemBackground: Platform.select({
    ios: Color.ios.tertiarySystemBackground,
    default: dark.tertiarySystemBackground,
  }),
  // Brand: Track Red. White text on it has a 4.7:1 contrast (WCAG AA for text and buttons).
  tint: '#C94A2E',
  onTint: '#ffffff',
  error: Platform.select({ ios: Color.ios.systemRed, default: dark.systemRed }),
};

/**
 * The labels' colors as plain strings, for what Skia draws on screen (the sports' icons): the
 * same as `colors`' labels on Android, and as iOS's in dark mode without Increase Contrast.
 */
export const darkLabelInk = {
  primary: dark.label,
  secondary: dark.secondaryLabel,
  tertiary: dark.tertiaryLabel,
} as const;
