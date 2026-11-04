/**
 * The measures of the editor's rows, in points, apart from its screen so a test can add them up: the
 * app is drawn for the narrowest phone it has to fit, and nothing may overlap on it.
 */

/** The narrowest screen the rows must fit: the usual width of a small Android phone. */
export const NARROWEST_SCREEN = 360;

/** Room between the screen's safe area and the floating controls. */
export const EDGE = 12;
/** The bottom row's buttons: the photo, "Aa", "+", save and export. */
export const BOTTOM_BUTTON_SIZE = 52;
/**
 * "+", the main thing to do, stands out by being wider, never taller: every button of the row is
 * as tall as the others.
 */
export const ADD_BUTTON_WIDTH = 84;
/** Room between the two buttons of each side of the bottom row. */
export const BOTTOM_PAIR_GAP = 8;

/** How wide the bottom row is at least: two pairs of buttons around "+", inside the edges. */
export function bottomRowWidth(): number {
  const pair = 2 * BOTTOM_BUTTON_SIZE + BOTTOM_PAIR_GAP;
  return 2 * EDGE + 2 * pair + ADD_BUTTON_WIDTH;
}
