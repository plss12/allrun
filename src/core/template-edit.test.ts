import { makeActivity } from '@/test-utils/make-activity';

import { defaultActivityTemplate } from './default-layout';
import { type Layer, MAX_LAYERS, MAX_TEXT_LENGTH, parseTemplate, type Template } from './template';
import {
  addLayer,
  canAddLayer,
  canMoveLayer,
  cleanText,
  DUPLICATE_OFFSET,
  duplicateLayer,
  moveLayer,
  removeLayer,
  setTextContent,
  uniqueLayerId,
} from './template-edit';

const template = defaultActivityTemplate(makeActivity(), 'story');
const ids = (edited: Template) => edited.layers.map((layer) => layer.id);

const text = (id: string, content = 'Race day'): Extract<Layer, { kind: 'text' }> => ({
  id,
  kind: 'text',
  content,
  style: {
    font: 'inter',
    color: '#FFFFFF',
    bold: true,
    uppercase: false,
    align: 'center',
    shadow: true,
  },
  transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
  opacity: 1,
});

/** A template with `count` text layers. */
const filled = (count: number): Template => ({
  ...template,
  layers: Array.from({ length: count }, (_, i) => text(`text-${i}`)),
});

describe('uniqueLayerId', () => {
  it('keeps a free id and numbers taken ones', () => {
    expect(uniqueLayerId(template, 'text')).toBe('text');
    expect(uniqueLayerId(template, 'route')).toBe('route-2');
    const withCopy = addLayer(template, text('route-2'));
    expect(uniqueLayerId(withCopy, 'route')).toBe('route-3');
  });

  it('numbers copies of copies from the original id', () => {
    const withCopy = addLayer(template, text('route-2'));
    expect(uniqueLayerId(withCopy, 'route-2')).toBe('route-3');
  });
});

describe('addLayer', () => {
  it('puts the layer on top and keeps the template valid', () => {
    const edited = addLayer(template, text('text'));
    expect(ids(edited)).toEqual([...ids(template), 'text']);
    expect(parseTemplate(edited)).toEqual(edited);
  });

  it('refuses taken ids, layers of the other mode and full templates', () => {
    expect(() => addLayer(template, text('route'))).toThrow(/already has a layer "route"/);
    const period: Layer = { ...text('period'), kind: 'info', field: 'periodName' };
    expect(() => addLayer(template, period)).toThrow(/not allowed in activity/);
    expect(canAddLayer(filled(MAX_LAYERS - 1))).toBe(true);
    expect(canAddLayer(filled(MAX_LAYERS))).toBe(false);
    expect(() => addLayer(filled(MAX_LAYERS), text('one-more'))).toThrow(/already has 50/);
  });
});

describe('duplicateLayer', () => {
  it('puts the copy right above the original, offset down and to the right', () => {
    const edited = duplicateLayer(template, 'route', 'route-2');
    const index = ids(edited).indexOf('route');
    expect(ids(edited)[index + 1]).toBe('route-2');
    const [original, copy] = [edited.layers[index], edited.layers[index + 1]];
    expect(copy.transform.x).toBeCloseTo(original.transform.x + DUPLICATE_OFFSET / 1080);
    expect(copy.transform.y).toBeCloseTo(original.transform.y + DUPLICATE_OFFSET / 1920);
    expect({ ...copy, id: original.id, transform: original.transform }).toEqual(original);
  });

  it('offsets the other way at the right and bottom edges, staying on the canvas', () => {
    const corner = { ...text('corner'), transform: { x: 1, y: 0.99, scale: 1, rotation: 0 } };
    const edited = duplicateLayer(addLayer(template, corner), 'corner', 'corner-2');
    const copy = edited.layers.find((layer) => layer.id === 'corner-2');
    expect(copy?.transform.x).toBeCloseTo(1 - DUPLICATE_OFFSET / 1080);
    expect(copy?.transform.y).toBeCloseTo(0.99 - DUPLICATE_OFFSET / 1920);
  });

  it('returns the template itself for a missing layer and refuses a full one', () => {
    expect(duplicateLayer(template, 'missing', 'copy')).toBe(template);
    expect(() => duplicateLayer(filled(MAX_LAYERS), 'text-0', 'copy')).toThrow(/already has 50/);
  });
});

describe('removeLayer', () => {
  it('removes only that layer', () => {
    expect(ids(removeLayer(template, 'route'))).toEqual(ids(template).slice(1));
  });

  it('returns the template itself for a missing layer', () => {
    expect(removeLayer(template, 'missing')).toBe(template);
  });
});

describe('moveLayer', () => {
  it('moves a layer to the front or the back, keeping the others in order', () => {
    const [bottom, ...rest] = ids(template);
    expect(ids(moveLayer(template, bottom, 'front'))).toEqual([...rest, bottom]);
    const top = ids(template)[ids(template).length - 1];
    expect(ids(moveLayer(template, top, 'back'))).toEqual([top, ...ids(template).slice(0, -1)]);
  });

  it('does nothing for a layer already there or missing', () => {
    const [bottom] = ids(template);
    const top = ids(template)[ids(template).length - 1];
    expect(canMoveLayer(template, bottom, 'back')).toBe(false);
    expect(canMoveLayer(template, bottom, 'front')).toBe(true);
    expect(canMoveLayer(template, top, 'front')).toBe(false);
    expect(canMoveLayer(template, 'missing', 'front')).toBe(false);
    expect(moveLayer(template, bottom, 'back')).toBe(template);
    expect(moveLayer(template, 'missing', 'front')).toBe(template);
  });
});

describe('cleanText and setTextContent', () => {
  it('trims text and rejects blank or too long text', () => {
    expect(cleanText('  Race day \n')).toBe('Race day');
    expect(cleanText(' \n ')).toBeNull();
    expect(cleanText('a'.repeat(MAX_TEXT_LENGTH))).toHaveLength(MAX_TEXT_LENGTH);
    expect(cleanText('a'.repeat(MAX_TEXT_LENGTH + 1))).toBeNull();
  });

  it('rewrites a text layer', () => {
    const withText = addLayer(template, text('text'));
    const edited = setTextContent(withText, 'text', ' PB! ');
    expect(edited.layers.find((layer) => layer.id === 'text')).toMatchObject({ content: 'PB!' });
  });

  it('ignores other layers, missing ones and unchanged text, and throws on blank text', () => {
    const withText = addLayer(template, text('text'));
    expect(setTextContent(withText, 'name', 'Not a text layer')).toBe(withText);
    expect(setTextContent(withText, 'missing', 'Hi')).toBe(withText);
    expect(setTextContent(withText, 'text', 'Race day ')).toBe(withText);
    expect(() => setTextContent(withText, 'text', '   ')).toThrow(/1 to 200 characters/);
  });
});
