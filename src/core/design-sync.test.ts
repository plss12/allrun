import { makeActivity } from '@/test-utils/make-activity';

import { defaultActivityTemplate } from './default-layout';
import {
  afterPush,
  applyPull,
  compareServerTimes,
  newJournal,
  parseDesignRows,
  parseSyncJournal,
  pushOf,
  type RemoteDesign,
  withChange,
} from './design-sync';
import { saveDesign } from './user-templates';

const story = defaultActivityTemplate(makeActivity(), 'story');
const design = (id: string, savedAt = '2026-11-12T10:00:00.000Z') => saveDesign(story, id, savedAt);
const NOW = '2026-11-12T12:00:00.000Z';

/** A row as the Data API returns it. */
const row = (id: string, updatedAt: string, deleted = false) => ({
  id,
  template: deleted ? null : design(id).template,
  saved_at: '2026-11-12T10:00:00+00:00',
  updated_at: updatedAt,
  deleted,
});

describe('the journal', () => {
  it('sends the designs saved before accounts to the first account on the phone', () => {
    const journal = newJournal('user-1', ['a', 'b']);
    expect(journal.cursor).toBeNull();
    expect(Object.keys(journal.pending)).toEqual(['a', 'b']);
    expect(Object.values(journal.pending).map(({ change }) => change)).toEqual(['save', 'save']);
  });

  it('keeps only the last change of a design', () => {
    const journal = withChange(withChange(newJournal('user-1', []), 'a', 'save'), 'a', 'delete');
    expect(journal.pending.a.change).toBe('delete');
    expect(Object.keys(journal.pending)).toEqual(['a']);
  });

  it('reads back what it wrote, and refuses a damaged one', () => {
    const journal = withChange(newJournal('user-1', ['a']), 'b', 'delete');
    expect(parseSyncJournal(JSON.parse(JSON.stringify(journal)))).toEqual(journal);
    expect(() => parseSyncJournal({ userId: 'user-1', pending: {} })).toThrow(/cursor/);
  });
});

describe('sending', () => {
  it('sends a saved design whole and a deleted one as a mark', () => {
    const journal = withChange(withChange(newJournal('user-1', []), 'a', 'save'), 'b', 'delete');
    const push = pushOf(journal, [design('a')], NOW);
    expect(push.rows).toEqual([
      { id: 'a', template: design('a').template, saved_at: design('a').savedAt, deleted: false },
      { id: 'b', template: null, saved_at: NOW, deleted: true },
    ]);
  });

  it('leaves out a design marked saved that is no longer on the phone', () => {
    const journal = withChange(newJournal('user-1', []), 'gone', 'save');
    expect(pushOf(journal, [], NOW).rows).toEqual([]);
  });

  it('clears what was sent, but keeps a change made again while sending', () => {
    let journal = withChange(withChange(newJournal('user-1', []), 'a', 'save'), 'b', 'save');
    const push = pushOf(journal, [design('a'), design('b')], NOW);
    // Saved again while the push was on its way: its new version still has to go.
    journal = withChange(journal, 'b', 'save');
    const after = afterPush(journal, push);
    expect(Object.keys(after.pending)).toEqual(['b']);
  });
});

describe('reading the rows', () => {
  it('keeps the valid rows and reports the others', () => {
    const { designs, invalid } = parseDesignRows([
      row('a', '2026-11-12T11:00:00.123456+00:00'),
      row('b', '2026-11-12T11:00:01+00:00', true),
      { ...row('c', '2026-11-12T11:00:02+00:00'), template: { version: 99 } },
      { nonsense: true },
    ]);
    expect(designs.map(({ id, saved }) => [id, saved === null])).toEqual([
      ['a', false],
      ['b', true],
    ]);
    expect(designs[0].saved?.savedAt).toBe('2026-11-12T10:00:00.000Z');
    expect(invalid.map(({ id }) => id)).toEqual(['c', null]);
  });

  it('refuses a row whose template is another design', () => {
    const { invalid } = parseDesignRows([{ ...row('a', '2026-11-12T11:00:00+00:00'), id: 'z' }]);
    expect(invalid).toHaveLength(1);
  });

  it('refuses an answer that is not a list', () => {
    expect(() => parseDesignRows({ message: 'error' })).toThrow(/list/);
  });
});

describe('the server times', () => {
  it('order to the microsecond, whatever digits they show', () => {
    expect(
      compareServerTimes('2026-11-12T11:00:00.000002+00:00', '2026-11-12T11:00:00.000001+00:00'),
    ).toBeGreaterThan(0);
    expect(
      compareServerTimes('2026-11-12T11:00:00.1+00:00', '2026-11-12T11:00:00.100000+00:00'),
    ).toBe(0);
    expect(
      compareServerTimes('2026-11-12T11:00:00+00:00', '2026-11-12T11:00:00.5+00:00'),
    ).toBeLessThan(0);
  });
});

describe('keeping what came back', () => {
  const remote = (id: string, updatedAt: string, deleted = false): RemoteDesign => ({
    id,
    saved: deleted ? null : design(id),
    updatedAt,
  });

  it('keeps the saved designs, deletes the marked ones and moves the cursor to the latest', () => {
    const result = applyPull(newJournal('user-1', []), [
      remote('a', '2026-11-12T11:00:02+00:00'),
      remote('b', '2026-11-12T11:00:03.000001+00:00', true),
      remote('c', '2026-11-12T11:00:01+00:00'),
    ]);
    expect(result.save.map(({ template }) => template.id)).toEqual(['a', 'c']);
    expect(result.remove).toEqual(['b']);
    expect(result.journal.cursor).toBe('2026-11-12T11:00:03.000001+00:00');
  });

  it("keeps the phone's version of a design it changed and hasn't sent", () => {
    const journal = withChange(newJournal('user-1', []), 'a', 'delete');
    const result = applyPull(journal, [remote('a', '2026-11-12T11:00:00+00:00')]);
    expect(result.save).toEqual([]);
    expect(result.remove).toEqual([]);
    // The cursor still moves: that row is behind the phone's own change.
    expect(result.journal.cursor).toBe('2026-11-12T11:00:00+00:00');
  });

  it('never moves the cursor back', () => {
    const journal = { ...newJournal('user-1', []), cursor: '2026-11-12T12:00:00+00:00' };
    expect(applyPull(journal, [remote('a', '2026-11-12T11:00:00+00:00')]).journal.cursor).toBe(
      '2026-11-12T12:00:00+00:00',
    );
  });
});
