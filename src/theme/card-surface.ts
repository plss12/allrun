import type { ViewStyle } from 'react-native';

/**
 * Width of a card's edge. It is inside the card: a pager in it is this much narrower on each side
 * than the card, and its pages must be too, or each page drifts off by twice it.
 */
export const CARD_BORDER = 1;

/**
 * The look of the app's cards (the activities, the summaries, the widgets of the gallery): a dark
 * surface lit from above, like the charts' fading areas, a faint edge and a soft shadow that lifts
 * it off the background. The app is always dark (ADR 009), so the colors are fixed.
 *
 * The shadow is drawn outside the card, so it shows even when the card clips its content.
 */
export function cardSurface(radius: number): ViewStyle {
  return {
    borderRadius: radius,
    borderCurve: 'continuous',
    experimental_backgroundImage: 'linear-gradient(180deg, #2F2F34 0%, #19191C 100%)',
    borderWidth: CARD_BORDER,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.5)',
  };
}
