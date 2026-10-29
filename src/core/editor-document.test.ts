import { makeActivity } from '@/test-utils/make-activity';

import { defaultActivityTemplate } from './default-layout';
import {
  canStartOver,
  type DefaultTemplate,
  editLayers,
  type EditorDesign,
  INITIAL_DESIGN,
  layoutTemplate,
  setFormat,
  setFraming,
  setLayers,
  setLayerTransform,
  startOver,
} from './editor-document';
import { commit, createHistory, undo } from './history';
import { DEFAULT_FRAMING } from './photo-framing';
import { removeLayer } from './template-edit';

const activity = makeActivity();
const defaultTemplate: DefaultTemplate = (format) => defaultActivityTemplate(activity, format);
const moved = { x: 0.3, y: 0.4, scale: 1.5, rotation: 0.2 };
const framed = { centerX: 0.4, centerY: 0.6, zoom: 1.5, rotation: 0.1 };

/** `design` with its first layer moved. */
function withFirstMoved(design: EditorDesign): EditorDesign {
  return editLayers(design, defaultTemplate, (current) =>
    setLayerTransform(current, current.layers[0].id, moved),
  );
}

describe('layoutTemplate', () => {
  it('uses the default layout of each format while the widgets are untouched', () => {
    const square = setFormat(INITIAL_DESIGN, 'square');
    expect(layoutTemplate(defaultTemplate, square)).toEqual(defaultTemplate('square'));
  });

  it("keeps the user's layers in any format", () => {
    const layers = defaultTemplate('story').layers.slice(1);
    const square = layoutTemplate(defaultTemplate, { ...INITIAL_DESIGN, format: 'square', layers });
    expect(square.format).toBe('square');
    expect(square.layers).toBe(layers);
  });
});

describe('editLayers', () => {
  it("applies the edit and makes the layers the user's own", () => {
    const [first, ...rest] = defaultTemplate('story').layers;
    const edited = editLayers(INITIAL_DESIGN, defaultTemplate, (current) =>
      removeLayer(current, first.id),
    );
    expect(edited.layers).toEqual(rest);
    expect(edited.format).toBe('story');
    expect(edited.framing).toBe(INITIAL_DESIGN.framing);
  });

  it('returns the same design when the edit changes nothing', () => {
    expect(
      editLayers(INITIAL_DESIGN, defaultTemplate, (current) => removeLayer(current, 'missing')),
    ).toBe(INITIAL_DESIGN);
  });
});

describe('setLayers, setFormat and setFraming', () => {
  it('return the same design when nothing changes, so no undo step is recorded', () => {
    expect(setLayers(INITIAL_DESIGN, null)).toBe(INITIAL_DESIGN);
    expect(setFormat(INITIAL_DESIGN, 'story')).toBe(INITIAL_DESIGN);
    expect(setFraming(INITIAL_DESIGN, { ...DEFAULT_FRAMING })).toBe(INITIAL_DESIGN);
  });

  it('change only their part of the design', () => {
    const layers = defaultTemplate('story').layers.slice(1);
    expect(setLayers(INITIAL_DESIGN, layers)).toEqual({ ...INITIAL_DESIGN, layers });
    expect(setFormat(INITIAL_DESIGN, 'landscape')).toEqual({
      ...INITIAL_DESIGN,
      format: 'landscape',
    });
    expect(setFraming(INITIAL_DESIGN, framed)).toEqual({ ...INITIAL_DESIGN, framing: framed });
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

describe('the history of a design', () => {
  it('keeps edited widgets where they are when the format changes, and undoes the change', () => {
    const edited = withFirstMoved(INITIAL_DESIGN);
    let history = commit(createHistory(INITIAL_DESIGN), edited);
    history = commit(history, setFormat(history.present, 'square'));
    const square = layoutTemplate(defaultTemplate, history.present);
    expect(square.format).toBe('square');
    expect(square.layers[0].transform).toEqual(moved);
    history = undo(history);
    expect(history.present).toBe(edited);
  });

  it('lays out the default widgets again in a new format while they are untouched', () => {
    const square = setFormat(INITIAL_DESIGN, 'square');
    expect(layoutTemplate(defaultTemplate, square)).toEqual(defaultTemplate('square'));
  });

  it('undoes a framing of the photo like any other step', () => {
    const history = commit(createHistory(INITIAL_DESIGN), setFraming(INITIAL_DESIGN, framed));
    expect(history.present.framing).toEqual(framed);
    expect(undo(history).present).toBe(INITIAL_DESIGN);
  });
});

describe('startOver', () => {
  it('has nothing to start over in the design the editor opens with', () => {
    expect(canStartOver(INITIAL_DESIGN)).toBe(false);
    expect(startOver(INITIAL_DESIGN)).toBe(INITIAL_DESIGN);
    // Another format alone is no edit: the user picked it for where the image goes.
    const square = setFormat(INITIAL_DESIGN, 'square');
    expect(canStartOver(square)).toBe(false);
    expect(startOver(square)).toBe(square);
  });

  it('brings back the default widgets and framing, keeping the format', () => {
    const edited = setFraming(withFirstMoved(setFormat(INITIAL_DESIGN, 'portrait')), framed);
    expect(canStartOver(edited)).toBe(true);
    expect(startOver(edited)).toEqual({
      format: 'portrait',
      framing: DEFAULT_FRAMING,
      layers: null,
    });
    expect(canStartOver(setFraming(INITIAL_DESIGN, framed))).toBe(true);
  });

  it('is one more undoable step', () => {
    const edited = withFirstMoved(INITIAL_DESIGN);
    const history = commit(commit(createHistory(INITIAL_DESIGN), edited), startOver(edited));
    expect(layoutTemplate(defaultTemplate, history.present)).toEqual(defaultTemplate('story'));
    expect(undo(history).present).toBe(edited);
  });
});
