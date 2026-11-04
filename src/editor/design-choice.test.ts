import { defaultActivityTemplate } from '@/core/default-layout';
import { INITIAL_DESIGN } from '@/core/editor-document';
import { makeActivity } from '@/test-utils/make-activity';
import { logError } from '@/ui/log';

import { applyChoice, type DesignChoice, parseDesignChoice } from './design-choice';
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

describe('applyChoice', () => {
  it('lays a collage out with its frame', () => {
    const design = applyChoice(
      INITIAL_DESIGN,
      { kind: 'collage', layout: 'four', frame: 'dark' },
      context,
      false,
    );
    expect(design.collage?.layout).toBe('four');
    expect(design.frame).toBe('dark');
  });

  it("opens one of the user's designs in its own format", () => {
    const design = applyChoice(INITIAL_DESIGN, { kind: 'saved', template: saved }, context, false);
    expect(design.format).toBe('square');
    expect(design.layers).toEqual(saved.layers);
  });
});
