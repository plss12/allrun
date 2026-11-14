import { File, Paths } from 'expo-file-system';
import { AppState } from 'react-native';

import {
  afterPush,
  applyPull,
  newJournal,
  parseDesignRows,
  parseSyncJournal,
  pushOf,
  type SyncJournal,
  withChange,
} from '@/core/design-sync';
import type { SavedTemplate } from '@/core/user-templates';
import { logError } from '@/ui/log';

import { supabase } from './supabase';
import type { TemplateStore } from './template-store';
import type { TemplatesList } from './templates-list';
import { writeWhole } from './write-whole';

/**
 * The user's designs kept with their account (ADR 019), around the store on the phone: every save
 * and delete is noted in a journal and sent; a sync sends what is pending, then keeps what changed
 * since the last one (see `core/design-sync.ts`). It runs on signing in, on coming back to the
 * app, and a moment after each change. Signing out sends what it can, then clears the phone.
 */

/** Rows asked for at a time: a first sync of a big account comes in pages. */
const PAGE = 200;

/** How long after a change the sync waits, so that a burst of changes goes in one. */
const SYNC_AFTER_MS = 1500;

const COLUMNS = 'id, template, saved_at, updated_at, deleted';

/** Where the phone keeps the journal. */
const journalFile = () => new File(Paths.document, 'design-sync.json');

function readJournal(): SyncJournal | null {
  try {
    const file = journalFile();
    return file.exists ? parseSyncJournal(JSON.parse(file.textSync())) : null;
  } catch (error) {
    // A new journal sends every design on the phone again: nothing is lost.
    logError('Could not read the designs sync journal', error);
    return null;
  }
}

function writeJournal(journal: SyncJournal): Promise<void> {
  return writeWhole(journalFile(), JSON.stringify(journal));
}

/** The account the designs belong to, once signed in. */
let owner: string | null = null;
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let watching = false;

/** The store on the phone and the list the screens show, set once (see `syncedDesigns`). */
let local: TemplateStore | null = null;
let shown: TemplatesList | null = null;

/**
 * The journal for `account`: the phone's; or, the first time, a new one. The designs on a phone
 * with no journal were saved before accounts, and go to this one; those of another account (whose
 * session ended without signing out) are its own, and are cleared, never sent to this one.
 */
async function journalFor(account: string, store: TemplateStore): Promise<SyncJournal> {
  const kept = readJournal();
  if (kept !== null && kept.userId === account) {
    return kept;
  }
  if (kept !== null) {
    await store.clear();
    shown?.reload();
  }
  const journal = newJournal(
    account,
    (await store.list()).map(({ template }) => template.id),
  );
  await writeJournal(journal);
  return journal;
}

/** Notes a change of the phone's, to send. */
async function note(id: string, change: 'save' | 'delete'): Promise<void> {
  const account = owner;
  if (account === null || local === null) {
    return;
  }
  await writeJournal(withChange(await journalFor(account, local), id, change));
  requestSync();
}

/** One sync: sends what is pending, then keeps what changed. */
async function syncOnce(account: string, store: TemplateStore): Promise<void> {
  const client = supabase();
  if (client === null) {
    return;
  }
  let journal = await journalFor(account, store);
  const push = pushOf(journal, await store.list(), new Date().toISOString());
  if (push.rows.length > 0) {
    const { error } = await client.from('user_designs').upsert([...push.rows]);
    if (error !== null) {
      logError('Could not send the designs', error);
      return;
    }
    // Read again: a change made while sending has its own, later revision.
    journal = afterPush(readJournal() ?? journal, push);
    await writeJournal(journal);
  }
  let changed = false;
  for (;;) {
    let query = client
      .from('user_designs')
      .select(COLUMNS)
      .order('updated_at', { ascending: true })
      .limit(PAGE);
    if (journal.cursor !== null) {
      query = query.gt('updated_at', journal.cursor);
    }
    const { data, error } = await query;
    if (error !== null) {
      logError('Could not ask for the designs', error);
      break;
    }
    const { designs, invalid } = parseDesignRows(data);
    invalid.forEach(({ id, error: why }) => logError(`Leaving out the design ${id ?? '?'}`, why));
    const pulled = applyPull(readJournal() ?? journal, designs);
    for (const saved of pulled.save) {
      await store.save(saved);
    }
    for (const id of pulled.remove) {
      await store.remove(id);
    }
    changed ||= pulled.save.length > 0 || pulled.remove.length > 0;
    journal = pulled.journal;
    await writeJournal(journal);
    if ((data as unknown[]).length < PAGE) {
      break;
    }
  }
  if (changed) {
    shown?.reload();
  }
}

/** Syncs now, or once more after the sync under way. */
function syncNow(): Promise<void> {
  if (running !== null) {
    again = true;
    return running;
  }
  const account = owner;
  const store = local;
  if (account === null || store === null) {
    return Promise.resolve();
  }
  running = syncOnce(account, store)
    .catch((error: unknown) => logError('The designs sync failed', error))
    .finally(() => {
      running = null;
      if (again && owner !== null) {
        again = false;
        void syncNow();
      }
    });
  return running;
}

/** Syncs a moment from now, once for a burst of changes. */
export function requestSync(): void {
  if (timer !== null) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, SYNC_AFTER_MS);
}

/**
 * The phone's store, noting every change to send to the account, and the list the screens show,
 * for the sync to refresh. Called once, by the designs' provider.
 */
export function syncedDesigns(
  store: TemplateStore,
  makeList: (store: TemplateStore) => TemplatesList,
): TemplatesList {
  local = store;
  const noted: TemplateStore = {
    list: () => store.list(),
    save: async (saved: SavedTemplate) => {
      await store.save(saved);
      await note(saved.template.id, 'save');
    },
    remove: async (id: string) => {
      await store.remove(id);
      await note(id, 'delete');
    },
    clear: () => store.clear(),
  };
  shown = makeList(noted);
  return shown;
}

/** Follows the signed-in account: syncs on signing in and on coming back to the app. */
export function followDesigns(account: string | null): void {
  owner = account;
  if (!watching) {
    watching = true;
    AppState.addEventListener('change', (state) => {
      if (state === 'active' && owner !== null) {
        void syncNow();
      }
    });
  }
  if (account !== null) {
    void syncNow();
  }
}

/** Whether every change of the phone has reached the account. */
export function allSent(): boolean {
  const journal = readJournal();
  return journal === null || Object.keys(journal.pending).length === 0;
}

/**
 * Sends what is pending, as signing out begins. Resolves whether everything reached the account:
 * if not, what is left would be lost with the phone's copy.
 */
export async function sendBeforeLeaving(): Promise<boolean> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  await syncNow();
  return allSent();
}

/**
 * Clears the phone's designs and journal, once signed out or the account deleted: they are the
 * account's, and another person may sign in next.
 */
export async function forgetDesigns(): Promise<void> {
  owner = null;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  await running;
  await local?.clear();
  try {
    const file = journalFile();
    if (file.exists) {
      file.delete();
    }
  } catch (error) {
    logError('Could not forget the designs sync journal', error);
  }
  shown?.reload();
}
