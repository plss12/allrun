/**
 * The cover of the widgets chosen from a list, measured with real fonts (CanvasKit): the first
 * phrase of the list that leaves room for the "Tap to choose" hint (ADR 012).
 *
 * @jest-environment node
 */
import { activityCatalog, summaryCatalog } from '@/core/layer-catalog';
import {
  FIRST_PHRASE,
  MAX_PHRASE_LENGTH,
  type Phrase,
  type PhraseKind,
  phraseWords,
} from '@/core/phrases';
import { BUILT_IN_PHRASES } from '@/core/phrases-built-in';
import { weekRange } from '@/core/dates';
import { summarize } from '@/core/summary';
import { type DesignLanguage, FONT_IDS } from '@/core/template';
import { makeActivity } from '@/test-utils/make-activity';
import { loadSceneBeforeAll } from '@/test-utils/scene';
import { alphaOutside } from '@/test-utils/skia-bounds';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import type { EditorData } from './editor-data';
import type { LayerContext } from './template-scene';

jest.mock('@shopify/react-native-skia/lib/commonjs/Platform', () => ({
  Platform: { OS: 'web', PixelRatio: 1 },
}));
jest.mock('@shopify/react-native-skia', () => {
  const headless = jest.requireActual('@shopify/react-native-skia/lib/commonjs/headless');
  const Skia = new Proxy(
    {},
    { get: (_target, key) => Reflect.get(headless.getSkiaExports().Skia, key) },
  );
  return { ...headless, Skia };
});

const scene = loadSceneBeforeAll();
const galleryModule = () =>
  jest.requireActual<typeof import('./widget-gallery')>('./widget-gallery');

const activity = makeActivity({ sportType: 'Run', movingTimeSeconds: 6030 });
const activityData: EditorData = {
  mode: 'activity',
  activity,
  detail: null,
  place: null,
  zones: null,
};
const activities = [makeActivity({ localDate: '2026-10-13' })];
const summaryData: EditorData = {
  mode: 'summary',
  kind: 'week',
  summary: summarize(activities, weekRange('2026-10-14')),
  activities,
  bucketSize: 'day',
  families: [],
  current: false,
};

function contextFor(
  data: EditorData,
  language: DesignLanguage,
  phrases?: readonly Phrase[],
): LayerContext {
  return {
    data,
    fonts: loadTestFonts(FONT_IDS),
    textContext: {
      unit: 'km',
      locale: language,
      durationUnits: TEST_DURATION_UNITS,
      unitLabel: testUnitLabel,
    },
    translate: (key, values) => (key === 'widgets.quoted' ? `«${values?.text}»` : key),
    phrases,
  };
}

/** The tile of a list in a gallery, as the phone would lay it out. */
function tileOf(kind: PhraseKind, context: LayerContext, screen = 393) {
  const catalog =
    context.data.mode === 'activity'
      ? activityCatalog(activity)
      : summaryCatalog(context.data.summary, 'day');
  const sections = galleryModule().gallerySections(
    catalog,
    'story',
    'inter',
    context,
    screen,
    'Text',
  );
  const rows = sections.flatMap((section) => section.rows);
  for (const row of rows) {
    for (const widget of row.widgets) {
      const item = widget.pages[0].item;
      if (
        (item.kind === 'activityBlock' || item.kind === 'summaryBlock') &&
        item.block.design === kind
      ) {
        return { tile: widget, height: row.height };
      }
    }
  }
  throw new Error(`No tile for ${kind}`);
}

/** The id of the phrase a tile shows. */
function shownPhrase(tile: ReturnType<typeof tileOf>['tile'], kind: PhraseKind): string {
  const { item } = tile.pages[0];
  if (item.kind !== 'activityBlock' && item.kind !== 'summaryBlock') {
    throw new Error('Not a block');
  }
  const { block } = item;
  if (kind === 'verse' && block.design === 'verse') {
    return block.verse;
  }
  if (kind === 'quote' && block.design === 'quote') {
    return block.quote;
  }
  if (kind === 'chat' && block.design === 'chat' && typeof block.phrase === 'string') {
    return block.phrase;
  }
  throw new Error(`Not a ${kind}`);
}

/** Every page of a tile ends above its "Tap to choose" hint. */
function expectOverHint(tile: ReturnType<typeof tileOf>['tile'], height: number): void {
  const room = galleryModule().heightOverHint(height, tile.pages.length > 1);
  for (const { prepared, scale } of tile.pages) {
    expect(prepared.height * scale).toBeLessThanOrEqual(room + 0.001);
  }
}

const LONG =
  'Esta frase es a propósito muy larga para que el aviso de la galería la tape si llega a ser la portada de su tarjeta, sin más.';

const dated = (kind: PhraseKind, id: string, text: string): Phrase => ({
  id,
  kind,
  position: 1,
  textEs: text,
  textEn: text,
  sourceEs: kind === 'chat' ? null : 'Fuente',
  sourceEn: kind === 'chat' ? null : 'Source',
  startsOn: '2000-01-01',
  endsOn: '2999-12-31',
  active: true,
});

describe('the cover of a list', () => {
  beforeAll(() => {
    scene();
  });

  // The phrases the app ships with were chosen short for this: they stay the covers.
  it.each(['es', 'en'] as const)(
    'keeps the first built-in phrases in %s',
    (language) => {
      for (const screen of [375, 393, 430]) {
        for (const kind of ['verse', 'quote', 'chat'] as const) {
          const { tile, height } = tileOf(kind, contextFor(activityData, language), screen);
          expect(shownPhrase(tile, kind)).toBe(FIRST_PHRASE[kind]);
          expect(galleryModule().readsInTile(tile)).toBe(true);
          expectOverHint(tile, height);
        }
        for (const kind of ['verse', 'quote'] as const) {
          const { tile } = tileOf(kind, contextFor(summaryData, language), screen);
          expect(shownPhrase(tile, kind)).toBe(FIRST_PHRASE[kind]);
        }
      }
    },
    60_000,
  );

  it.each(['verse', 'quote'] as const)('shows a short %s in date', (kind) => {
    const phrases = [dated(kind, 'short', 'Corre.'), ...BUILT_IN_PHRASES];
    const { tile, height } = tileOf(kind, contextFor(activityData, 'es', phrases));
    expect(shownPhrase(tile, kind)).toBe('short');
    // So short that it would fill the tile: it stops above the hint.
    expectOverHint(tile, height);
  });

  it.each(['verse', 'quote'] as const)(
    'passes over a long %s in date, too small to read in its tile',
    (kind) => {
      const phrases = [dated(kind, 'long', LONG), ...BUILT_IN_PHRASES];
      const { tile, height } = tileOf(kind, contextFor(activityData, 'es', phrases));
      expect(shownPhrase(tile, kind)).toBe(FIRST_PHRASE[kind]);
      expectOverHint(tile, height);
    },
  );

  it('decides by the language of the design', () => {
    const phrase = { ...dated('quote', 'both', 'Corre.'), textEs: LONG };
    const phrases = [phrase, ...BUILT_IN_PHRASES];
    expect(
      shownPhrase(tileOf('quote', contextFor(activityData, 'es', phrases)).tile, 'quote'),
    ).toBe(FIRST_PHRASE.quote);
    expect(
      shownPhrase(tileOf('quote', contextFor(activityData, 'en', phrases)).tile, 'quote'),
    ).toBe('both');
  });

  it('shows the first when no phrase of the list leaves room', () => {
    const phrases = [
      { ...dated('quote', 'first', LONG), position: 1 },
      { ...dated('quote', 'second', LONG), position: 2 },
    ];
    const { tile } = tileOf('quote', contextFor(activityData, 'es', phrases));
    expect(shownPhrase(tile, 'quote')).toBe('first');
  });
});

describe('a phrase as long as its list allows', () => {
  const text = (kind: PhraseKind) =>
    'Corre sin mirar atrás '.repeat(10).slice(0, MAX_PHRASE_LENGTH[kind]);

  it.each(['verse', 'quote', 'chat'] as const)('draws a %s inside its size', async (kind) => {
    const { prepareLayers } = scene();
    const { newLayer } =
      jest.requireActual<typeof import('@/core/default-layout')>('@/core/default-layout');
    const { newTemplate } = jest.requireActual<typeof import('@/core/template')>('@/core/template');
    const phrases = [dated(kind, 'limit', text(kind))];
    const context = contextFor(activityData, 'es', phrases);
    expect(phraseWords(phrases, kind, 'limit', 'es').text).toHaveLength(MAX_PHRASE_LENGTH[kind]);
    const block =
      kind === 'verse'
        ? ({ design: 'verse', verse: 'limit' } as const)
        : kind === 'quote'
          ? ({ design: 'quote', quote: 'limit' } as const)
          : ({ design: 'chat', layout: 'dark', phrase: 'limit' } as const);
    const layer = newLayer({ kind: 'activityBlock', block }, 'limit', 'story', 'inter');
    const [prepared] = prepareLayers(
      newTemplate({ id: 't', mode: 'activity', format: 'story', layers: [layer] }),
      context,
    );
    expect(prepared).toBeDefined();
    expect(prepared.width).toBeGreaterThan(0);
    expect(await alphaOutside(prepared)).toBeLessThan(8);
  });
});
