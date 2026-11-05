import type { ViewStyle } from 'react-native';

/**
 * Width of a card's edge. It is inside the card: a pager in it is this much narrower on each side
 * than the card, and its pages must be too, or each page drifts off by twice it.
 */
export const CARD_BORDER = 1;

/** The cards' surface, lit from above, and their faint edge. */
export const CARD_GRADIENT_COLORS = ['#2F2F34', '#19191C'] as const;
const CARD_GRADIENT = 'linear-gradient(180deg, #2F2F34 0%, #19191C 100%)';
/** Halfway through the gradient: what a card shows until its `CardGradient` is drawn. */
const CARD_FLAT = '#242428';
export const CARD_EDGE = 'rgba(255, 255, 255, 0.08)';

/**
 * The look of the app's cards in a list that scrolls (the activities, the summaries, the widgets of
 * the gallery): a dark surface with a faint edge, lit from above by the `CardGradient` that goes
 * inside. The app is always dark (ADR 009), so the colors are fixed.
 *
 * No shadow, invisible on the black background, and no `overflow: 'hidden'` in these cards: on a
 * Samsung M32, a blurred shadow and a clip per card made a frame take twice as long while scrolling.
 */
export function cardSurface(radius: number): ViewStyle {
  return {
    borderRadius: radius,
    borderCurve: 'continuous',
    backgroundColor: CARD_FLAT,
    borderWidth: CARD_BORDER,
    borderColor: CARD_EDGE,
  };
}

/** The same card with its gradient in a single view: for a few at a time, not for a long list. */
export function smallCardSurface(radius: number): ViewStyle {
  return { ...cardSurface(radius), experimental_backgroundImage: CARD_GRADIENT };
}

/** A button whose menu is open: the same surface, lit a little more. */
const SELECTED_GRADIENT = 'linear-gradient(180deg, #4A4A52 0%, #2F2F34 100%)';

/**
 * The surface of what floats over the screen (the editor's controls and panels, the home's
 * filter): the cards' dark grey lit from above, with their faint edge, so it stands out from the
 * black background and from any photo, and the app keeps one look. No shadow: it floats over
 * photos, where one would only muddy them.
 *
 * The edge is an inset shadow over the gradient, not a border: the gradient isn't painted under
 * a border, so a see-through one showed what is behind (black, or the photo), darker than the
 * gradient's lit top, and small round buttons looked cut off at the top. It takes no room either.
 */
export function floatingSurface(radius: number, selected = false): ViewStyle {
  return {
    borderRadius: radius,
    borderCurve: 'continuous',
    experimental_backgroundImage: selected ? SELECTED_GRADIENT : CARD_GRADIENT,
    boxShadow: `inset 0 0 0 1px ${CARD_EDGE}`,
  };
}

/**
 * The floating surface of something round, `height` tall: a round button, a pill, the size
 * slider. Its ends are circular: iOS's continuous corners don't draw a full round, and the
 * gradient and the edge parted at the top, which looked cut off.
 */
export function roundSurface(height: number, selected = false): ViewStyle {
  return { ...floatingSurface(height / 2, selected), borderCurve: 'circular' };
}
