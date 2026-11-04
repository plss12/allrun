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
  isEmptySlot,
  isPhotoSlot,
  MAX_IMAGES,
  mountBox,
  SAMPLE_IMAGE,
  setLayerImage,
  slotBox,
  usesEditorPhoto,
  withEmptySlots,
} from './image-layer';
import { setImageFrame, setImageRounded } from './layer-style';
import { IMAGE_MOUNTS, type Layer, parseTemplate, type Template } from './template';
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
    expect(isEmptySlot(slot('a', SAMPLE_IMAGE), true)).toBe(true);
    expect(isEmptySlot(slot('a', 'picked-1'), false)).toBe(false);
    expect(isEmptySlot(slot('a', EDITOR_PHOTO), true)).toBe(false);
    expect(isEmptySlot(slot('a', EDITOR_PHOTO), false)).toBe(true);
    expect(isEmptySlot(sticker, false)).toBe(false);
  });

  it("says when the editor's photo is in one, instead of over the canvas", () => {
    expect(usesEditorPhoto([slot('a', 'picked-1')])).toBe(false);
    expect(usesEditorPhoto([slot('a', 'picked-1'), slot('b', EDITOR_PHOTO)])).toBe(true);
    expect(usesEditorPhoto([{ ...sticker, image: EDITOR_PHOTO } as Layer])).toBe(false);
  });

  it('are saved empty, and pictures stuck on are not saved', () => {
    expect(withEmptySlots([slot('a', 'picked-1'), sticker, story.layers[0]])).toEqual([
      slot('a', SAMPLE_IMAGE),
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
    const box = mountBox(mount);
    const inside = (rect: { x: number; y: number; width: number; height: number }) => {
      expect(rect.x).toBeGreaterThanOrEqual(-box.width / 2);
      expect(rect.y).toBeGreaterThanOrEqual(-box.height / 2);
      expect(rect.x + rect.width).toBeLessThanOrEqual(box.width / 2 + 1e-9);
      expect(rect.y + rect.height).toBeLessThanOrEqual(box.height / 2 + 1e-9);
    };
    expect(box.height).toBe(IMAGE_SIDE);
    expect(box.width).toBeGreaterThan(box.picture.width);
    inside(box.picture);
    box.holes.forEach(inside);
    box.sides.forEach(inside);
    // As a phone's vertical photos, which it never cuts.
    expect(box.picture.width / box.picture.height).toBeCloseTo(3 / 4);
  });

  it('never covers the window with a cut-out, or a cut-out with a side', () => {
    for (const mount of IMAGE_MOUNTS) {
      const { picture, holes, sides } = mountBox(mount);
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

describe('setLayerImage and setImageFrame', () => {
  const template = withPictures(1);

  it('change the picture or the frame, nothing else', () => {
    const changed = setLayerImage(template, 'image-1', 'picked-9');
    expect(changed.layers.at(-1)).toEqual({ ...template.layers.at(-1), image: 'picked-9' });
    const dark = setImageFrame(template, 'image-1', 'dark');
    expect(dark.layers.at(-1)).toEqual({ ...template.layers.at(-1), frame: 'dark' });
  });

  it('return the same template when nothing changes', () => {
    expect(setLayerImage(template, 'image-1', 'picked-1')).toBe(template);
    expect(setLayerImage(template, 'missing', 'picked-9')).toBe(template);
    expect(setLayerImage(template, story.layers[0].id, 'picked-9')).toBe(template);
    expect(setImageFrame(template, 'image-1', 'light')).toBe(template);
  });

  it('round-trip through the schema in both modes', () => {
    expect(parseTemplate(JSON.parse(JSON.stringify(template)))).toEqual(template);
  });
});
