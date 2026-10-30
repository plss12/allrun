import { makeActivity } from '@/test-utils/make-activity';
import { makeSummary } from '@/test-utils/make-summary';

import { defaultActivityTemplate, defaultSummaryTemplate, newLayer } from './default-layout';
import { addLayer } from './template-edit';
import {
  isSaved,
  parseSavedTemplate,
  saveDesign,
  type SavedTemplate,
  templatesFor,
} from './user-templates';

const story = defaultActivityTemplate(makeActivity(), 'story');
const square = defaultActivityTemplate(makeActivity(), 'square');
const summaryStory = defaultSummaryTemplate(makeSummary(), 'story');

const at = (time: string) => `2026-10-18T${time}:00.000Z`;

describe('saveDesign', () => {
  it('keeps the design as it is under a new id', () => {
    const saved = saveDesign(story, 'mine-1', at('10:00'));
    expect(saved).toEqual({ savedAt: at('10:00'), template: { ...story, id: 'mine-1' } });
  });

  it("leaves out the user's pictures, which belong to the image, not to the design", () => {
    const picture = newLayer({ kind: 'image', image: 'picked-1', frame: 'none' }, 'image', 'story');
    const withPicture = addLayer(story, picture);
    const saved = saveDesign(withPicture, 'mine-1', at('10:00'));
    expect(saved.template.layers).toEqual(story.layers);
    expect(isSaved([saved], withPicture)).toBe(true);
  });

  it('round-trips through JSON and validation', () => {
    const saved = saveDesign(story, 'mine-1', at('10:00'));
    expect(parseSavedTemplate(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
});

describe('parseSavedTemplate', () => {
  it('rejects a broken template or date, naming the field', () => {
    const saved = saveDesign(story, 'mine-1', at('10:00'));
    expect(() => parseSavedTemplate({ ...saved, savedAt: 'yesterday' })).toThrow(/savedAt/);
    expect(() =>
      parseSavedTemplate({ ...saved, template: { ...saved.template, format: 'banner' } }),
    ).toThrow(/format/);
  });
});

describe('templatesFor', () => {
  const saved: SavedTemplate[] = [
    saveDesign(story, 'old', at('09:00')),
    saveDesign(square, 'square', at('11:00')),
    saveDesign(summaryStory, 'summary', at('12:00')),
    saveDesign(story, 'new', at('10:00')),
  ];

  it('keeps only those of the format and the data mode, newest first', () => {
    expect(templatesFor(saved, 'story', 'activity').map((s) => s.template.id)).toEqual([
      'new',
      'old',
    ]);
    expect(templatesFor(saved, 'story', 'summary').map((s) => s.template.id)).toEqual(['summary']);
    expect(templatesFor(saved, 'landscape', 'activity')).toEqual([]);
  });
});

describe('isSaved', () => {
  it('finds the same design whatever its id and the order of its fields', () => {
    const stored = parseSavedTemplate(
      JSON.parse(JSON.stringify(saveDesign(story, 'mine-1', at('10:00')))),
    );
    // Rebuilt with its fields in another order, as the editor might (the cast: Object.fromEntries
    // loses the layer type, but the values are those of the same layers).
    const reordered = {
      ...story,
      layers: story.layers.map((layer) => Object.fromEntries(Object.entries(layer).reverse())),
    } as typeof story;
    expect(isSaved([stored], reordered)).toBe(true);
  });

  it('tells apart a moved widget, another format or another mode', () => {
    const saved = [saveDesign(story, 'mine-1', at('10:00'))];
    const [first, ...rest] = story.layers;
    const moved = {
      ...story,
      layers: [{ ...first, transform: { ...first.transform, x: 0.4 } }, ...rest],
    };
    expect(isSaved(saved, moved)).toBe(false);
    expect(isSaved(saved, { ...story, format: 'square' })).toBe(false);
    expect(isSaved(saved, { ...story, mode: 'summary' })).toBe(false);
    expect(isSaved([], story)).toBe(false);
  });

  it('tells apart another photo placement or background', () => {
    const saved = [saveDesign(story, 'mine-1', at('10:00'))];
    expect(isSaved(saved, { ...story, photo: { ...story.photo, scale: 0.5 } })).toBe(false);
    expect(isSaved(saved, { ...story, background: { kind: 'transparent' } })).toBe(false);
  });
});
