import { makeActivity } from '@/test-utils/make-activity';

import { defaultActivityTemplate } from './default-layout';
import { backgroundColor, isOpaque } from './design-background';
import type { Template } from './template';

const design = defaultActivityTemplate(makeActivity(), 'story');
const photo = { width: 4032, height: 3024 };
const DOMINANT = '#4682C8';

const withBackground = (background: Template['background']): Template => ({
  ...design,
  background,
});

describe('backgroundColor', () => {
  it("is the photo's dominant color by default, and none without a photo", () => {
    expect(backgroundColor({ kind: 'auto' }, DOMINANT)).toBe(DOMINANT);
    expect(backgroundColor({ kind: 'auto' }, null)).toBeNull();
  });

  it("is the photo's color at its opacity, when it has one", () => {
    expect(backgroundColor({ kind: 'auto', opacity: 0.5 }, DOMINANT)).toBe(`${DOMINANT}80`);
    expect(backgroundColor({ kind: 'auto', opacity: 1 }, DOMINANT)).toBe(DOMINANT);
    expect(backgroundColor({ kind: 'auto', opacity: 0.5 }, null)).toBeNull();
    expect(isOpaque(withBackground({ kind: 'auto', opacity: 0.5 }), null, DOMINANT)).toBe(false);
  });

  it('is the chosen color, or none when transparent', () => {
    expect(backgroundColor({ kind: 'color', color: '#141B2D' }, DOMINANT)).toBe('#141B2D');
    expect(backgroundColor({ kind: 'transparent' }, DOMINANT)).toBeNull();
  });
});

describe('isOpaque', () => {
  it('is opaque over any background color', () => {
    const small = { ...design, photo: { ...design.photo, scale: 0.5 } };
    expect(isOpaque(small, photo, DOMINANT)).toBe(true);
    expect(isOpaque(withBackground({ kind: 'color', color: '#FFFFFF' }), null, null)).toBe(true);
  });

  it('is opaque over no background only while the photo covers the canvas', () => {
    const transparent = withBackground({ kind: 'transparent' });
    expect(isOpaque(transparent, photo, DOMINANT)).toBe(true);
    expect(isOpaque({ ...transparent, photo: { ...design.photo, scale: 0.5 } }, photo, null)).toBe(
      false,
    );
  });

  it('is see-through over a translucent color, unless the photo covers the canvas', () => {
    const translucent = withBackground({ kind: 'color', color: '#FFFFFF80' });
    expect(isOpaque(translucent, null, null)).toBe(false);
    expect(isOpaque(translucent, photo, null)).toBe(true);
    expect(isOpaque(withBackground({ kind: 'color', color: '#FFFFFFFF' }), null, null)).toBe(true);
  });

  it('is see-through without a photo, over the auto or no background: a sticker', () => {
    expect(isOpaque(design, null, null)).toBe(false);
    expect(isOpaque(withBackground({ kind: 'transparent' }), null, null)).toBe(false);
  });
});
