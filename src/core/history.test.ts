import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  HISTORY_LIMIT,
  mapHistory,
  redo,
  undo,
} from './history';

describe('history', () => {
  it('undoes and redoes committed values in order', () => {
    let history = commit(commit(createHistory('a'), 'b'), 'c');
    history = undo(history);
    expect(history.present).toBe('b');
    history = undo(history);
    expect(history.present).toBe('a');
    expect(canUndo(history)).toBe(false);
    history = redo(history);
    expect(history.present).toBe('b');
    expect(canRedo(history)).toBe(true);
    history = redo(history);
    expect(history.present).toBe('c');
    expect(canRedo(history)).toBe(false);
  });

  it('clears the redo stack on a new change', () => {
    const history = commit(undo(commit(createHistory('a'), 'b')), 'c');
    expect(history.present).toBe('c');
    expect(canRedo(history)).toBe(false);
    expect(undo(history).present).toBe('a');
  });

  it('records nothing when the current value is committed again', () => {
    const value = { zoom: 1 };
    const history = createHistory(value);
    expect(commit(history, value)).toBe(history);
  });

  it('leaves the history unchanged when there is nothing to undo or redo', () => {
    const history = createHistory('a');
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it('keeps only the latest steps', () => {
    let history = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) {
      history = commit(history, i);
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]).toBe(10);
  });
});

describe('mapHistory', () => {
  const same = (a: string, b: string) => a === b;

  it('applies the change to every value', () => {
    const history = undo(commit(commit(createHistory('a'), 'b'), 'c'));
    const upper = mapHistory(history, (value) => value.toUpperCase(), same);
    expect(upper).toEqual({ past: ['A'], present: 'B', future: ['C'] });
  });

  it('drops the steps that the change made invisible', () => {
    // Values are "layout:framing"; resetting the framing leaves only the layout steps.
    let history = createHistory('L1:F1');
    for (const next of ['L1:F2', 'L2:F2', 'L2:F3', 'L3:F3', 'L3:F4']) {
      history = commit(history, next);
    }
    history = undo(undo(history));
    const reset = mapHistory(history, (value) => `${value.split(':')[0]}:F0`, same);
    // Present was L2:F3, with L3:F3 and L3:F4 still to redo.
    expect(reset).toEqual({ past: ['L1:F0'], present: 'L2:F0', future: ['L3:F0'] });
  });
});
