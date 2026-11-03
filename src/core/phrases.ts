import { z } from 'zod';

import type { LocalDate } from './dates';
import { BUILT_IN_PHRASES } from './phrases-built-in';
import { type DesignLanguage, MAX_CHAT_LENGTH } from './template';

/**
 * The verses, quotes and chat phrases the widgets choose from (ADR 012). They live in a table the
 * owner edits, so adding one needs no app update; the app ships with `BUILT_IN_PHRASES` and keeps a
 * copy of the table on the phone. Designs keep a phrase's `id`, not its words.
 */

/** The lists: a Bible verse, a famous quote or the phrase of a chat message. */
export const PHRASE_KINDS = ['verse', 'quote', 'chat'] as const;
export type PhraseKind = (typeof PHRASE_KINDS)[number];

/** A row of the table. */
export interface Phrase {
  readonly id: string;
  readonly kind: PhraseKind;
  /** Its place in its list. */
  readonly position: number;
  readonly textEs: string;
  readonly textEn: string;
  /** A verse's reference or a quote's author; `null` in a chat phrase. */
  readonly sourceEs: string | null;
  readonly sourceEn: string | null;
  /** First day it shows in its list; `null`, from now on. */
  readonly startsOn: LocalDate | null;
  /** Last day it shows in its list, included; `null`, for good. With it, it heads the list. */
  readonly endsOn: LocalDate | null;
  /** Off, it leaves its list but still draws in the designs that use it. */
  readonly active: boolean;
}

/** Longest text of a phrase of each list, in characters, as the table also demands. */
export const MAX_PHRASE_LENGTH: Readonly<Record<PhraseKind, number>> = {
  verse: 150,
  quote: 150,
  chat: MAX_CHAT_LENGTH,
};

/** The phrases the catalog starts with; the gallery looks for its cover from its own list. */
export const FIRST_PHRASE: Readonly<Record<PhraseKind, string>> = {
  verse: firstBuiltIn('verse').id,
  quote: firstBuiltIn('quote').id,
  chat: firstBuiltIn('chat').id,
};

function firstBuiltIn(kind: PhraseKind): Phrase {
  const first = BUILT_IN_PHRASES.find((phrase) => phrase.kind === kind);
  if (first === undefined) {
    throw new Error(`No built-in phrase of kind ${kind}`);
  }
  return first;
}

const localDateSchema = z.iso.date();

const phraseRowSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(PHRASE_KINDS),
    position: z.number().int(),
    text_es: z.string().trim().min(1),
    text_en: z.string().trim().min(1),
    source_es: z.string().trim().min(1).nullable(),
    source_en: z.string().trim().min(1).nullable(),
    starts_on: localDateSchema.nullable(),
    ends_on: localDateSchema.nullable(),
    active: z.boolean(),
  })
  .refine(
    (row) =>
      row.text_es.length <= MAX_PHRASE_LENGTH[row.kind] &&
      row.text_en.length <= MAX_PHRASE_LENGTH[row.kind],
    { error: 'text too long for its list' },
  )
  .refine(
    (row) =>
      row.kind === 'chat'
        ? row.source_es === null && row.source_en === null
        : row.source_es !== null && row.source_en !== null,
    { error: 'a verse or a quote needs its source in both languages; a chat phrase has none' },
  )
  .transform((row): Phrase => ({
    id: row.id,
    kind: row.kind,
    position: row.position,
    textEs: row.text_es,
    textEn: row.text_en,
    sourceEs: row.source_es,
    sourceEn: row.source_en,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    active: row.active,
  }));

/**
 * The rows of the table, as read from it. A bad row doesn't take the others with it: it is left
 * out, and said in `rejected`, to log. Throws when `json` isn't a list at all.
 */
export function parsePhraseRows(json: unknown): {
  readonly phrases: readonly Phrase[];
  readonly rejected: readonly string[];
} {
  const rows = z.array(z.unknown()).parse(json);
  const phrases: Phrase[] = [];
  const rejected: string[] = [];
  rows.forEach((row, i) => {
    const result = phraseRowSchema.safeParse(row);
    if (result.success) {
      phrases.push(result.data);
    } else {
      rejected.push(`Row ${i}: ${z.prettifyError(result.error)}`);
    }
  });
  return { phrases, rejected };
}

/** Whether a phrase shows in its list on `today`. */
const inList = (phrase: Phrase, today: LocalDate): boolean =>
  phrase.active &&
  (phrase.startsOn === null || phrase.startsOn <= today) &&
  (phrase.endsOn === null || today <= phrase.endsOn);

/**
 * The list of `kind` on `today`, in its order: first the ones with a last day, which are there for
 * a while, then the others; each group by `position`. One with only a first day stays among the
 * others: it would head the list for good. A list left with nothing shows the built-in phrases, so
 * it is never empty. Time O(n log n) for n phrases; space O(n).
 */
export function listedPhrases(
  phrases: readonly Phrase[],
  kind: PhraseKind,
  today: LocalDate,
): readonly Phrase[] {
  const listed = phrases.filter((phrase) => phrase.kind === kind && inList(phrase, today));
  if (listed.length === 0) {
    return BUILT_IN_PHRASES.filter((phrase) => phrase.kind === kind);
  }
  const rank = (phrase: Phrase) => (phrase.endsOn === null ? 1 : 0);
  return listed.sort((a, b) => rank(a) - rank(b) || a.position - b.position);
}

/** The words of a phrase in one language. `source` is empty in a chat phrase. */
export interface PhraseWords {
  readonly text: string;
  readonly source: string;
}

/** A phrase in `language`. */
export function wordsIn(phrase: Phrase, language: DesignLanguage): PhraseWords {
  return language === 'es'
    ? { text: phrase.textEs, source: phrase.sourceEs ?? '' }
    : { text: phrase.textEn, source: phrase.sourceEn ?? '' };
}

/**
 * The words a design's phrase draws, whether it still shows in its list or not. A row really
 * deleted from the table draws its built-in phrase if it has one, or else the first one built in
 * of its list, so a saved design always opens. Time O(n) for n phrases.
 */
export function phraseWords(
  phrases: readonly Phrase[],
  kind: PhraseKind,
  id: string,
  language: DesignLanguage,
): PhraseWords {
  const isIt = (phrase: Phrase) => phrase.kind === kind && phrase.id === id;
  const phrase = phrases.find(isIt) ?? BUILT_IN_PHRASES.find(isIt) ?? firstBuiltIn(kind);
  return wordsIn(phrase, language);
}

/** The language of a phrase for a locale: Spanish in Spanish, English in any other. */
export const phraseLanguage = (locale: string): DesignLanguage =>
  locale.startsWith('es') ? 'es' : 'en';

/**
 * What tells one version of the table from another, from its latest change and its number of rows:
 * a deleted row changes no date, but it changes the count.
 */
export const phrasesFingerprint = (latestChange: string | null, count: number): string =>
  `${latestChange ?? 'none'}/${count}`;
