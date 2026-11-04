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

describe('mapHistory', () => {
  const upper = (value: string) => value.toUpperCase();

  it('changes every value without a step, so undoing and redoing keep the change', () => {
    const history = undo(commit(commit(createHistory('a'), 'b'), 'c'));
    const changed = mapHistory(history, upper);
    expect(changed).toEqual({ past: ['A'], present: 'B', future: ['C'] });
    expect(undo(changed).present).toBe('A');
    expect(redo(changed).present).toBe('C');
  });

  it('adds nothing to undo', () => {
    expect(canUndo(mapHistory(createHistory('a'), upper))).toBe(false);
  });

  it('returns the history itself when the current value stays', () => {
    const history = createHistory('A');
    expect(mapHistory(history, upper)).toBe(history);
  });
});

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
