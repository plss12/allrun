import { makeActivity } from '@/test-utils/make-activity';

import { defaultActivityTemplate, newLayer } from './default-layout';
import {
  canAddImage,
  EDITOR_PHOTO,
  fillSlots,
  FRAME_SHARE,
  IMAGE_SIDE,
  imageBox,
  imageCount,
  INSTANT,
  instantBox,
  instantFrame,
  firstEmptyWindow,
  isEmptyWindow,
  layerPictures,
  slidesBox,
  windowAt,
  withoutPicture,
  withWindowPicture,
  isPhotoSlot,
  leavesCanvasPhoto,
  MAX_IMAGES,
  coversCanvas,
  cropFrame,
  mountBox,
  SAMPLE_IMAGE,
  setLayerImage,
  slotBox,
  usesEditorPhoto,
  withEmptySlots,
} from './image-layer';
import { setImageRounded } from './layer-style';
import { CANVAS_FORMATS, IMAGE_MOUNTS, type Layer, parseTemplate, type Template } from './template';
import { addLayer } from './template-edit';

const story = defaultActivityTemplate(makeActivity(), 'story');

function withPictures(count: number): Template {
  let template = story;
  for (let i = 1; i <= count; i++) {
    template = addLayer(
      template,
      newLayer({ kind: 'image', image: `picked-${i}`, frame: 'light' }, `image-${i}`, 'story'),
    );
  }
  return template;
}

describe('imageBox', () => {
  it('fits the longest side of the picture to IMAGE_SIDE, keeping its proportions', () => {
    const portrait = imageBox({ width: 3024, height: 4032 }, 'none');
    expect(portrait.height).toBeCloseTo(IMAGE_SIDE);
    expect(portrait.width).toBeCloseTo(IMAGE_SIDE * 0.75);
    expect(portrait.picture).toEqual({
      x: -portrait.width / 2,
      y: -portrait.height / 2,
      width: portrait.width,
      height: portrait.height,
    });
    const landscape = imageBox({ width: 16, height: 9 }, 'none');
    expect(landscape.width).toBeCloseTo(IMAGE_SIDE);
  });

  it('adds an even frame, a share of the shorter side, around the picture', () => {
    const framed = imageBox({ width: 4, height: 5 }, 'dark');
    const edge = IMAGE_SIDE * 0.8 * FRAME_SHARE;
    expect(framed.picture.height).toBeCloseTo(IMAGE_SIDE);
    expect(framed.width - framed.picture.width).toBeCloseTo(2 * edge);
    expect(framed.height - framed.picture.height).toBeCloseTo(2 * edge);
    // Centered on (0, 0).
    expect(framed.picture.x).toBeCloseTo(-framed.picture.width / 2);
  });
});

describe('instantBox', () => {
  it("is a Polaroid: a square picture, an even edge, and the caption's band under it", () => {
    const box = instantBox();
    expect(box.height).toBeCloseTo(IMAGE_SIDE);
    const edge = box.width * INSTANT.edge;
    expect(box.picture.width).toBeCloseTo(box.picture.height);
    expect(box.picture.width).toBeCloseTo(box.width - 2 * edge);
    expect(box.picture.y).toBeCloseTo(-box.height / 2 + edge);
    expect(box.caption.y).toBeCloseTo(box.picture.y + box.picture.height);
    expect(box.caption.y + box.caption.height).toBeCloseTo(box.height / 2);
    // About a Polaroid's 88 × 107 mm.
    expect(box.width / box.height).toBeCloseTo(88 / 107, 1);
  });

  it('always has a frame', () => {
    expect(instantFrame('none')).toBe('light');
    expect(instantFrame('dark')).toBe('dark');
  });
});

describe('picture limits', () => {
  it(`takes up to ${MAX_IMAGES} pictures in a design`, () => {
    expect(canAddImage(story)).toBe(true);
    expect(canAddImage(withPictures(MAX_IMAGES - 1))).toBe(true);
    const full = withPictures(MAX_IMAGES);
    expect(imageCount(full.layers)).toBe(MAX_IMAGES);
    expect(canAddImage(full)).toBe(false);
  });

  it('makes room for every window of a piece of several photos', () => {
    expect(canAddImage(withPictures(MAX_IMAGES - 3), 0, 3)).toBe(true);
    expect(canAddImage(withPictures(MAX_IMAGES - 2), 0, 3)).toBe(false);
  });

  it("counts a collage's photos among them", () => {
    expect(canAddImage(story, MAX_IMAGES - 1)).toBe(true);
    expect(canAddImage(story, MAX_IMAGES)).toBe(false);
    expect(canAddImage(withPictures(1), MAX_IMAGES - 1)).toBe(false);
  });
});

describe('the slots of a design', () => {
  const slot = (id: string, image: string): Layer => ({
    id,
    kind: 'image',
    image,
    frame: 'none',
    slot: true,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    opacity: 1,
  });
  const sticker: Layer = {
    id: 'sticker',
    kind: 'image',
    image: 'picked-1',
    frame: 'none',
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    opacity: 1,
  };

  it('tells a slot from a picture stuck on, and the rest of the widgets', () => {
    expect(isPhotoSlot(slot('a', SAMPLE_IMAGE))).toBe(true);
    expect(isPhotoSlot({ ...sticker, mount: 'filmFrame' } as Layer)).toBe(true);
    expect(isPhotoSlot(sticker)).toBe(false);
    expect(isPhotoSlot(story.layers[0])).toBe(false);
  });

  it('counts as empty with no picture chosen, or with the photo the editor no longer has', () => {
    expect(isEmptyWindow(slot('a', SAMPLE_IMAGE), 0, true)).toBe(true);
    expect(isEmptyWindow(slot('a', 'picked-1'), 0, false)).toBe(false);
    expect(isEmptyWindow(slot('a', EDITOR_PHOTO), 0, true)).toBe(false);
    expect(isEmptyWindow(slot('a', EDITOR_PHOTO), 0, false)).toBe(true);
    expect(isEmptyWindow(sticker, 0, false)).toBe(false);
    expect(firstEmptyWindow(slot('a', SAMPLE_IMAGE), true)).toBe(0);
    expect(firstEmptyWindow(slot('a', 'picked-1'), true)).toBeNull();
    expect(firstEmptyWindow(sticker, true)).toBeNull();
  });

  it("says when the editor's photo is in one, instead of over the canvas", () => {
    expect(usesEditorPhoto([slot('a', 'picked-1')])).toBe(false);
    expect(usesEditorPhoto([slot('a', 'picked-1'), slot('b', EDITOR_PHOTO)])).toBe(true);
    expect(usesEditorPhoto([{ ...sticker, image: EDITOR_PHOTO } as Layer])).toBe(false);
  });

  it('are saved empty, and so is a picture stuck on, as a slot to fill', () => {
    expect(withEmptySlots([slot('a', 'picked-1'), sticker, story.layers[0]])).toEqual([
      slot('a', SAMPLE_IMAGE),
      { ...sticker, image: SAMPLE_IMAGE, slot: true },
      story.layers[0],
    ]);
  });

  it('are filled in order, leaving those already filled, and what is left over out', () => {
    expect(
      fillSlots([slot('a', SAMPLE_IMAGE), slot('b', 'kept'), slot('c', SAMPLE_IMAGE)], ['x']),
    ).toEqual([slot('a', 'x'), slot('b', 'kept'), slot('c', SAMPLE_IMAGE)]);
    expect(fillSlots([slot('a', SAMPLE_IMAGE)], ['x', 'y'])).toEqual([slot('a', 'x')]);
    expect(fillSlots([sticker], ['x'])).toEqual([sticker]);
  });

  it("never give a slot that keeps the canvas's photo that photo, which stays as the background", () => {
    const polaroid = { ...slot('p', SAMPLE_IMAGE), keepsCanvasPhoto: true } as Layer;
    expect(fillSlots([polaroid], [EDITOR_PHOTO])).toEqual([polaroid]);
    expect(fillSlots([polaroid], [EDITOR_PHOTO, 'x'])).toEqual([{ ...polaroid, image: 'x' }]);
    // The photo goes on to the next slot that takes it.
    expect(fillSlots([polaroid, slot('a', SAMPLE_IMAGE)], [EDITOR_PHOTO, 'x'])).toEqual([
      { ...polaroid, image: 'x' },
      slot('a', EDITOR_PHOTO),
    ]);
    expect(leavesCanvasPhoto([polaroid])).toBe(true);
    expect(leavesCanvasPhoto([polaroid, slot('a', SAMPLE_IMAGE)])).toBe(false);
    expect(leavesCanvasPhoto([sticker])).toBe(true);
  });

  it('are read back from a saved template, and an unknown holder is refused', () => {
    const template = { ...story, layers: [slot('a', SAMPLE_IMAGE)] };
    expect(parseTemplate(template).layers).toEqual([slot('a', SAMPLE_IMAGE)]);
    expect(() =>
      parseTemplate({ ...template, layers: [{ ...slot('a', ''), mount: 'tv' }] }),
    ).toThrow();
  });

  it('round the corners of a picture, and square them again, with no step when the same', () => {
    const template = withPictures(1);
    expect(setImageRounded(template, 'image-1', false)).toBe(template);
    const rounded = setImageRounded(template, 'image-1', true);
    expect(rounded.layers.at(-1)).toEqual({ ...template.layers.at(-1), rounded: true });
    expect(setImageRounded(rounded, 'image-1', true)).toBe(rounded);
    expect(setImageRounded(rounded, 'image-1', false).layers.at(-1)).toEqual({
      ...template.layers.at(-1),
      rounded: false,
    });
  });
});

describe('a holder with several windows', () => {
  const viewer: Layer = {
    id: 'slides',
    kind: 'image',
    image: SAMPLE_IMAGE,
    frame: 'none',
    mount: 'slides',
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    opacity: 1,
  };
  const asImage = (layer: Layer) => {
    if (layer.kind !== 'image') {
      throw new Error('Not a picture');
    }
    return layer;
  };

  it('has a picture per window, empty until chosen', () => {
    expect(layerPictures(asImage(viewer))).toEqual([SAMPLE_IMAGE, SAMPLE_IMAGE, SAMPLE_IMAGE]);
    const second = withWindowPicture(asImage(viewer), 1, 'picked-2');
    expect(layerPictures(second)).toEqual([SAMPLE_IMAGE, 'picked-2', SAMPLE_IMAGE]);
    expect(firstEmptyWindow(second, true)).toBe(0);
    expect(isEmptyWindow(second, 1, true)).toBe(false);
    // Each window counts towards the most a design takes.
    expect(imageCount([viewer])).toBe(3);
  });

  it('fills its windows in order, the canvas photo first, and saves them all empty', () => {
    const [filled] = fillSlots([viewer], [EDITOR_PHOTO, 'picked-1']);
    expect(layerPictures(asImage(filled))).toEqual([EDITOR_PHOTO, 'picked-1', SAMPLE_IMAGE]);
    expect(usesEditorPhoto([filled])).toBe(true);
    expect(withEmptySlots([filled])).toEqual([viewer]);
    expect(parseTemplate({ ...story, layers: [filled] }).layers).toEqual([filled]);
  });

  it('changes the picture of one window only', () => {
    const template = { ...story, layers: [viewer] };
    const changed = setLayerImage(template, 'slides', 'picked-3', 2);
    expect(layerPictures(asImage(changed.layers[0]))).toEqual([
      SAMPLE_IMAGE,
      SAMPLE_IMAGE,
      'picked-3',
    ]);
    expect(setLayerImage(changed, 'slides', 'picked-3', 2)).toBe(changed);
    expect(setLayerImage(changed, 'slides', 'picked-3', 3)).toBe(changed);
  });

  it('empties the windows of a picture that could not be read, and drops it stuck on', () => {
    const [filled] = fillSlots([viewer], ['bad', 'good', 'bad']);
    const sticker: Layer = { ...viewer, id: 'sticker', mount: undefined, image: 'bad' };
    const [left, ...rest] = withoutPicture([filled, sticker], 'bad');
    expect(layerPictures(asImage(left))).toEqual([SAMPLE_IMAGE, 'good', SAMPLE_IMAGE]);
    expect(rest).toEqual([]);
  });

  it('stacks its slides 3:2 inside it, each with its tab at the middle of its left edge', () => {
    const box = slidesBox();
    expect(box.windows).toHaveLength(3);
    for (const [i, window] of box.windows.entries()) {
      expect(window.width / window.height).toBeCloseTo(3 / 2);
      expect(window.x).toBeGreaterThanOrEqual(-box.width / 2);
      expect(window.x + window.width).toBeLessThanOrEqual(box.width / 2);
      expect(window.y).toBeGreaterThanOrEqual(-box.height / 2);
      expect(window.y + window.height).toBeLessThanOrEqual(box.height / 2);
      const tab = box.tabs[i];
      expect(tab.y + tab.height / 2).toBeCloseTo(window.y + window.height / 2);
      // Its rounded end inside the slide, the rest outside it.
      expect(tab.x).toBeLessThan(window.x);
      expect(tab.x + tab.width).toBeGreaterThan(window.x);
    }
    // The middle one at the middle, and the others as far above and below it.
    expect(box.windows[1].y + box.windows[1].height / 2).toBeCloseTo(0);
  });

  it('knows which slide a touch is on, and the nearest between two', () => {
    const box = slidesBox();
    const middleOf = (i: number) => box.windows[i].y + box.windows[i].height / 2;
    const layer = asImage(viewer);
    expect(windowAt(layer, { x: 0, y: middleOf(0) })).toBe(0);
    expect(windowAt(layer, { x: 0, y: middleOf(2) })).toBe(2);
    const gap = box.windows[1].y - 4;
    expect(windowAt(layer, { x: 0, y: gap })).toBe(1);
    expect(windowAt(asImage({ ...viewer, mount: 'filmFrame' }), { x: 0, y: middleOf(2) })).toBe(0);
  });
});

describe('slotBox', () => {
  it('fills the place of a slot with a vertical photo of a phone', () => {
    const box = slotBox({ width: 3024, height: 4032 }, 'none');
    expect(box.height).toBeCloseTo(IMAGE_SIDE);
    expect(box.width).toBeCloseTo((IMAGE_SIDE * 3) / 4);
  });

  it('keeps a wide photo as wide as the place, whole, and a tall one as tall', () => {
    const wide = slotBox({ width: 4000, height: 2000 }, 'none');
    expect(wide.width).toBeCloseTo((IMAGE_SIDE * 3) / 4);
    expect(wide.height).toBeCloseTo((IMAGE_SIDE * 3) / 8);
    const tall = slotBox({ width: 1000, height: 3000 }, 'none');
    expect(tall.height).toBeCloseTo(IMAGE_SIDE);
    expect(tall.width).toBeCloseTo(IMAGE_SIDE / 3);
  });

  it('grows with its frame, as any picture', () => {
    const framed = slotBox({ width: 3, height: 4 }, 'light');
    const plain = slotBox({ width: 3, height: 4 }, 'none');
    expect(framed.width).toBeGreaterThan(plain.width);
    expect(framed.picture.width).toBeCloseTo(plain.picture.width);
  });
});

describe('mountBox', () => {
  it.each(IMAGE_MOUNTS)('%s: its window, cut-outs and sides are inside it', (mount) => {
    const box = mountBox(mount, CANVAS_FORMATS.story);
    const inside = (rect: { x: number; y: number; width: number; height: number }) => {
      expect(rect.x).toBeGreaterThanOrEqual(-box.width / 2);
      expect(rect.y).toBeGreaterThanOrEqual(-box.height / 2);
      expect(rect.x + rect.width).toBeLessThanOrEqual(box.width / 2 + 1e-9);
      expect(rect.y + rect.height).toBeLessThanOrEqual(box.height / 2 + 1e-9);
    };
    if (mount === 'slides') {
      // Several windows of their own: see the tests of slidesBox.
      expect(box).toMatchObject({ width: slidesBox().width, height: slidesBox().height });
      return;
    }
    if (coversCanvas(mount)) {
      // As big as the canvas, seen through it: its photo covers it.
      expect(box).toMatchObject(CANVAS_FORMATS.story);
      expect(box.picture).toMatchObject(CANVAS_FORMATS.story);
      return;
    }
    expect(box.height).toBe(IMAGE_SIDE);
    expect(box.width).toBeGreaterThan(box.picture.width);
    // The frames beside the window run off the widget, which shows at most 30% of them.
    for (const frame of box.frames) {
      const shown =
        Math.min(frame.x + frame.width, box.width / 2) - Math.max(frame.x, -box.width / 2);
      expect(shown / frame.width).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(shown).toBeGreaterThan(0);
    }
    inside(box.picture);
    box.holes.forEach(inside);
    box.sides.forEach(inside);
    // As a phone's vertical photos, which it never cuts.
    expect(box.picture.width / box.picture.height).toBeCloseTo(3 / 4);
  });

  it('never covers the window with a cut-out, or a cut-out with a side', () => {
    for (const mount of IMAGE_MOUNTS) {
      const { picture, holes, sides } = mountBox(mount, CANVAS_FORMATS.story);
      const overlap = (
        a: { x: number; y: number; width: number; height: number },
        b: { x: number; y: number; width: number; height: number },
      ) =>
        a.width > 0 &&
        b.width > 0 &&
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height;
      for (const hole of holes) {
        expect(overlap(hole, picture)).toBe(false);
        sides.forEach((side) => expect(overlap(hole, side)).toBe(false));
      }
    }
  });
});

describe('cropFrame', () => {
  it.each(Object.entries(CANVAS_FORMATS))(
    "%s: a box in the canvas's proportions, the pill under it, both inside the canvas",
    (_format, canvas) => {
      const { window, pill } = cropFrame(canvas);
      expect(window.width / window.height).toBeCloseTo(canvas.width / canvas.height);
      // Centered across, smaller than the canvas, with room for its handles.
      expect(window.x + window.width / 2).toBeCloseTo(0);
      expect(window.width).toBeLessThanOrEqual(canvas.width * 0.72 + 1e-9);
      const top = window.y;
      const bottom = pill.y + pill.height / 2;
      expect(pill.y - pill.height / 2).toBeGreaterThan(window.y + window.height);
      // Room over and under them, past the handles that stick out of the box.
      expect(top).toBeGreaterThanOrEqual(-canvas.height / 2 + 32);
      expect(bottom).toBeLessThanOrEqual(canvas.height / 2 - 32);
      // Both together in the middle, up and down.
      expect(top + bottom).toBeCloseTo(0);
      expect(pill.maxWidth).toBe(window.width);
    },
  );

  it('knows which holders are as big as the canvas', () => {
    expect(IMAGE_MOUNTS.filter((mount) => coversCanvas(mount))).toEqual(['camera', 'crop']);
    expect(coversCanvas(undefined)).toBe(false);
  });
});

describe('setLayerImage', () => {
  const template = withPictures(1);

  it('changes the picture, nothing else', () => {
    const changed = setLayerImage(template, 'image-1', 'picked-9');
    expect(changed.layers.at(-1)).toEqual({ ...template.layers.at(-1), image: 'picked-9' });
  });

  it('returns the same template when nothing changes', () => {
    expect(setLayerImage(template, 'image-1', 'picked-1')).toBe(template);
    expect(setLayerImage(template, 'missing', 'picked-9')).toBe(template);
    expect(setLayerImage(template, story.layers[0].id, 'picked-9')).toBe(template);
  });

  it('round-trips through the schema in both modes', () => {
    expect(parseTemplate(JSON.parse(JSON.stringify(template)))).toEqual(template);
  });
});
