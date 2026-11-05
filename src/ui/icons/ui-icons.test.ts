import CanvasKitInit, { type CanvasKit } from 'canvaskit-wasm/bin/full/canvaskit';

import { SPORT_ICON_PATHS } from '@/editor/icons/sport-icons.generated';
import { SPORT_ICON_CHARACTERS, UI_ICON_CHARACTERS } from '@/ui/icons/icon-font.generated';
import { UI_ICON_PATHS, UI_ICON_SIZE, type UiIconName } from '@/ui/icons/ui-icons.generated';

// Node's own module, typed by hand: the app's type-check has no Node globals.
const fs = jest.requireActual<{ readFileSync(path: string): Uint8Array }>('fs');

/**
 * Off center allowed, in units of an icon's 960: the generator writes tenths of a unit, and Skia's
 * tight bounds of a rewritten curve move a little. A hundredth of a point on a 24 pt icon.
 */
const TOLERANCE = 0.5;

/** Icons that point sideways: their box goes a sixth of its width toward their point. */
const POINTING: Partial<Record<UiIconName, -1 | 1>> = {
  back: -1,
  chevronLeft: -1,
  chevronRight: 1,
};

describe('the icons of the interface', () => {
  let canvasKit: CanvasKit;
  beforeAll(async () => {
    canvasKit = await CanvasKitInit({});
  });

  /** Every icon's tight bounds, from CanvasKit's own reading of its path. */
  function boundsOf(name: UiIconName): readonly [number, number, number, number] {
    const path = canvasKit.Path.MakeFromSVGString(UI_ICON_PATHS[name]);
    if (path === null) {
      throw new Error(`Invalid SVG path of the icon "${name}"`);
    }
    const [left, top, right, bottom] = path.computeTightBounds();
    path.delete();
    return [left, top, right, bottom];
  }

  // The user's rule: every icon in the middle of its button, by its shape and not by its box.
  it.each(Object.keys(UI_ICON_PATHS) as UiIconName[])('%s is centered in its box', (name) => {
    const [left, top, right, bottom] = boundsOf(name);
    const shift = ((POINTING[name] ?? 0) * (right - left)) / 6;
    expect(Math.abs((left + right) / 2 - shift - UI_ICON_SIZE / 2)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs((top + bottom) / 2 - UI_ICON_SIZE / 2)).toBeLessThanOrEqual(TOLERANCE);
  });

  describe('in the font the screens draw them with', () => {
    /** The font's height over its baseline: its line is the icon's box (build-icon-font.py). */
    const ASCENT = 720;

    /** A character's bounds in its box, as the path's: [left, top, right, bottom]. */
    function glyphBounds(character: string): readonly [number, number, number, number] {
      const typeface = canvasKit.Typeface.MakeTypefaceFromData(
        new Uint8Array(fs.readFileSync('assets/fonts/allrun-icons.otf')).buffer,
      );
      if (typeface === null) {
        throw new Error('Could not read the font of the icons');
      }
      const font = new canvasKit.Font(typeface, UI_ICON_SIZE);
      const [left, top, right, bottom] = font.getGlyphBounds(font.getGlyphIDs(character));
      font.delete();
      typeface.delete();
      return [left, top + ASCENT, right, bottom + ASCENT];
    }

    it('has a character for every icon, and every sport', () => {
      expect(Object.keys(UI_ICON_CHARACTERS).sort()).toEqual(Object.keys(UI_ICON_PATHS).sort());
      expect(Object.keys(SPORT_ICON_CHARACTERS).sort()).toEqual(
        Object.keys(SPORT_ICON_PATHS).sort(),
      );
    });

    // The icons are drawn with this font: a stale one would bring back an off-center icon.
    it.each(Object.keys(UI_ICON_PATHS) as UiIconName[])('%s is where its path is', (name) => {
      const glyph = glyphBounds(UI_ICON_CHARACTERS[name]);
      // CanvasKit's bounds of a glyph are wider than its shape and not quite even: this says that it
      // is the right shape in about the right place (fontTools reads at most 0.5 off, ADR 014).
      const [left, top, right, bottom] = boundsOf(name);
      expect(Math.abs((glyph[0] + glyph[2]) / 2 - (left + right) / 2)).toBeLessThan(5);
      expect(Math.abs((glyph[1] + glyph[3]) / 2 - (top + bottom) / 2)).toBeLessThan(5);
      expect(Math.abs(glyph[2] - glyph[0] - (right - left))).toBeLessThan(30);
      expect(Math.abs(glyph[3] - glyph[1] - (bottom - top))).toBeLessThan(30);
    });

    it.each(Object.keys(SPORT_ICON_CHARACTERS) as (keyof typeof SPORT_ICON_CHARACTERS)[])(
      'the sport %s is in the middle of its box, by its shape',
      (name) => {
        const [left, top, right, bottom] = glyphBounds(SPORT_ICON_CHARACTERS[name]);
        expect(Math.abs((left + right) / 2 - UI_ICON_SIZE / 2)).toBeLessThan(1);
        expect(Math.abs((top + bottom) / 2 - UI_ICON_SIZE / 2)).toBeLessThan(1);
      },
    );
  });

  it.each(Object.keys(UI_ICON_PATHS) as UiIconName[])('%s fits in its box', (name) => {
    const [left, top, right, bottom] = boundsOf(name);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(UI_ICON_SIZE);
    expect(bottom).toBeLessThanOrEqual(UI_ICON_SIZE);
  });

  it('points left and right just as far from the middle', () => {
    const [left, , right] = boundsOf('chevronLeft');
    const [mirrorLeft, , mirrorRight] = boundsOf('chevronRight');
    expect(left).toBeCloseTo(UI_ICON_SIZE - mirrorRight, 0);
    expect(right).toBeCloseTo(UI_ICON_SIZE - mirrorLeft, 0);
  });

  it.each([
    ['collages', [320, 640], [320, 640]],
    ['designs', [320], [320, 640]],
    ['designs', [640], [320, 480, 640]],
  ] as const)('%s leaves its panes empty', (name, columns, rows) => {
    const path = canvasKit.Path.MakeFromSVGString(UI_ICON_PATHS[name]);
    if (path === null) {
      throw new Error(`Invalid SVG path of the icon "${name}"`);
    }
    for (const x of columns) {
      for (const y of rows) {
        expect(path.contains(x, y)).toBe(false);
      }
    }
    // The walls between them are drawn.
    expect(path.contains(480, 320)).toBe(true);
    path.delete();
  });

  it('saves and exports with the same tray and an arrow as long', () => {
    expect(boundsOf('save')).toEqual(boundsOf('export'));
  });
});
