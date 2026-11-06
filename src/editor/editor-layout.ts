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

/** The floating panel under the canvas (`Dock`): its room to the screen's sides, and inside it. */
export const DOCK_EDGE = EDGE / 2;
export const DOCK_PADDING = 10;
/** A row of action tiles in the panel (exporting, the photo's tools): how many, and their room. */
export const ACTION_TILES_PER_ROW = 4;
export const ACTION_TILE_GAP = 6;
export const ACTION_TILE_PADDING = 2;

/** How wide a tile's label can be on the narrowest phone, in points. */
export function actionLabelWidth(): number {
  const row = NARROWEST_SCREEN - 2 * DOCK_EDGE - 2 * DOCK_PADDING;
  const tile = (row - (ACTION_TILES_PER_ROW - 1) * ACTION_TILE_GAP) / ACTION_TILES_PER_ROW;
  return tile - 2 * ACTION_TILE_PADDING;
}

/**
 * The size of the labels of a row of tiles, the same for the whole row so that it stays even,
 * chosen by the longest of every label it may show (a tile that turns "Save" into "Saved" doesn't
 * change size). Text never shrinks itself to fit: on Android it shrank even when it fit, and left
 * the text off center (ADR 014). A test measures every row with the real font on the narrowest
 * phone. Time O(l) for l labels.
 */
export function actionLabelSize(labels: readonly string[]): number {
  const longest = Math.max(0, ...labels.map((label) => label.length));
  return longest <= 9 ? 12 : longest <= 11 ? 11 : 10;
}

/** How wide the bottom row is at least: two pairs of buttons around "+", inside the edges. */
export function bottomRowWidth(): number {
  const pair = 2 * BOTTOM_BUTTON_SIZE + BOTTOM_PAIR_GAP;
  return 2 * EDGE + 2 * pair + ADD_BUTTON_WIDTH;
}
