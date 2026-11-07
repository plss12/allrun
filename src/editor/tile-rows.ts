/**
 * `items` in rows of `columns`, each taking `spanOf(item)` columns (at least one, at most a row), in
 * order: one that doesn't fit in what is left of its row starts the next, and the row stays short.
 * The first row has `taken` columns already taken (by a tile that isn't one of `items`, such as
 * the one that saves the current design), and is there even if nothing else fits in it. Time and
 * space O(n).
 */
export function packRows<T>(
  items: readonly T[],
  spanOf: (item: T) => number,
  columns: number,
  taken = 0,
): T[][] {
  const rows: T[][] = taken > 0 ? [[]] : [];
  let used = taken > 0 ? taken : columns;
  for (const item of items) {
    const span = Math.min(columns, Math.max(1, spanOf(item)));
    if (used + span > columns) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(item);
    used += span;
  }
  return rows;
}
