import { newCollage } from '@/core/collage';
import { defaultActivityTemplate } from '@/core/default-layout';
import { readyDesign, type ReadyDesignId } from '@/core/designs';
import { INITIAL_DESIGN } from '@/core/editor-document';
import { makeActivity } from '@/test-utils/make-activity';
import { logError } from '@/ui/log';

import { applyChoice, type DesignChoice, openChoice, parseDesignChoice } from './design-choice';
import { readyTemplate } from './ready-design';
import type { LayerContext } from './template-scene';

jest.mock('@/ui/log', () => ({ logError: jest.fn() }));
// Choosing a ready design measures with Skia, which the scene tests cover.
jest.mock('./ready-design', () => ({ readyTemplate: jest.fn() }));

const context = {} as LayerContext;
const saved = defaultActivityTemplate(makeActivity(), 'square');

describe('parseDesignChoice', () => {
  it('reads what the gallery sends', () => {
    const choices: DesignChoice[] = [
      { kind: 'collage', layout: 'two', frame: 'light' },
      { kind: 'ready', id: 'filmFrame' },
      { kind: 'saved', template: saved },
    ];
    for (const choice of choices) {
      expect(parseDesignChoice(JSON.stringify(choice))).toEqual(choice);
    }
  });

  it('has none without a param', () => {
    expect(parseDesignChoice(undefined)).toBeNull();
    expect(logError).not.toHaveBeenCalled();
  });

  it('logs and ignores what is not one, as the route can come from a deep link', () => {
    for (const wrong of ['not json', '{"kind":"ready","id":"nope"}', '{"kind":"collage"}']) {
      jest.mocked(logError).mockClear();
      expect(parseDesignChoice(wrong)).toBeNull();
      expect(logError).toHaveBeenCalledTimes(1);
    }
  });
});

describe('openChoice', () => {
  it("brings the unit and language of one of the user's designs to a new canvas", () => {
    const design = openChoice(
      { kind: 'saved', template: { ...saved, units: 'mi', language: 'en' } },
      context,
    );
    expect([design.units, design.language]).toEqual(['mi', 'en']);
  });

  it('leaves them to the phone and the app otherwise', () => {
    const design = openChoice({ kind: 'saved', template: saved }, context);
    expect([design.units, design.language]).toEqual([null, null]);
  });
});

describe('applyChoice', () => {
  it("keeps the canvas's unit and language on choosing one of the user's designs", () => {
    const design = applyChoice(
      { ...INITIAL_DESIGN, units: 'km', language: 'es' },
      { kind: 'saved', template: { ...saved, units: 'mi', language: 'en' } },
      context,
      [],
    );
    expect([design.units, design.language]).toEqual(['km', 'es']);
  });

  it('lays a collage out with its frame', () => {
    const design = applyChoice(
      INITIAL_DESIGN,
      { kind: 'collage', layout: 'four', frame: 'dark' },
      context,
      [],
    );
    expect(design.collage?.layout).toBe('four');
    expect(design.frame).toBe('dark');
  });

  it("opens one of the user's designs in its own format", () => {
    const design = applyChoice(INITIAL_DESIGN, { kind: 'saved', template: saved }, context, []);
    expect(design.format).toBe('square');
    expect(design.layers).toEqual(saved.layers);
  });

  it("takes the canvas's photo away for one of the user's designs over a color, as its tile shows", () => {
    const withPhoto = { ...INITIAL_DESIGN, photoId: 3 };
    const colored = { ...saved, background: { kind: 'color', color: '#141B2D' } } as const;
    const design = applyChoice(withPhoto, { kind: 'saved', template: colored }, context, []);
    expect(design.photoId).toBeNull();
    expect(design.background).toEqual(colored.background);
    // Over its photo (shown as transparency in its tile), the canvas's stays.
    const overPhoto = applyChoice(withPhoto, { kind: 'saved', template: saved }, context, []);
    expect(overPhoto.photoId).toBe(3);
  });

  it("takes the canvas's photo away for AllRun's designs over a color, and keeps it for those over it", () => {
    // Its recipe, without the measures of `readyTemplate`, which the scene tests cover.
    jest
      .mocked(readyTemplate)
      .mockImplementation(
        (id: ReadyDesignId, _context, format) =>
          readyDesign(id, { mode: 'activity', activity: makeActivity() }, format).template,
      );
    const withPhoto = { ...INITIAL_DESIGN, photoId: 3 };
    const choose = (id: ReadyDesignId) =>
      applyChoice(withPhoto, { kind: 'ready', id }, context, []);
    // The chat over black went over the photo being edited, not over black (the user's report).
    expect(choose('messageOne')).toMatchObject({ photoId: null, background: { kind: 'color' } });
    for (const id of [
      'polaroid',
      'polaroidDark',
      'photobooth',
      'calendar',
      'calendarInk',
    ] as const) {
      // Over the canvas's photo: kept, and with none, transparency shows, not black.
      expect(choose(id)).toMatchObject({ photoId: 3, background: { kind: 'auto' } });
    }
  });

  it("keeps the canvas's photo for a collage of the user's over a color: its cells hold photos", () => {
    const collage = {
      ...saved,
      background: { kind: 'color', color: '#141B2D' },
      collage: newCollage('two'),
    } as const;
    const design = applyChoice(
      { ...INITIAL_DESIGN, photoId: 3 },
      { kind: 'saved', template: collage },
      context,
      [],
    );
    expect(design.photoId).toBe(3);
  });
});
