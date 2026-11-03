import { z } from 'zod';

import { type Phrase, parsePhraseRows, phrasesFingerprint } from '@/core/phrases';

/** How long a request to the table may take: it runs in the background, and tries again later. */
const TIMEOUT_MS = 10_000;

const COLUMNS = 'id,kind,position,text_es,text_en,source_es,source_en,starts_on,ends_on,active';

/** Where the table is. The key is the project's publishable one, which is public (ADR 012). */
export interface SupabaseConfig {
  readonly url: string;
  readonly publishableKey: string;
}

const supabaseConfigSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
});

/**
 * The project's address and key, from the app's environment. `null` when they are not set: the app
 * then stays with its built-in phrases. Throws when they are set but wrong.
 */
export function readSupabaseConfig(env: {
  readonly url: string | undefined;
  readonly publishableKey: string | undefined;
}): SupabaseConfig | null {
  if (!env.url && !env.publishableKey) {
    return null;
  }
  return supabaseConfigSchema.parse(env);
}

/** The table of phrases, as read through Supabase's Data API. */
export interface PhrasesTable {
  /** A short text that changes whenever the table does (see `phrasesFingerprint`). */
  readonly fingerprint: () => Promise<string>;
  /** Every row, also those turned off or out of date: saved designs may use them. */
  readonly rows: () => Promise<unknown>;
}

const latestChangeSchema = z.array(z.object({ updated_at: z.string() })).max(1);

/** The table at `config`, read with `fetcher`. */
export function phrasesTable(config: SupabaseConfig, fetcher: typeof fetch = fetch): PhrasesTable {
  const get = async (query: string, headers: Record<string, string> = {}): Promise<Response> => {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const response = await fetcher(`${config.url}/rest/v1/phrases?${query}`, {
        headers: { apikey: config.publishableKey, ...headers },
        signal: abort.signal,
      });
      if (!response.ok) {
        throw new Error(`The phrases table answered ${response.status}`);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  };
  return {
    fingerprint: async () => {
      const response = await get('select=updated_at&order=updated_at.desc&limit=1', {
        Prefer: 'count=exact',
      });
      // "0-0/68", or "*/0" for an empty table.
      const count = response.headers.get('content-range')?.match(/\/(\d+)$/u)?.[1];
      if (count === undefined) {
        throw new Error('The phrases table did not say how many rows it has');
      }
      const [latest] = latestChangeSchema.parse(await response.json());
      return phrasesFingerprint(latest?.updated_at ?? null, Number(count));
    },
    rows: async () => {
      const response = await get(`select=${COLUMNS}&order=position.asc,id.asc`);
      return response.json();
    },
  };
}

/** The copy of the table kept on the phone. */
export interface PhrasesCopy {
  /** The day the table was last looked at. */
  readonly checkedOn: string;
  readonly fingerprint: string;
  /** Its rows, as they came: read again with the current rules on every launch. */
  readonly rows: readonly unknown[];
}

export const phrasesCopySchema = z.object({
  checkedOn: z.iso.date(),
  fingerprint: z.string(),
  rows: z.array(z.unknown()),
});

/**
 * The copy to keep after looking at `table` on `today`, or `null` when there is nothing to do: it
 * was already looked at today, unless `always`. It only downloads the rows when the table changed.
 * A table whose rows are all bad leaves the copy as it was, with an error.
 */
export async function refreshedCopy(
  copy: PhrasesCopy | null,
  today: string,
  table: PhrasesTable,
  always: boolean,
): Promise<{ readonly copy: PhrasesCopy; readonly rejected: readonly string[] } | null> {
  if (!always && copy?.checkedOn === today) {
    return null;
  }
  const fingerprint = await table.fingerprint();
  if (copy !== null && copy.fingerprint === fingerprint) {
    return { copy: { ...copy, checkedOn: today }, rejected: [] };
  }
  const rows = z.array(z.unknown()).parse(await table.rows());
  const { phrases, rejected } = parsePhraseRows(rows);
  if (rows.length > 0 && phrases.length === 0) {
    throw new Error(`Every row of the phrases table is bad:\n${rejected.join('\n')}`);
  }
  return { copy: { checkedOn: today, fingerprint, rows }, rejected };
}

/** The phrases of a copy, and what was wrong with its rows. */
export const phrasesOf = (
  copy: PhrasesCopy,
): { readonly phrases: readonly Phrase[]; readonly rejected: readonly string[] } =>
  parsePhraseRows(copy.rows);
