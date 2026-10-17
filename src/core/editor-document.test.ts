import { makeActivity } from '@/test-utils/make-activity';

import { defaultActivityTemplate } from './default-layout';
import {
  createDocument,
  type DefaultTemplate,
  resetFraming,
  sameDocument,
  setFormat,
  setFraming,
} from './editor-document';
import { DEFAULT_FRAMING } from './photo-framing';

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
    const framing = { centerX: 0.3, centerY: 0.6, zoom: 2 };
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
    const framing = { centerX: 0.4, centerY: 0.5, zoom: 1.5 };
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
