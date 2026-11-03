/**
 * `npm run phrases:preview` (ADR 012): draws every phrase of the table turned on as its gallery tile,
 * in both languages, on one sheet per list, marking the ones too small to be a cover. A change in
 * the table reaches users without going through CI, so this is how to look before publishing. It
 * runs with Jest, which draws with CanvasKit like the scene tests, but only when asked (its name
 * isn't a test's). Without the project's `.env`, it draws the built-in phrases.
 *
 * @jest-environment node
 */
import { Group, ImageFormat, Paragraph, RoundedRect, Skia } from '@shopify/react-native-skia';
import {
  drawOffscreen,
  makeOffscreenSurface,
} from '@shopify/react-native-skia/lib/commonjs/headless';
import type { ReactElement } from 'react';

import type { CatalogItem } from '@/core/layer-catalog';
import { parsePhraseRows, type Phrase, PHRASE_KINDS, type PhraseKind } from '@/core/phrases';
import { BUILT_IN_PHRASES } from '@/core/phrases-built-in';
import { type DesignLanguage, FONT_IDS } from '@/core/template';
import { phrasesTable, readSupabaseConfig } from '@/data/phrases-table';
import { makeActivity } from '@/test-utils/make-activity';
import { loadSceneBeforeAll } from '@/test-utils/scene';
import { loadTestFonts } from '@/test-utils/skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

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
const fs = jest.requireActual<{
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: 'utf8') => string;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  writeFileSync: (path: string, data: Uint8Array) => void;
}>('fs');
const OUT_DIR = '.expo/phrases-preview';

/** A tile as on an iPhone of 393 points, drawn at twice the size. */
const TILE = { width: 175, height: 105 };
const ZOOM = 2;
const LABEL_HEIGHT = 42;
const GAP = 12;
const PAIRS_PER_ROW = 2;

const QUOTED = { es: '«{{text}}»', en: '“{{text}}”' };
const HINT = { es: 'Toca para elegir', en: 'Tap to choose' };

/** The project's address and key, from `.env` if there is one. */
function configFromEnvFile() {
  const values = new Map<string, string>();
  if (fs.existsSync('.env')) {
    for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/u)) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/u);
      if (match !== null) {
        values.set(match[1], match[2]);
      }
    }
  }
  return readSupabaseConfig({
    url: values.get('EXPO_PUBLIC_SUPABASE_URL'),
    publishableKey: values.get('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  });
}

/** The phrases turned on, from the table or else built in, and which of the two it was. */
async function readPhrases(): Promise<{ phrases: readonly Phrase[]; from: string }> {
  const config = configFromEnvFile();
  if (config === null) {
    return { phrases: BUILT_IN_PHRASES, from: 'the built-in phrases (no .env)' };
  }
  // React Native's Jest setup replaces `fetch` with a mock: this is Node's own.
  const nodeFetch = jest
    .requireActual<{ runInThisContext: (code: string) => unknown }>('vm')
    .runInThisContext('fetch') as typeof fetch;
  const { phrases, rejected } = parsePhraseRows(await phrasesTable(config, nodeFetch).rows());
  for (const message of rejected) {
    console.warn(`The app would leave out: ${message}`);
  }
  return { phrases: phrases.filter((phrase) => phrase.active), from: 'the table' };
}

/** The gallery's item of a phrase; a chat message in its two looks, as its tile has them. */
function itemsOf(phrase: Phrase): readonly CatalogItem[] {
  switch (phrase.kind) {
    case 'verse':
      return [{ kind: 'activityBlock', block: { design: 'verse', verse: phrase.id } }];
    case 'quote':
      return [{ kind: 'activityBlock', block: { design: 'quote', quote: phrase.id } }];
    case 'chat':
      return (['dark', 'light'] as const).map((layout) => ({
        kind: 'activityBlock',
        block: { design: 'chat', layout, phrase: phrase.id },
      }));
  }
}

function contextFor(phrases: readonly Phrase[], language: DesignLanguage): LayerContext {
  return {
    data: {
      mode: 'activity',
      activity: makeActivity({ sportType: 'Run', movingTimeSeconds: 6030 }),
      detail: null,
      place: null,
      zones: null,
    },
    fonts: loadTestFonts(FONT_IDS),
    textContext: {
      unit: 'km',
      locale: language,
      durationUnits: TEST_DURATION_UNITS,
      unitLabel: testUnitLabel,
    },
    translate: (key, values) =>
      key === 'widgets.quoted' ? QUOTED[language].replace('{{text}}', values?.text ?? '') : key,
    phrases,
  };
}

/** A small line of text, in Inter. */
function textLine(
  fonts: LayerContext['fonts'],
  text: string,
  color: string,
  size: number,
  width: number,
) {
  const paragraph = Skia.ParagraphBuilder.Make(
    { textStyle: { color: Skia.Color(color), fontFamilies: ['Inter'], fontSize: size } },
    fonts,
  )
    .addText(text)
    .build();
  paragraph.layout(width);
  return paragraph;
}

/** What a phrase's dates say, if it has any. */
const datesOf = ({ startsOn, endsOn }: Phrase): string =>
  startsOn === null && endsOn === null ? '' : ` · ${startsOn ?? '…'} → ${endsOn ?? '…'}`;

/** A phrase's tile in `language`, with its id and whether it could be a cover over it. */
function cell(
  phrase: Phrase,
  language: DesignLanguage,
  phrases: readonly Phrase[],
  x: number,
  y: number,
): { readonly element: ReactElement; readonly reads: boolean } {
  const gallery = jest.requireActual<typeof import('./widget-gallery')>('./widget-gallery');
  const context = contextFor(phrases, language);
  const tile = gallery.measureWidget(
    { key: phrase.id, variants: itemsOf(phrase) },
    { ...TILE, capWidth: TILE.width },
    'story',
    'inter',
    context,
    'Text',
  );
  if (tile === null) {
    throw new Error(`Nothing to draw for ${phrase.id}`);
  }
  const reads = gallery.readsInTile(tile);
  const several = tile.pages.length > 1;
  const page = tile.pages[0];
  const words = (page.prepared.wordsSize ?? 0) * page.scale;
  const canvasHeight = TILE.height - gallery.GALLERY_DOTS_HEIGHT;
  const hintY = TILE.height - gallery.hintBottom(several) - gallery.GALLERY_HINT_HEIGHT;
  const hint = textLine(context.fonts, HINT[language], '#FFFFFF', 11, 120);
  const name = textLine(
    context.fonts,
    `${phrase.position} · ${phrase.id}${datesOf(phrase)}`,
    '#D1D1D6',
    11,
    TILE.width,
  );
  const verdict = textLine(
    context.fonts,
    `${language.toUpperCase()} · ${words.toFixed(1)} pt · ${reads ? 'can be a cover' : 'too small for a cover'}`,
    reads ? '#7CD992' : '#FF9F43',
    11,
    TILE.width,
  );
  return {
    reads,
    element: (
      // Clipped to its cell: a widget's shadow would otherwise blur over the whole sheet, per cell.
      <Group
        key={`${phrase.id}-${language}`}
        transform={[{ translateX: x }, { translateY: y }]}
        clip={{ x: 0, y: 0, width: TILE.width, height: LABEL_HEIGHT + TILE.height }}
      >
        <Paragraph paragraph={name} x={0} y={0} width={TILE.width} />
        <Paragraph paragraph={verdict} x={0} y={16} width={TILE.width} />
        <Group transform={[{ translateY: LABEL_HEIGHT - 6 }]}>
          <RoundedRect x={0} y={0} width={TILE.width} height={TILE.height} r={14} color="#2C2C2E" />
          <Group
            transform={[
              { translateX: TILE.width / 2 },
              { translateY: canvasHeight / 2 },
              { scale: page.scale },
            ]}
          >
            {page.prepared.content}
          </Group>
          <RoundedRect
            x={(TILE.width - hint.getLongestLine()) / 2 - 8}
            y={hintY}
            width={hint.getLongestLine() + 16}
            height={gallery.GALLERY_HINT_HEIGHT}
            r={8}
            color="rgba(255, 255, 255, 0.18)"
          />
          <Paragraph
            paragraph={hint}
            x={(TILE.width - hint.getLongestLine()) / 2}
            y={hintY + 2}
            width={120}
          />
        </Group>
      </Group>
    ),
  };
}

/** Draws the sheet of a list and returns where it went. */
async function drawSheet(kind: PhraseKind, all: readonly Phrase[]): Promise<string> {
  const phrases = all
    .filter((phrase) => phrase.kind === kind)
    .sort((a, b) => a.position - b.position);
  const cellHeight = LABEL_HEIGHT + TILE.height + GAP;
  const cellWidth = TILE.width + GAP;
  const width = cellWidth * 2 * PAIRS_PER_ROW + GAP;
  const height = Math.ceil(phrases.length / PAIRS_PER_ROW) * cellHeight + GAP;
  const cells = phrases.flatMap((phrase, i) => {
    const x = GAP + (i % PAIRS_PER_ROW) * 2 * cellWidth;
    const y = GAP + Math.floor(i / PAIRS_PER_ROW) * cellHeight;
    return [
      cell(phrase, 'es', all, x, y).element,
      cell(phrase, 'en', all, x + cellWidth, y).element,
    ];
  });
  const image = await drawOffscreen(
    makeOffscreenSurface(width * ZOOM, height * ZOOM),
    <Group transform={[{ scale: ZOOM }]}>
      <RoundedRect x={0} y={0} width={width} height={height} r={0} color="#000000" />
      {cells}
    </Group>,
  );
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const path = `${OUT_DIR}/${kind}.png`;
  fs.writeFileSync(path, image.encodeToBytes(ImageFormat.PNG, 100));
  return path;
}

it('draws the phrases', async () => {
  scene();
  const { phrases, from } = await readPhrases();
  const sheets: string[] = [];
  for (const kind of PHRASE_KINDS) {
    sheets.push(await drawSheet(kind, phrases));
  }
  console.info(`Drawn from ${from}:\n${sheets.join('\n')}`);
}, 300_000);
