import { MAX_CHAT_LENGTH } from './template';
import {
  FIRST_PHRASE,
  listedPhrases,
  MAX_PHRASE_LENGTH,
  parsePhraseRows,
  type Phrase,
  PHRASE_KINDS,
  phraseLanguage,
  phrasesFingerprint,
  phraseWords,
} from './phrases';
import { BUILT_IN_PHRASES } from './phrases-built-in';

const phrase = (id: string, position: number, extra: Partial<Phrase> = {}): Phrase => ({
  id,
  kind: 'chat',
  position,
  textEs: `${id} es`,
  textEn: `${id} en`,
  sourceEs: null,
  sourceEn: null,
  startsOn: null,
  endsOn: null,
  active: true,
  ...extra,
});

const ids = (phrases: readonly Phrase[]) => phrases.map((item) => item.id);

const row = (extra: Record<string, unknown> = {}) => ({
  id: 'one',
  kind: 'quote',
  position: 10,
  text_es: 'Hola',
  text_en: 'Hello',
  source_es: 'Autora',
  source_en: 'Author',
  starts_on: null,
  ends_on: null,
  active: true,
  updated_at: '2026-11-03T10:00:00+00:00',
  ...extra,
});

describe('parsePhraseRows', () => {
  it('reads a row of the table', () => {
    expect(parsePhraseRows([row({ starts_on: '2026-12-26', ends_on: '2026-12-31' })])).toEqual({
      phrases: [
        {
          id: 'one',
          kind: 'quote',
          position: 10,
          textEs: 'Hola',
          textEn: 'Hello',
          sourceEs: 'Autora',
          sourceEn: 'Author',
          startsOn: '2026-12-26',
          endsOn: '2026-12-31',
          active: true,
        },
      ],
      rejected: [],
    });
  });

  it('leaves out a bad row and keeps the others', () => {
    const { phrases, rejected } = parsePhraseRows([
      row({ id: 'good' }),
      row({ id: 'noEnglish', text_en: '  ' }),
      row({ id: 'unknownKind', kind: 'poem' }),
      row({ id: 'badDate', ends_on: 'tomorrow' }),
    ]);
    expect(ids(phrases)).toEqual(['good']);
    expect(rejected).toHaveLength(3);
    expect(rejected[0]).toContain('Row 1');
  });

  it('refuses a text longer than its list allows, in either language', () => {
    const long = 'x'.repeat(MAX_PHRASE_LENGTH.quote + 1);
    const chat = { kind: 'chat', source_es: null, source_en: null };
    const { phrases } = parsePhraseRows([
      row({ id: 'longEs', text_es: long }),
      row({ id: 'longEn', text_en: long }),
      row({ id: 'atLimit', text_es: long.slice(1) }),
      row({ id: 'longChat', ...chat, text_es: 'x'.repeat(MAX_CHAT_LENGTH + 1) }),
      row({ id: 'chatAtLimit', ...chat, text_es: 'x'.repeat(MAX_CHAT_LENGTH) }),
    ]);
    expect(ids(phrases)).toEqual(['atLimit', 'chatAtLimit']);
  });

  it('demands a source in verses and quotes, and none in a chat phrase', () => {
    const { phrases } = parsePhraseRows([
      row({ id: 'noSource', source_es: null }),
      row({ id: 'chatWithSource', kind: 'chat' }),
      row({ id: 'chat', kind: 'chat', source_es: null, source_en: null }),
    ]);
    expect(ids(phrases)).toEqual(['chat']);
  });

  it('throws when it is not a list', () => {
    expect(() => parsePhraseRows({ message: 'nope' })).toThrow();
  });
});

describe('listedPhrases', () => {
  const today = '2026-12-28';

  // The phone's engine, Hermes, doesn't have it: Node does, so only this catches it.
  it('runs without Array.prototype.toSorted', () => {
    const { toSorted } = Array.prototype;
    Reflect.deleteProperty(Array.prototype, 'toSorted');
    try {
      const phrases = [phrase('b', 20), phrase('a', 10)];
      expect(ids(listedPhrases(phrases, 'chat', today))).toEqual(['a', 'b']);
    } finally {
      Reflect.defineProperty(Array.prototype, 'toSorted', {
        value: toSorted,
        writable: true,
        configurable: true,
      });
    }
  });

  it('goes by position, whatever the order of the rows', () => {
    const phrases = [phrase('c', 30), phrase('a', 10), phrase('b', 20)];
    expect(ids(listedPhrases(phrases, 'chat', today))).toEqual(['a', 'b', 'c']);
  });

  it('shows only its own kind', () => {
    const phrases = [phrase('chat', 10), phrase('verse', 10, { kind: 'verse' })];
    expect(ids(listedPhrases(phrases, 'verse', today))).toEqual(['verse']);
  });

  it('leaves out the phrases turned off', () => {
    const phrases = [phrase('on', 10), phrase('off', 5, { active: false })];
    expect(ids(listedPhrases(phrases, 'chat', today))).toEqual(['on']);
  });

  it('shows a phrase with dates only between them, both included', () => {
    const dated = [
      phrase('always', 10),
      phrase('week', 20, { startsOn: '2026-12-26', endsOn: '2026-12-31' }),
    ];
    const on = (day: string) => ids(listedPhrases(dated, 'chat', day));
    expect(on('2026-12-25')).toEqual(['always']);
    expect(on('2026-12-26')).toEqual(['week', 'always']);
    expect(on('2026-12-31')).toEqual(['week', 'always']);
    expect(on('2027-01-01')).toEqual(['always']);
  });

  it('heads the list with a phrase with a last day, even without a first one', () => {
    const phrases = [phrase('always', 10), phrase('untilNewYear', 500, { endsOn: '2026-12-31' })];
    expect(ids(listedPhrases(phrases, 'chat', today))).toEqual(['untilNewYear', 'always']);
  });

  it('keeps a phrase with only a first day in its position, once it starts', () => {
    const phrases = [
      phrase('first', 10),
      phrase('premiere', 20, { startsOn: '2026-12-01' }),
      phrase('notYet', 15, { startsOn: '2027-01-01' }),
      phrase('third', 30),
    ];
    expect(ids(listedPhrases(phrases, 'chat', today))).toEqual(['first', 'premiere', 'third']);
  });

  it('orders the phrases in date by position among themselves', () => {
    const phrases = [
      phrase('always', 1),
      phrase('second', 20, { endsOn: '2026-12-31' }),
      phrase('first', 10, { endsOn: '2027-06-01' }),
    ];
    expect(ids(listedPhrases(phrases, 'chat', today))).toEqual(['first', 'second', 'always']);
  });

  it('falls back on the built-in phrases when its list is left empty', () => {
    const listed = listedPhrases([phrase('off', 10, { active: false })], 'quote', today);
    expect(listed[0].id).toBe(FIRST_PHRASE.quote);
    expect(listed.every((item) => item.kind === 'quote')).toBe(true);
  });
});

describe('phraseWords', () => {
  const quote = phrase('saved', 10, {
    kind: 'quote',
    textEs: 'Hola',
    textEn: 'Hello',
    sourceEs: 'Autora',
    sourceEn: 'Author',
  });

  it('writes a phrase in the language asked', () => {
    expect(phraseWords([quote], 'quote', 'saved', 'es')).toEqual({
      text: 'Hola',
      source: 'Autora',
    });
    expect(phraseWords([quote], 'quote', 'saved', 'en')).toEqual({
      text: 'Hello',
      source: 'Author',
    });
  });

  it('still draws a phrase turned off or out of date', () => {
    const off = { ...quote, active: false, endsOn: '2000-01-01' };
    expect(phraseWords([off], 'quote', 'saved', 'es').text).toBe('Hola');
  });

  it('gives a chat phrase no source', () => {
    expect(phraseWords([phrase('said', 10)], 'chat', 'said', 'es')).toEqual({
      text: 'said es',
      source: '',
    });
  });

  it('draws a row deleted from the table from the built-in phrases', () => {
    expect(phraseWords([], 'quote', 'kipchoge', 'en').source).toBe('Eliud Kipchoge');
  });

  it('draws the first built-in of its list for an id nobody knows', () => {
    const first = BUILT_IN_PHRASES.find((item) => item.id === FIRST_PHRASE.verse);
    expect(phraseWords([], 'verse', 'gone', 'es').text).toBe(first?.textEs);
  });

  it('tells an id of one list from the same id in another', () => {
    const other = phrase('saved', 10, { textEs: 'Del chat' });
    expect(phraseWords([other, quote], 'quote', 'saved', 'es').text).toBe('Hola');
  });
});

describe('phraseLanguage', () => {
  it('reads Spanish in any Spanish locale and English in the others', () => {
    expect(phraseLanguage('es')).toBe('es');
    expect(phraseLanguage('es-MX')).toBe('es');
    expect(phraseLanguage('en')).toBe('en');
    expect(phraseLanguage('fr')).toBe('en');
  });
});

describe('phrasesFingerprint', () => {
  it('changes with a row edited or deleted', () => {
    const before = phrasesFingerprint('2026-11-03T10:00:00+00:00', 68);
    expect(phrasesFingerprint('2026-11-04T10:00:00+00:00', 68)).not.toBe(before);
    expect(phrasesFingerprint('2026-11-03T10:00:00+00:00', 67)).not.toBe(before);
  });

  it('reads an empty table', () => {
    expect(phrasesFingerprint(null, 0)).toBe('none/0');
  });
});

describe('BUILT_IN_PHRASES', () => {
  it('reads as rows of the table would', () => {
    const rows = BUILT_IN_PHRASES.map((item) => ({
      id: item.id,
      kind: item.kind,
      position: item.position,
      text_es: item.textEs,
      text_en: item.textEn,
      source_es: item.sourceEs,
      source_en: item.sourceEn,
      starts_on: item.startsOn,
      ends_on: item.endsOn,
      active: item.active,
    }));
    expect(parsePhraseRows(rows)).toEqual({ phrases: BUILT_IN_PHRASES, rejected: [] });
  });

  it('has its ids once in each list, and something in every list', () => {
    for (const kind of PHRASE_KINDS) {
      const ofKind = ids(BUILT_IN_PHRASES.filter((item) => item.kind === kind));
      expect(ofKind.length).toBeGreaterThan(0);
      expect(new Set(ofKind).size).toBe(ofKind.length);
    }
  });

  it('keeps the phrases the migration fills the table with', () => {
    const fs = jest.requireActual<{ readFileSync: (path: string, encoding: string) => string }>(
      'fs',
    );
    const migration = fs.readFileSync(
      'supabase/migrations/20261103130920_create_phrases.sql',
      'utf8',
    );
    for (const item of BUILT_IN_PHRASES) {
      const quoted = (value: string) => `'${value.replaceAll("'", "''")}'`;
      expect(migration).toContain(
        [quoted(item.id), quoted(item.kind), item.position, quoted(item.textEs)].join(', '),
      );
      expect(migration).toContain(quoted(item.textEn));
    }
  });
});
