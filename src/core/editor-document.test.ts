import { makeActivity } from '@/test-utils/make-activity';

import { defaultActivityTemplate } from './default-layout';
import {
  createDocument,
  type DefaultTemplate,
  editLayers,
  resetFraming,
  resetLayout,
  sameDocument,
  setFormat,
  setFraming,
  setLayerTransform,
} from './editor-document';
import { DEFAULT_FRAMING } from './photo-framing';
import { removeLayer } from './template-edit';

const activity = makeActivity();
const defaultTemplate: DefaultTemplate = (format) => defaultActivityTemplate(activity, format);

describe('setFormat', () => {
  it('uses the default layout of the new format while the layout is untouched', () => {
    const document = createDocument(defaultTemplate, 'story', DEFAULT_FRAMING);
    const square = setFormat(document, 'square', defaultTemplate);
    expect(square.template).toEqual(defaultTemplate('square'));
    expect(square.customLayout).toBe(false);
  });

  it("keeps the user's layers once they changed them", () => {
    const document = createDocument(defaultTemplate, 'story', DEFAULT_FRAMING);
    const [first, ...rest] = document.template.layers;
    const moved = { ...first, transform: { ...first.transform, x: 0.2 } };
    const custom = {
      ...document,
      template: { ...document.template, layers: [moved, ...rest] },
      customLayout: true,
    };
    const square = setFormat(custom, 'square', defaultTemplate);
    expect(square.template.format).toBe('square');
    expect(square.template.layers).toBe(custom.template.layers);
    expect(square.customLayout).toBe(true);
  });

  it('keeps the photo framing', () => {
    const framing = { centerX: 0.3, centerY: 0.6, zoom: 2, rotation: 0 };
    const document = createDocument(defaultTemplate, 'story', framing);
    expect(setFormat(document, 'landscape', defaultTemplate).framing).toBe(framing);
  });

  it('returns the same document for the current format', () => {
    const document = createDocument(defaultTemplate, 'story', DEFAULT_FRAMING);
    expect(setFormat(document, 'story', defaultTemplate)).toBe(document);
  });
});

describe('setFraming', () => {
  it('sets a new framing', () => {
    const document = createDocument(defaultTemplate, 'story', DEFAULT_FRAMING);
    const framing = { centerX: 0.4, centerY: 0.5, zoom: 1.5, rotation: 0.2 };
    expect(setFraming(document, framing).framing).toBe(framing);
  });

  it('returns the same document for an equal framing', () => {
    const document = createDocument(defaultTemplate, 'story', DEFAULT_FRAMING);
    expect(setFraming(document, { ...DEFAULT_FRAMING })).toBe(document);
  });
});

describe('resetFraming and sameDocument', () => {
  it('centers the photo again', () => {
    const document = createDocument(defaultTemplate, 'story', {
      centerX: 0.2,
      centerY: 0.7,
      zoom: 3,
      rotation: -0.5,
    });
    expect(resetFraming(document).framing).toEqual(DEFAULT_FRAMING);
  });

  it('tells apart documents with another layout or framing', () => {
    const document = createDocument(defaultTemplate, 'story', DEFAULT_FRAMING);
    expect(sameDocument(document, { ...document, framing: { ...DEFAULT_FRAMING } })).toBe(true);
    expect(sameDocument(document, setFormat(document, 'square', defaultTemplate))).toBe(false);
    expect(sameDocument(document, setFraming(document, { ...DEFAULT_FRAMING, zoom: 2 }))).toBe(
      false,
    );
  });
});

describe('setLayerTransform and resetLayout', () => {
  const moved = { x: 0.3, y: 0.4, scale: 1.5, rotation: 0.2 };

  it('changes only that layer and makes the layout custom', () => {
    const document = createDocument(defaultTemplate, 'story', DEFAULT_FRAMING);
    const [first, second] = document.template.layers;
    const edited = setLayerTransform(document, second.id, moved);
    expect(edited.template.layers[1].transform).toEqual(moved);
    expect(edited.template.layers[0]).toBe(first);
    expect(edited.customLayout).toBe(true);
  });

  it('returns the same document for a missing layer or an unchanged transform', () => {
    const document = createDocument(defaultTemplate, 'story', DEFAULT_FRAMING);
    const [first] = document.template.layers;
    expect(setLayerTransform(document, 'missing', moved)).toBe(document);
    expect(setLayerTransform(document, first.id, { ...first.transform })).toBe(document);
  });

  it('restores the default layout of the current format', () => {
    const document = createDocument(defaultTemplate, 'story', DEFAULT_FRAMING);
    const edited = setFormat(
      setLayerTransform(document, document.template.layers[0].id, moved),
      'square',
      defaultTemplate,
    );
    const restored = resetLayout(edited, defaultTemplate);
    expect(restored.template).toEqual(defaultTemplate('square'));
    expect(restored.customLayout).toBe(false);
    expect(resetLayout(restored, defaultTemplate)).toBe(restored);
  });
});

describe('editLayers', () => {
  it('applies the edit and makes the layout custom, undone by restoring it', () => {
    const document = createDocument(defaultTemplate, 'story', DEFAULT_FRAMING);
    const [first, ...rest] = document.template.layers;
    const removed = editLayers(document, (template) => removeLayer(template, first.id));
    expect(removed.template.layers).toEqual(rest);
    expect(removed.customLayout).toBe(true);
    expect(resetLayout(removed, defaultTemplate).template.layers[0]).toEqual(first);
  });

  it('returns the same document when the edit changes nothing', () => {
    const document = createDocument(defaultTemplate, 'story', DEFAULT_FRAMING);
    expect(editLayers(document, (template) => removeLayer(template, 'missing'))).toBe(document);
  });
});
