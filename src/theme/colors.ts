/**
 * The app's colors, as plain strings: the same on every phone, and what Skia draws (the icons)
 * matches the text next to it, which it couldn't with the platform's colors. The app is always dark
 * (ADR 009), so they are iOS's dark mode, fixed, and not Android's dynamic ones, which follow each
 * phone's wallpaper.
 */
export const colors = {
  label: '#FFFFFF',
  secondaryLabel: 'rgba(235, 235, 245, 0.6)',
  tertiaryLabel: 'rgba(235, 235, 245, 0.3)',
  separator: 'rgba(84, 84, 88, 0.6)',
  systemBackground: '#000000',
  secondarySystemBackground: '#1C1C1E',
  /** Controls laid on a `secondarySystemBackground` card. */
  tertiarySystemBackground: '#2C2C2E',
  // Brand: Track Red. White text on it has a 4.7:1 contrast (WCAG AA for text and buttons).
  tint: '#C94A2E',
  onTint: '#ffffff',
  error: '#FF453A',
} as const;
