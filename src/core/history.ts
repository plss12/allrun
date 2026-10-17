/**
 * Undo/redo history of an immutable value: the classic past/present/future stacks. Every
 * change is committed as a whole new value, so undoing is just swapping which value is current.
 */
export interface History<T> {
  /** Earlier values, oldest first. */
  readonly past: readonly T[];
  readonly present: T;
  /** Undone values, the next one to redo first. */
  readonly future: readonly T[];
}

/** How many steps can be undone; older ones are dropped. */
export const HISTORY_LIMIT = 100;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Makes `next` the current value. The redo stack is cleared, since it no longer follows from the
 * current value. Committing the current value itself (same reference) records nothing, so callers
 * can commit after every gesture without checking whether anything changed. Time and space
 * O(`HISTORY_LIMIT`).
 */
export function commit<T>(history: History<T>, next: T): History<T> {
  if (Object.is(next, history.present)) {
    return history;
  }
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

/** Goes back one step; unchanged when there is nothing to undo. */
export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) {
    return history;
  }
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  };
}

/** Goes forward one undone step; unchanged when there is nothing to redo. */
export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) {
    return history;
  }
  const [next, ...rest] = history.future;
  return { past: [...history.past, history.present], present: next, future: rest };
}

/**
 * Applies `change` to every value in the history (for a change that can't be undone, such as
 * replacing the photo), then drops the steps it made equal to their neighbour, so that every
 * undo or redo still changes something visible. Time O(n) calls to `change` and `equal`, space
 * O(n), for n values in the history.
 */
export function mapHistory<T>(
  history: History<T>,
  change: (value: T) => T,
  equal: (a: T, b: T) => boolean,
): History<T> {
  const present = change(history.present);
  const past: T[] = [];
  for (const value of history.past) {
    const changed = change(value);
    if (past.length === 0 || !equal(past[past.length - 1], changed)) {
      past.push(changed);
    }
  }
  if (past.length > 0 && equal(past[past.length - 1], present)) {
    past.pop();
  }
  const future: T[] = [];
  let previous = present;
  for (const value of history.future) {
    const changed = change(value);
    if (!equal(previous, changed)) {
      future.push(changed);
      previous = changed;
    }
  }
  return { past, present, future };
}

export const canUndo = (history: History<unknown>): boolean => history.past.length > 0;
export const canRedo = (history: History<unknown>): boolean => history.future.length > 0;
