import type { ViewStyle } from 'react-native';

/**
 * Width of a card's edge. It is inside the card: a pager in it is this much narrower on each side
 * than the card, and its pages must be too, or each page drifts off by twice it.
 */
export const CARD_BORDER = 1;

/** The cards' surface, lit from above, and their faint edge. */
export const CARD_GRADIENT = 'linear-gradient(180deg, #2F2F34 0%, #19191C 100%)';
export const CARD_EDGE = 'rgba(255, 255, 255, 0.08)';

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
    experimental_backgroundImage: CARD_GRADIENT,
    borderWidth: CARD_BORDER,
    borderColor: CARD_EDGE,
    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.5)',
  };
}

/** A button whose menu is open: the same surface, lit a little more. */
const SELECTED_GRADIENT = 'linear-gradient(180deg, #4A4A52 0%, #2F2F34 100%)';

/**
 * The surface of what floats over the screen (the editor's controls and panels, the home's
 * filter): the cards' dark grey lit from above, with their faint edge, so it stands out from the
 * black background and from any photo, and the app keeps one look. No shadow: it floats over
 * photos, where one would only muddy them.
 */
export function floatingSurface(radius: number, selected = false): ViewStyle {
  return {
    borderRadius: radius,
    borderCurve: 'continuous',
    experimental_backgroundImage: selected ? SELECTED_GRADIENT : CARD_GRADIENT,
    borderWidth: CARD_BORDER,
    borderColor: CARD_EDGE,
  };
}
