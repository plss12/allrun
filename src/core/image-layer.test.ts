import { makeActivity } from '@/test-utils/make-activity';

import { defaultActivityTemplate, newLayer } from './default-layout';
import {
  canAddImage,
  FRAME_SHARE,
  IMAGE_SIDE,
  imageBox,
  imageCount,
  INSTANT,
  instantBox,
  instantFrame,
  MAX_IMAGES,
  setLayerImage,
  withoutImages,
} from './image-layer';
import { setImageFrame } from './layer-style';
import { parseTemplate, type Template } from './template';
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

  it('leaves the pictures out of the layers, keeping the rest in order', () => {
    expect(withoutImages(withPictures(2).layers)).toEqual(story.layers);
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
