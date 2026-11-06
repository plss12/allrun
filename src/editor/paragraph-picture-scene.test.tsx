/**
 * Texts drawn as pictures (`paragraph-picture.tsx`) must look exactly as Skia's own `<Paragraph>`
 * draws them, and keep drawing once their paragraph is freed: a canvas of the UI thread draws the
 * picture, never the paragraph, which the JavaScript thread may paint or free meanwhile (a native
 * crash in `ParagraphCmd::draw`, in a release build on Android).
 *
 * @jest-environment node
 */
import {
  drawOffscreen,
  getSkiaExports,
  Group,
  makeOffscreenSurface,
  Paragraph,
  Picture,
} from '@shopify/react-native-skia/lib/commonjs/headless';
import type { ReactElement } from 'react';

import type { SkParagraph } from '@shopify/react-native-skia';

import { loadSceneBeforeAll } from '@/test-utils/scene';
import { loadTestFonts } from '@/test-utils/skia-fonts';

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

type PictureModule = typeof import('./paragraph-picture');
const pictureModule = () => jest.requireActual<PictureModule>('./paragraph-picture');

const WIDTH = 360;
const HEIGHT = 160;

/** A centered text of two lines, with a shadow, laid out as the scenes do. */
function makeParagraph(): SkParagraph {
  const { Skia } = getSkiaExports();
  const builder = Skia.ParagraphBuilder.Make({ textAlign: 2 }, loadTestFonts(['inter']));
  builder.pushStyle({
    color: Skia.Color('#C94A2E'),
    fontFamilies: ['Inter'],
    fontSize: 40,
    shadows: [{ color: Skia.Color('rgba(0,0,0,0.6)'), offset: { x: 2, y: 3 }, blurRadius: 4 }],
  });
  builder.addText('2,70 KM\n49:52');
  builder.pop();
  const paragraph = builder.build();
  paragraph.layout(WIDTH);
  paragraph.layout(Math.ceil(paragraph.getLongestLine()) + 1);
  return paragraph;
}

async function pixelsOf(element: ReactElement): Promise<Uint8Array> {
  const image = await drawOffscreen(
    makeOffscreenSurface(WIDTH, HEIGHT),
    <Group transform={[{ translateX: 20 }, { translateY: 10 }]}>{element}</Group>,
  );
  const pixels = image.readPixels(0, 0, image.getImageInfo());
  if (pixels === null) {
    throw new Error('Could not read the pixels');
  }
  return new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
}

/** How many bytes differ between two images of the same size. */
function differing(a: Uint8Array, b: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      count += 1;
    }
  }
  return count;
}

describe('ParagraphPicture', () => {
  it('draws a text exactly as Skia draws its paragraph', async () => {
    const { ParagraphPicture } = pictureModule();
    const paragraph = makeParagraph();
    const width = Math.ceil(paragraph.getLongestLine()) + 1;
    const own = await pixelsOf(<Paragraph paragraph={paragraph} x={3} y={7} width={width} />);
    const asPicture = await pixelsOf(
      <ParagraphPicture paragraph={paragraph} x={3} y={7} width={width} />,
    );
    expect(own.some((byte) => byte !== 0)).toBe(true);
    expect(differing(own, asPicture)).toBe(0);
  });

  it('records a paragraph once for each width', () => {
    const { paragraphPicture } = pictureModule();
    const paragraph = makeParagraph();
    const width = Math.ceil(paragraph.getLongestLine()) + 1;
    const first = paragraphPicture(paragraph, width);
    expect(paragraphPicture(paragraph, width)).toBe(first);
    expect(paragraphPicture(paragraph, width + 40)).not.toBe(first);
  });

  it('keeps drawing a text once its paragraph is freed', async () => {
    const { paragraphPicture } = pictureModule();
    const paragraph = makeParagraph();
    const width = Math.ceil(paragraph.getLongestLine()) + 1;
    const before = await pixelsOf(<Paragraph paragraph={paragraph} x={0} y={0} width={width} />);
    const picture = paragraphPicture(paragraph, width);
    paragraph.dispose();
    expect(differing(before, await pixelsOf(<Picture picture={picture} />))).toBe(0);
  });
});
