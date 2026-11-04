/** Room each side of the tabs must leave: the round button beside them, its margin and a gap. */
const ROOM_BESIDE_TABS = 8 + 46 + 4;

/**
 * How wide the top bar's tabs are: as `wanted`, or less on a screen where they would reach the
 * buttons beside them. They stay in the middle of the screen, so both sides count.
 */
export function tabsWidth(wanted: number, screenWidth: number): number {
  return Math.min(wanted, screenWidth - 2 * ROOM_BESIDE_TABS);
}
