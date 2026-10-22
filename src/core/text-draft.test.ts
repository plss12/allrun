import { makeActivity } from '@/test-utils/make-activity';

import { defaultActivityTemplate, newLayer } from './default-layout';
import { starterTemplate } from './starter-templates';
import { MAX_TEXT_LENGTH, parseTemplate, type Template } from './template';
import { addLayer } from './template-edit';
import { commitTextDraft, editTextDraft, previewTextDraft } from './text-draft';

const base = defaultActivityTemplate(makeActivity(), 'story');
const withText: Template = addLayer(
  base,
  newLayer({ kind: 'text', content: 'PB!' }, 'text', 'story'),
);
const textLayer = withText.layers[withText.layers.length - 1];
if (textLayer.kind !== 'text') {
  throw new Error('Expected the text layer on top');
}
const contentOf = (template: Template, id: string) => {
  const layer = template.layers.find((candidate) => candidate.id === id);
  return layer?.kind === 'text' ? layer.content : undefined;
};

describe('previewTextDraft', () => {
  it('shows the draft in place of an existing text, even while empty', () => {
    const draft = { ...editTextDraft(textLayer), content: '' };
    expect(contentOf(previewTextDraft(withText, draft), 'text')).toBe('');
  });

  it('shows a new text on top, centered', () => {
    const preview = previewTextDraft(base, { layerId: 'text', isNew: true, content: 'Ra' });
    const top = preview.layers[preview.layers.length - 1];
    expect(top).toMatchObject({ id: 'text', kind: 'text', content: 'Ra' });
    expect(top.transform).toMatchObject({ x: 0.5, y: 0.5 });
  });
});

describe('commitTextDraft', () => {
  it('adds a new text, trimmed, as a valid template', () => {
    const committed = commitTextDraft(base, { layerId: 'text', isNew: true, content: ' PB! ' });
    expect(contentOf(committed, 'text')).toBe('PB!');
    expect(parseTemplate(committed)).toEqual(committed);
  });

  it('adds nothing for a blank new text', () => {
    expect(commitTextDraft(base, { layerId: 'text', isNew: true, content: '  ' })).toBe(base);
  });

  it('rewrites an existing text, or leaves the template as is when unchanged', () => {
    const draft = editTextDraft(textLayer);
    expect(commitTextDraft(withText, draft)).toBe(withText);
    const rewritten = commitTextDraft(withText, { ...draft, content: 'Race day' });
    expect(contentOf(rewritten, 'text')).toBe('Race day');
  });

  it('removes an existing text cleared to nothing', () => {
    const cleared = commitTextDraft(withText, { ...editTextDraft(textLayer), content: '' });
    expect(cleared.layers.some((layer) => layer.id === 'text')).toBe(false);
  });

  it('refuses text over the maximum length instead of dropping the layer', () => {
    const long = 'a'.repeat(MAX_TEXT_LENGTH + 1);
    expect(() => commitTextDraft(withText, { ...editTextDraft(textLayer), content: long })).toThrow(
      /at most 200 characters/,
    );
  });
});

describe('new texts', () => {
  it('take the font of the design they are added to', () => {
    const poster = starterTemplate(
      'poster',
      { mode: 'activity', activity: makeActivity() },
      'story',
    );
    const draft = { layerId: 'text', isNew: true, content: 'PB!' };
    for (const template of [previewTextDraft(poster, draft), commitTextDraft(poster, draft)]) {
      const added = template.layers[template.layers.length - 1];
      expect(added.kind === 'text' && added.style.font).toBe('unbounded');
    }
  });
});
