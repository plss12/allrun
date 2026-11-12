import { z } from 'zod';

import { parseSavedTemplate, type SavedTemplate } from './user-templates';

/**
 * Syncing the user's designs with their account (ADR 019), as pure steps: the phone keeps its
 * designs and a journal of what it changed since it last synced; a sync sends those changes, then
 * asks for every row changed since the last one it saw, and keeps them. The server stamps each
 * write, so the change that reaches it later wins, whatever the phones' clocks say, and a design a
 * phone changed and hasn't sent yet is kept over what comes back: it is the later change, on its
 * way. A delete travels as a mark.
 */

/** What the phone did to a design since it last sent it. */
export type PendingChange = 'save' | 'delete';

/** A change waiting to be sent, with the journal's revision when it was made. */
export interface PendingEntry {
  readonly change: PendingChange;
  readonly revision: number;
}

/** What the phone remembers between syncs, for one account. */
export interface SyncJournal {
  /** The account the phone's designs belong to. */
  readonly userId: string;
  /** The latest server time of the rows the phone has kept; `null` before the first pull. */
  readonly cursor: string | null;
  /** The changes not sent yet, by design id. */
  readonly pending: Readonly<Record<string, PendingEntry>>;
  /** Grows with every change, so that one made while a sync sends the same design is kept. */
  readonly revision: number;
}

const pendingEntrySchema = z.object({
  change: z.enum(['save', 'delete']),
  revision: z.number().int().nonnegative(),
});

export const syncJournalSchema = z.object({
  userId: z.string().min(1),
  cursor: z.string().nullable(),
  pending: z.record(z.string(), pendingEntrySchema),
  revision: z.number().int().nonnegative(),
});

/**
 * Validates a stored journal (raw JSON).
 *
 * @throws Error naming each invalid field.
 */
export function parseSyncJournal(json: unknown): SyncJournal {
  const result = syncJournalSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid sync journal:\n${z.prettifyError(result.error)}`, {
      cause: result.error,
    });
  }
  return result.data;
}

/**
 * The journal of an account the phone hasn't synced yet: the designs already on the phone (saved
 * before accounts, ADR 019) go to it, as changes to send. Time O(n).
 */
export function newJournal(userId: string, localIds: readonly string[]): SyncJournal {
  const pending: Record<string, PendingEntry> = {};
  localIds.forEach((id, index) => {
    pending[id] = { change: 'save', revision: index + 1 };
  });
  return { userId, cursor: null, pending, revision: localIds.length };
}

/** The journal after the phone saved or deleted design `id`. Time O(p) for p pending changes. */
export function withChange(journal: SyncJournal, id: string, change: PendingChange): SyncJournal {
  const revision = journal.revision + 1;
  return { ...journal, revision, pending: { ...journal.pending, [id]: { change, revision } } };
}

/** A design as the phone sends it: the columns of `user_designs` it may write. */
export interface DesignRow {
  readonly id: string;
  readonly template: SavedTemplate['template'] | null;
  readonly saved_at: string;
  readonly deleted: boolean;
}

/** What a sync sends, and which revision of each change it was. */
export interface Push {
  readonly rows: readonly DesignRow[];
  readonly sent: Readonly<Record<string, number>>;
}

/**
 * The rows to send for the pending changes: a saved design as it is on the phone, a deleted one as
 * a mark stamped `now`. A design marked saved that is no longer on the phone is left out: nothing
 * of it is left to send. Time O(n + p) for n designs and p changes.
 */
export function pushOf(journal: SyncJournal, local: readonly SavedTemplate[], now: string): Push {
  const byId = new Map(local.map((saved) => [saved.template.id, saved]));
  const rows: DesignRow[] = [];
  const sent: Record<string, number> = {};
  for (const [id, { change, revision }] of Object.entries(journal.pending)) {
    if (change === 'delete') {
      rows.push({ id, template: null, saved_at: now, deleted: true });
      sent[id] = revision;
      continue;
    }
    const saved = byId.get(id);
    if (saved === undefined) {
      continue;
    }
    rows.push({ id, template: saved.template, saved_at: saved.savedAt, deleted: false });
    sent[id] = revision;
  }
  return { rows, sent };
}

/**
 * The journal once `push` reached the server: its changes are no longer pending, but for those
 * made again meanwhile, a later revision, which the next sync sends. Time O(p).
 */
export function afterPush(journal: SyncJournal, push: Push): SyncJournal {
  const pending: Record<string, PendingEntry> = {};
  for (const [id, entry] of Object.entries(journal.pending)) {
    if (push.sent[id] !== entry.revision) {
      pending[id] = entry;
    }
  }
  return { ...journal, pending };
}

/** A design as the server has it: saved (`saved`), or deleted (`null`), changed at `updatedAt`. */
export interface RemoteDesign {
  readonly id: string;
  readonly saved: SavedTemplate | null;
  readonly updatedAt: string;
}

/** A row of `user_designs` as the Data API returns it, before its template is checked. */
const designRowSchema = z.object({
  id: z.string().min(1),
  template: z.unknown(),
  saved_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  deleted: z.boolean(),
});

/** A row that could not be read: logged, and left out, as a damaged file on the phone is. */
export interface InvalidRow {
  readonly id: string | null;
  readonly error: Error;
}

/**
 * Validates the rows the server returned. A row whose template doesn't match the schema (written
 * by a newer version of the app, or damaged) is left out and reported; the others are kept. Time
 * O(n · s) for n rows of size s.
 *
 * @throws Error when the answer isn't a list at all.
 */
export function parseDesignRows(rows: unknown): {
  readonly designs: RemoteDesign[];
  readonly invalid: InvalidRow[];
} {
  if (!Array.isArray(rows)) {
    throw new Error('The designs table did not answer with a list');
  }
  const designs: RemoteDesign[] = [];
  const invalid: InvalidRow[] = [];
  for (const raw of rows as unknown[]) {
    const row = designRowSchema.safeParse(raw);
    if (!row.success) {
      const id = (raw as { id?: unknown } | null)?.id;
      invalid.push({
        id: typeof id === 'string' ? id : null,
        error: new Error(`Invalid design row:\n${z.prettifyError(row.error)}`),
      });
      continue;
    }
    const { id, template, saved_at, updated_at, deleted } = row.data;
    if (deleted) {
      designs.push({ id, saved: null, updatedAt: updated_at });
      continue;
    }
    try {
      const saved = parseSavedTemplate({
        savedAt: new Date(saved_at).toISOString(),
        template,
      });
      if (saved.template.id !== id) {
        throw new Error(`The design ${id} holds the template ${saved.template.id}`);
      }
      designs.push({ id, saved, updatedAt: updated_at });
    } catch (error) {
      invalid.push({ id, error: error instanceof Error ? error : new Error(String(error)) });
    }
  }
  return { designs, invalid };
}

/**
 * Orders two of the server's timestamps (`2026-11-12T12:26:05.123456+00:00`), to the microsecond
 * that a `Date` would drop. Time O(1).
 */
export function compareServerTimes(a: string, b: string): number {
  const split = (time: string): [number, number] => {
    const ms = Date.parse(time);
    const fraction = /\.(\d+)/.exec(time)?.[1] ?? '';
    const micros = Number(fraction.padEnd(6, '0').slice(0, 6)) % 1000;
    return [ms, micros];
  };
  const [aMs, aMicros] = split(a);
  const [bMs, bMicros] = split(b);
  return aMs !== bMs ? aMs - bMs : aMicros - bMicros;
}

/**
 * What the phone does with the rows a sync brought: the designs to keep and to delete, and the
 * journal with its cursor at the latest of them. A design with a change still pending keeps the
 * phone's version. Time O(r + p) for r rows and p changes.
 */
export function applyPull(
  journal: SyncJournal,
  pulled: readonly RemoteDesign[],
): {
  readonly save: SavedTemplate[];
  readonly remove: string[];
  readonly journal: SyncJournal;
} {
  const save: SavedTemplate[] = [];
  const remove: string[] = [];
  let cursor = journal.cursor;
  for (const design of pulled) {
    if (cursor === null || compareServerTimes(design.updatedAt, cursor) > 0) {
      cursor = design.updatedAt;
    }
    if (journal.pending[design.id] !== undefined) {
      continue;
    }
    if (design.saved === null) {
      remove.push(design.id);
    } else {
      save.push(design.saved);
    }
  }
  return { save, remove, journal: { ...journal, cursor } };
}
