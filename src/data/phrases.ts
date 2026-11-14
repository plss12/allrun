import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import type { Phrase } from '@/core/phrases';
import { BUILT_IN_PHRASES } from '@/core/phrases-built-in';
import { logError } from '@/ui/log';
import { todayLocal } from '@/ui/today';

import {
  type PhrasesCopy,
  phrasesCopySchema,
  phrasesOf,
  phrasesTable,
  readSupabaseConfig,
  refreshedCopy,
} from './phrases-table';
import { writeWhole } from './write-whole';

/**
 * The verses, quotes and chat phrases of the widgets (ADR 012): always read from the phone, so a
 * list opens at once and never waits for the network, and refreshed in the background from the
 * table the owner edits, at most once a day. The app ships with its built-in ones for the first
 * launch.
 */

const FILE_NAME = 'phrases.json';

let copy: PhrasesCopy | null = null;
let phrases: readonly Phrase[] | null = null;
const listeners = new Set<() => void>();

/** Logs the rows of the table the app left out, which someone should fix there. */
function logRejected(rejected: readonly string[]): void {
  if (rejected.length > 0) {
    logError('Some phrases of the table were left out', rejected.join('\n'));
  }
}

/** The copy in the file, if there is a good one. */
function readCopy(): PhrasesCopy | null {
  const file = new File(Paths.document, FILE_NAME);
  if (!file.exists) {
    return null;
  }
  try {
    return phrasesCopySchema.parse(JSON.parse(file.textSync()));
  } catch (error) {
    logError('Could not read the copy of the phrases; starting from the built-in ones', error);
    return null;
  }
}

/** The phrases, read from the file the first time. */
function current(): readonly Phrase[] {
  if (phrases === null) {
    copy = readCopy();
    if (copy === null) {
      phrases = BUILT_IN_PHRASES;
    } else {
      const read = phrasesOf(copy);
      logRejected(read.rejected);
      phrases = read.phrases;
    }
  }
  return phrases;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The phrases as the phone has them, also those not shown in their lists today. */
export function usePhrases(): readonly Phrase[] {
  return useSyncExternalStore(subscribe, current);
}

/**
 * Brings the phrases up to date in the background, at most once a day (on every launch in
 * development, to see a change in the table right away). Without network, or with the table
 * unreachable, the phone stays with what it has, and tries again on the next launch.
 */
export async function syncPhrases(): Promise<void> {
  try {
    const config = readSupabaseConfig({
      url: process.env.EXPO_PUBLIC_SUPABASE_URL,
      publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    if (config === null) {
      return;
    }
    current();
    const refreshed = await refreshedCopy(
      copy,
      todayLocal(),
      phrasesTable(config),
      process.env.NODE_ENV === 'development',
    );
    if (refreshed === null) {
      return;
    }
    logRejected(refreshed.rejected);
    const changed = refreshed.copy.fingerprint !== copy?.fingerprint;
    copy = refreshed.copy;
    await writeWhole(new File(Paths.document, FILE_NAME), JSON.stringify(refreshed.copy));
    if (changed) {
      phrases = phrasesOf(refreshed.copy).phrases;
      for (const listener of listeners) {
        listener();
      }
    }
  } catch (error) {
    logError('Could not refresh the phrases; keeping the ones on the phone', error);
  }
}
