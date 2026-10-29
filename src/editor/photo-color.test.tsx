/**
 * Reads the dominant color of photos drawn with CanvasKit (see `scene-tests.md`).
 *
 * @jest-environment node
 */
import { getSkiaExports } from '@shopify/react-native-skia/lib/commonjs/headless';

import { loadSceneBeforeAll } from '@/test-utils/scene';

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

/** A photo of `width` × `height`, its left `share` sky blue and the rest sand. */
function photo(width: number, height: number, share: number) {
  const { Skia } = getSkiaExports();
  const surface = Skia.Surface.Make(width, height);
  if (surface === null) {
    throw new Error('Could not make the surface');
  }
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('#DCBE8C'));
  const sky = Skia.Paint();
  sky.setColor(Skia.Color('#4682C8'));
  canvas.drawRect(Skia.XYWHRect(0, 0, width * share, height), sky);
  surface.flush();
  return surface.makeImageSnapshot();
}

describe('photoDominantColor', () => {
  const { photoDominantColor } =
    jest.requireActual<typeof import('./photo-color')>('./photo-color');

  it('reads the color most of the photo has, from a reduced copy', () => {
    expect(photoDominantColor(photo(4032, 3024, 0.7))).toBe('#4682C8');
    expect(photoDominantColor(photo(3024, 4032, 0.2))).toBe('#DCBE8C');
  });

  it('reads tiny photos too', () => {
    expect(photoDominantColor(photo(3, 2, 1))).toBe('#4682C8');
  });
});
