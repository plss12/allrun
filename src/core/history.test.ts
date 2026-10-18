import { canRedo, canUndo, commit, createHistory, HISTORY_LIMIT, redo, undo } from './history';

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
