import { makeActivity } from '@/test-utils/make-activity';

import { defaultActivityTemplate } from './default-layout';
import {
  canRestore,
  type DefaultTemplate,
  editLayers,
  type EditorLayers,
  layoutTemplate,
  setLayerTransform,
} from './editor-document';
import { commit, createHistory, undo } from './history';
import { removeLayer } from './template-edit';

const activity = makeActivity();
const defaultTemplate: DefaultTemplate = (format) => defaultActivityTemplate(activity, format);
const moved = { x: 0.3, y: 0.4, scale: 1.5, rotation: 0.2 };

describe('layoutTemplate', () => {
  it('uses the default layout of each format while the widgets are untouched', () => {
    expect(layoutTemplate(defaultTemplate, 'square', null)).toEqual(defaultTemplate('square'));
  });

  it("keeps the user's layers in any format", () => {
    const layers = defaultTemplate('story').layers.slice(1);
    const square = layoutTemplate(defaultTemplate, 'square', layers);
    expect(square.format).toBe('square');
    expect(square.layers).toBe(layers);
  });
});

describe('editLayers', () => {
  it("applies the edit and makes the layers the user's own", () => {
    const template = layoutTemplate(defaultTemplate, 'story', null);
    const [first, ...rest] = template.layers;
    expect(editLayers(null, template, (current) => removeLayer(current, first.id))).toEqual(rest);
  });

  it('returns the same layers when the edit changes nothing', () => {
    const template = layoutTemplate(defaultTemplate, 'story', null);
    expect(editLayers(null, template, (current) => removeLayer(current, 'missing'))).toBeNull();
  });
});

describe('setLayerTransform', () => {
  it('changes only that layer', () => {
    const template = defaultTemplate('story');
    const [first, second] = template.layers;
    const edited = setLayerTransform(template, second.id, moved);
    expect(edited.layers[1].transform).toEqual(moved);
    expect(edited.layers[0]).toBe(first);
  });

  it('returns the same template for a missing layer or an unchanged transform', () => {
    const template = defaultTemplate('story');
    const [first] = template.layers;
    expect(setLayerTransform(template, 'missing', moved)).toBe(template);
    expect(setLayerTransform(template, first.id, { ...first.transform })).toBe(template);
  });
});

describe('undo and starting over', () => {
  // The editor keeps the format apart from the history: here it is just a variable.
  const format = 'square';

  it('undoes the widgets in the format chosen since, not the one they were edited in', () => {
    const story = layoutTemplate(defaultTemplate, 'story', null);
    const edited = editLayers(null, story, (current) =>
      setLayerTransform(current, current.layers[0].id, moved),
    );
    let history = commit(createHistory<EditorLayers>(null), edited);
    expect(layoutTemplate(defaultTemplate, format, history.present).layers[0].transform).toEqual(
      moved,
    );
    history = undo(history);
    expect(layoutTemplate(defaultTemplate, format, history.present)).toEqual(
      defaultTemplate(format),
    );
  });

  it('starts over to the default layout of the chosen format, only once edited', () => {
    expect(canRestore(null)).toBe(false);
    const edited = defaultTemplate('story').layers.slice(1);
    expect(canRestore(edited)).toBe(true);
    const history = commit(commit(createHistory<EditorLayers>(null), edited), null);
    expect(layoutTemplate(defaultTemplate, format, history.present)).toEqual(
      defaultTemplate(format),
    );
    expect(undo(history).present).toBe(edited);
  });
});
