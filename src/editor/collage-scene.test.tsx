/**
 * A collage drawn as its image comes out (with CanvasKit): each photo in its cell, the frame over
 * their edges, and nothing in an empty cell.
 *
 * @jest-environment node
 */
import {
  drawOffscreen,
  getSkiaExports,
  makeOffscreenSurface,
  type SkImage,
} from '@shopify/react-native-skia/lib/commonjs/headless';

import { COLLAGE_FRAME_WIDTH, newCollage } from '@/core/collage';
import { defaultActivityTemplate } from '@/core/default-layout';
import { COVER_PLACEMENT } from '@/core/photo-placement';
import { CANVAS_FORMATS, type Collage, type ImageFrame, type Template } from '@/core/template';
import { makeActivity } from '@/test-utils/make-activity';
import { loadSceneBeforeAll } from '@/test-utils/scene';
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
const exporting = () => jest.requireActual<typeof import('./export-scene')>('./export-scene');

const activity = makeActivity({ name: 'Morning Run' });
const { width, height } = CANVAS_FORMATS.story;
const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const WHITE = [255, 255, 255, 255];
const BLACK = [0, 0, 0, 255];
const CLEAR = [0, 0, 0, 0];

function template(collage: Collage | undefined, frame: ImageFrame = 'none'): Template {
  return {
    ...defaultActivityTemplate(activity, 'story'),
    layers: [],
    ...(collage === undefined ? {} : { collage }),
    frame,
    background: { kind: 'transparent' },
  };
}

function layerContext(): LayerContext {
  const { Skia } = getSkiaExports();
  return {
    data: { mode: 'activity', activity, detail: null, place: null, zones: null },
    fonts: Skia.TypefaceFontProvider.Make(),
    textContext: {
      unit: 'km',
      locale: 'en',
      durationUnits: TEST_DURATION_UNITS,
      unitLabel: testUnitLabel,
    },
    translate: (key) => key,
  };
}

/** A photo of one color, wider than a cell. */
function photo(color: string): SkImage {
  const { Skia } = getSkiaExports();
  const surface = makeOffscreenSurface(400, 300);
  surface.getCanvas().clear(Skia.Color(color));
  surface.flush();
  return surface.makeImageSnapshot();
}

function pixelsOf(image: SkImage) {
  const pixels = image.readPixels(0, 0, image.getImageInfo());
  if (pixels === null) {
    throw new Error('Could not read the pixels');
  }
  return (x: number, y: number) => {
    const i = (y * image.width() + x) * 4;
    return Array.from(pixels.slice(i, i + 4));
  };
}

const render = async (
  collage: Collage,
  cells: readonly (SkImage | null)[],
  frame: ImageFrame = 'none',
) =>
  pixelsOf(
    await drawOffscreen(
      makeOffscreenSurface(width, height),
      exporting().exportScene({
        template: template(collage, frame),
        layerContext: layerContext(),
        photo: null,
        cells,
        dominant: null,
      }),
    ),
  );

describe('a collage in an image', () => {
  beforeAll(() => {
    scene();
  });

  it('draws each photo in its cell', async () => {
    const at = await render(newCollage('two'), [photo('#FF0000'), photo('#0000FF')]);
    expect(at(width / 2, height / 4)).toEqual(RED);
    expect(at(width / 2, (3 * height) / 4)).toEqual(BLUE);
  });

  it('touches without a gap when it has no frame', async () => {
    const at = await render(newCollage('two'), [photo('#FF0000'), photo('#0000FF')]);
    expect(at(width / 2, height / 2 - 1)).toEqual(RED);
    expect(at(width / 2, height / 2 + 1)).toEqual(BLUE);
  });

  it('clips a photo to its cell, however big it is', async () => {
    const big = {
      ...newCollage('two'),
      placements: newCollage('two').placements.map((placement, index) =>
        index === 0 ? { ...COVER_PLACEMENT, scale: 4 } : placement,
      ),
    };
    const at = await render(big, [photo('#FF0000'), null]);
    expect(at(width / 2, height / 2 - 1)).toEqual(RED);
    expect(at(width / 2, height / 2 + 1)).toEqual(CLEAR);
  });

  it('leaves an empty cell to the background, without its sign', async () => {
    const at = await render(newCollage('two'), [photo('#FF0000'), null]);
    expect(at(width / 2, (3 * height) / 4)).toEqual(CLEAR);
  });

  it.each([
    ['light', WHITE],
    ['dark', BLACK],
  ] as const)('draws a %s frame around and between the cells', async (frame, color) => {
    const at = await render(newCollage('two'), [photo('#FF0000'), photo('#0000FF')], frame);
    const w = COLLAGE_FRAME_WIDTH;
    // Around the canvas.
    expect(at(1, height / 4)).toEqual(color);
    expect(at(width - 2, height / 4)).toEqual(color);
    expect(at(width / 2, 1)).toEqual(color);
    expect(at(width / 2, height - 2)).toEqual(color);
    // Between the cells, and no further.
    expect(at(width / 2, height / 2)).toEqual(color);
    expect(at(width / 2, height / 2 - w / 2 - 2)).toEqual(RED);
    expect(at(width / 2, height / 2 + w / 2 + 2)).toEqual(BLUE);
    // The photos, clear inside.
    expect(at(w + 2, height / 4)).toEqual(RED);
  });

  it('shows photos beyond its layout in none of its cells', async () => {
    const at = await render(newCollage('two'), [
      photo('#FF0000'),
      photo('#0000FF'),
      photo('#00FF00'),
    ]);
    expect(at(width / 2, (3 * height) / 4)).toEqual(BLUE);
  });
});

describe('the frame of a single photo, in the image', () => {
  beforeAll(() => {
    scene();
  });

  it.each([
    ['light', WHITE],
    ['dark', BLACK],
  ] as const)('goes around it in %s, leaving the rest of the photo clear', async (frame, color) => {
    const at = pixelsOf(
      await drawOffscreen(
        makeOffscreenSurface(width, height),
        exporting().exportScene({
          template: template(undefined, frame),
          layerContext: layerContext(),
          photo: photo('#FF0000'),
          dominant: null,
        }),
      ),
    );
    expect(at(1, height / 2)).toEqual(color);
    expect(at(width - 2, height / 2)).toEqual(color);
    expect(at(width / 2, 1)).toEqual(color);
    expect(at(width / 2, height - 2)).toEqual(color);
    expect(at(COLLAGE_FRAME_WIDTH + 2, height / 2)).toEqual(RED);
    expect(at(width / 2, height / 2)).toEqual(RED);
  });
});

describe('the cell being edited, on the canvas', () => {
  const drawn = async (activeCell: number | null, frame: ImageFrame = 'none') => {
    const { TemplateScene } = scene();
    const design = template(newCollage('two'), frame);
    return pixelsOf(
      await drawOffscreen(
        makeOffscreenSurface(width, height),
        <TemplateScene
          format="story"
          layers={[]}
          backdrop={{ kind: 'none' }}
          photo={null}
          collage={exporting().sceneCollage(
            design,
            [photo('#FF0000'), photo('#0000FF')],
            true,
            activeCell,
          )}
          frame={exporting().sceneFrame(design)}
        />,
      ),
    );
  };

  it('keeps its photo as it is and dims the others', async () => {
    const at = await drawn(0);
    expect(at(width / 2, height / 4)).toEqual(RED);
    const other = at(width / 2, (3 * height) / 4);
    expect(other[2]).toBeGreaterThan(0);
    expect(other[2]).toBeLessThan(BLUE[2]);
  });

  it('dims nothing when none is being edited', async () => {
    const at = await drawn(null);
    expect(at(width / 2, height / 4)).toEqual(RED);
    expect(at(width / 2, (3 * height) / 4)).toEqual(BLUE);
  });

  it('leaves the frame as it is, over the dimmed photos', async () => {
    const at = await drawn(0, 'light');
    expect(at(1, (3 * height) / 4)).toEqual(WHITE);
  });
});

describe('sceneCollage', () => {
  beforeAll(() => {
    scene();
  });

  it('is nothing for a design with one photo', () => {
    const single = defaultActivityTemplate(activity, 'story');
    expect(exporting().sceneCollage(single, [], true)).toBeNull();
  });

  it('asks for the sign on empty cells only on the canvas', () => {
    const design = template(newCollage('two'));
    const kinds = (hints: boolean) =>
      exporting().sceneCollage(design, [null, 'loading'], hints)?.cells;
    expect(kinds(true)?.[0]).toMatchObject({ kind: 'empty', hint: true });
    expect(kinds(false)?.[0]).toMatchObject({ kind: 'empty', hint: false });
    expect(kinds(true)?.[1]).toMatchObject({ kind: 'loading' });
  });

  it('marks no cell unless it is asked to, as in the image', () => {
    const design = template(newCollage('four'));
    expect(exporting().sceneCollage(design, [], false)?.activeCell).toBeNull();
    expect(exporting().sceneCollage(design, [], true, 2)?.activeCell).toBe(2);
  });

  it('has no frame without one', () => {
    expect(exporting().sceneFrame(template(newCollage('four')))).toBeNull();
    expect(exporting().sceneFrame(template(undefined))).toBeNull();
  });
});
