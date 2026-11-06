/**
 * Every label of a row of action tiles fits its tile on the narrowest phone, at the size its row
 * chooses, in every language: measured with Inter itself. Text never shrinks itself to fit (see
 * `actionLabelSize`). Measured in bold, a little wider than the semibold the tiles use.
 *
 * @jest-environment node
 */
import { getSkiaExports } from '@shopify/react-native-skia/lib/commonjs/headless';

import { en } from '@/i18n/locales/en';
import { es } from '@/i18n/locales/es';
import { loadSceneBeforeAll } from '@/test-utils/scene';
import { loadTestFonts } from '@/test-utils/skia-fonts';

import { exportLabels, photoToolLabels } from './action-labels';
import { actionLabelSize, actionLabelWidth } from './editor-layout';

// Draw with CanvasKit instead of the native module (see `template-scene.test.tsx`).
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

loadSceneBeforeAll();

/** A translation of the keys, read from a language's own texts. */
function translate(texts: object): (key: string) => string {
  return (key) => {
    const found = key.split('.').reduce<unknown>((node, part) => {
      if (typeof node !== 'object' || node === null || !(part in node)) {
        throw new Error(`No text for ${key}`);
      }
      return (node as Record<string, unknown>)[part];
    }, texts);
    if (typeof found !== 'string') {
      throw new Error(`No text for ${key}`);
    }
    return found;
  };
}

/** How wide `text` is in Inter at `size`, in points. */
function widthOf(text: string, size: number): number {
  const { Skia } = getSkiaExports();
  const builder = Skia.ParagraphBuilder.Make({}, loadTestFonts(['inter']));
  builder.pushStyle({ fontFamilies: ['Inter'], fontSize: size, fontStyle: { weight: 700 } });
  builder.addText(text);
  builder.pop();
  const paragraph = builder.build();
  paragraph.layout(10_000);
  const width = paragraph.getLongestLine();
  paragraph.dispose();
  return width;
}

describe.each([
  ['English', en],
  ['Spanish', es],
])('the action tiles in %s', (_language, texts) => {
  const t = translate(texts);
  it.each([
    ['export', exportLabels],
    ["photo's tools", photoToolLabels],
  ])('fit the %s row on the narrowest phone', (_row, labels) => {
    const row = labels(t);
    const size = actionLabelSize(row);
    for (const label of row) {
      expect({ label, fits: widthOf(label, size) <= actionLabelWidth() }).toEqual({
        label,
        fits: true,
      });
    }
  });
});

describe('actionLabelSize', () => {
  it('keeps the whole row at one size, by its longest label', () => {
    expect(actionLabelSize(['Share', 'Compartir'])).toBe(12);
    expect(actionLabelSize(['Share', 'Background'])).toBe(11);
    expect(actionLabelSize(['Share', 'Remove photo'])).toBe(10);
  });
});
