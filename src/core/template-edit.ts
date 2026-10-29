import { scaleLayer } from './layer-transform';
import type { Size } from './photo-placement';
import {
  type ActivityBlock,
  CANVAS_FORMATS,
  isLayerAllowed,
  type Layer,
  MAX_LAYERS,
  MAX_TEXT_LENGTH,
  type SummaryBlock,
  type Template,
} from './template';

/**
 * Edits of a template's layer list: adding, duplicating, removing, reordering and rewriting free
 * text. Every function is pure and returns `template` itself when nothing changes, so committing
 * the result records no empty undo step. Layers go bottom to top, as in the template.
 *
 * Mistakes the editor's UI already prevents (a layer of the other mode, a full template, a
 * duplicate id) throw instead of being ignored.
 */

/** How far a duplicate lands from its original, in canvas pixels (of 1080), on both axes. */
export const DUPLICATE_OFFSET = 48;

/** Whether another layer fits in the template. */
export function canAddLayer(template: Template): boolean {
  return template.layers.length < MAX_LAYERS;
}

/**
 * An id not used by any layer of `template`, made from `base`: `base` itself when free, else
 * `base-2`, `base-3`… A trailing `-N` of `base` is dropped first, so copies of copies read
 * `text-3` rather than `text-2-2`. Time O(n) for n layers, space O(n).
 */
export function uniqueLayerId(template: Template, base: string): string {
  const used = new Set(template.layers.map((layer) => layer.id));
  const stem = base.replace(/-\d+$/, '') || base;
  if (!used.has(stem)) {
    return stem;
  }
  for (let n = 2; ; n++) {
    const id = `${stem}-${n}`;
    if (!used.has(id)) {
      return id;
    }
  }
}

function assertCanInsert(template: Template, layer: Layer): void {
  if (!canAddLayer(template)) {
    throw new Error(`Template "${template.id}" already has ${MAX_LAYERS} layers`);
  }
  if (template.layers.some((existing) => existing.id === layer.id)) {
    throw new Error(`Template "${template.id}" already has a layer "${layer.id}"`);
  }
  if (!isLayerAllowed(template.mode, layer)) {
    throw new Error(`Layer "${layer.kind}" is not allowed in ${template.mode} templates`);
  }
}

/**
 * Puts `layer` on top of every other layer. Time and space O(n).
 *
 * @throws Error when the template is full, the id is taken or the layer doesn't fit its mode.
 */
export function addLayer(template: Template, layer: Layer): Template {
  assertCanInsert(template, layer);
  return { ...template, layers: [...template.layers, layer] };
}

/**
 * Copies a layer right above the original, `DUPLICATE_OFFSET` down and to the right (or up and to
 * the left where that would leave the canvas), so both stay visible. `template` itself when the
 * layer is missing. Time and space O(n).
 *
 * @throws Error when the template is full or `copyId` is taken.
 */
export function duplicateLayer(template: Template, id: string, copyId: string): Template {
  const index = template.layers.findIndex((layer) => layer.id === id);
  if (index === -1) {
    return template;
  }
  const original = template.layers[index];
  const canvas = CANVAS_FORMATS[template.format];
  const shift = (value: number, length: number) => {
    const offset = DUPLICATE_OFFSET / length;
    return value + offset <= 1 ? value + offset : Math.max(0, value - offset);
  };
  const copy: Layer = {
    ...original,
    id: copyId,
    transform: {
      ...original.transform,
      x: shift(original.transform.x, canvas.width),
      y: shift(original.transform.y, canvas.height),
    },
  };
  assertCanInsert(template, copy);
  const layers = [...template.layers];
  layers.splice(index + 1, 0, copy);
  return { ...template, layers };
}

/** Removes one layer; `template` itself when it is missing. Time and space O(n). */
export function removeLayer(template: Template, id: string): Template {
  const layers = template.layers.filter((layer) => layer.id !== id);
  return layers.length === template.layers.length ? template : { ...template, layers };
}

/**
 * Rescales a layer whose content went from `before` to `after` in size (another font, with other
 * proportions) so it covers as much of the canvas as before: its scale times the square root of
 * the areas' ratio, about its center, within the scale's bounds. A narrower font makes it a little
 * taller and a wider one a little lower, but it never shoots up or shrinks away. `template`
 * itself when the size is the same, either is empty or the layer is missing. Time and space O(n).
 */
export function keepLayerArea(template: Template, id: string, before: Size, after: Size): Template {
  const layer = template.layers.find((candidate) => candidate.id === id);
  const ratio = (before.width * before.height) / (after.width * after.height);
  if (layer === undefined || !Number.isFinite(ratio) || ratio <= 0 || ratio === 1) {
    return template;
  }
  const transform = scaleLayer(layer.transform, Math.sqrt(ratio));
  return {
    ...template,
    layers: template.layers.map((candidate) =>
      candidate === layer ? { ...layer, transform } : candidate,
    ),
  };
}

/** Where a layer can move in the stack: above every other layer, or below them. */
export type StackEnd = 'front' | 'back';

/** Whether moving the layer to `end` would change anything (it exists and isn't there yet). */
export function canMoveLayer(template: Template, id: string, end: StackEnd): boolean {
  const index = template.layers.findIndex((layer) => layer.id === id);
  return index !== -1 && index !== (end === 'front' ? template.layers.length - 1 : 0);
}

/**
 * Moves a layer above (`front`) or below (`back`) every other one; `template` itself when it is
 * missing or already there. Time and space O(n).
 */
export function moveLayer(template: Template, id: string, end: StackEnd): Template {
  const layer = template.layers.find((candidate) => candidate.id === id);
  if (layer === undefined || !canMoveLayer(template, id, end)) {
    return template;
  }
  const others = template.layers.filter((candidate) => candidate.id !== id);
  return { ...template, layers: end === 'front' ? [...others, layer] : [layer, ...others] };
}

/**
 * Normalizes free text typed by the user: surrounding spaces and blank lines go away. `null` when
 * nothing is left or it is longer than `MAX_TEXT_LENGTH`, so the editor knows not to accept it.
 */
export function cleanText(content: string): string | null {
  const text = content.trim();
  return text.length === 0 || text.length > MAX_TEXT_LENGTH ? null : text;
}

/**
 * Rewrites the content of a free-text layer; `template` itself when the layer is missing, is not
 * a text layer or already says that. Time and space O(n).
 *
 * @throws Error when `content` is blank or too long (see {@link cleanText}).
 */
export function setTextContent(template: Template, id: string, content: string): Template {
  const text = cleanText(content);
  if (text === null) {
    throw new Error(`Text layers need 1 to ${MAX_TEXT_LENGTH} characters`);
  }
  const current = template.layers.find((layer) => layer.id === id);
  if (current === undefined || current.kind !== 'text' || current.content === text) {
    return template;
  }
  const layers = template.layers.map((layer) =>
    layer.id === id && layer.kind === 'text' ? { ...layer, content: text } : layer,
  );
  return { ...template, layers };
}

/**
 * The words of a widget chosen from a list: a Bible verse, a quote or a chat message's phrase (of
 * the list or the user's own), of an activity's widget or, but for the chat, of a period's.
 */
export type ChosenWords =
  | Extract<ActivityBlock, { design: 'verse' | 'quote' | 'chat' }>
  | Extract<SummaryBlock, { design: 'verse' | 'quote' }>;

/** The words a layer shows from a list, if its words are chosen from one. */
export function chosenWordsOf(layer: Layer): ChosenWords | null {
  if (layer.kind === 'activityBlock') {
    const { block } = layer;
    return block.design === 'verse' || block.design === 'quote' || block.design === 'chat'
      ? block
      : null;
  }
  if (layer.kind === 'summaryBlock') {
    const { block } = layer;
    return block.design === 'verse' || block.design === 'quote' ? block : null;
  }
  return null;
}

function sameWords(a: ChosenWords, b: ChosenWords): boolean {
  switch (a.design) {
    case 'verse':
      return b.design === 'verse' && a.verse === b.verse;
    case 'quote':
      return b.design === 'quote' && a.quote === b.quote;
    case 'chat': {
      if (b.design !== 'chat' || a.layout !== b.layout) {
        return false;
      }
      const own = (phrase: typeof a.phrase) => (typeof phrase === 'string' ? null : phrase.own);
      return own(a.phrase) === null ? a.phrase === b.phrase : own(a.phrase) === own(b.phrase);
    }
  }
}

/**
 * Other words for a widget chosen from a list (another verse, quote or phrase), keeping its
 * place, size, rotation and style; `template` itself when the layer is missing or already says
 * that. Time and space O(n).
 *
 * @throws Error when the layer's words are not chosen from a list, or from another list.
 */
export function setChosenWords(template: Template, id: string, words: ChosenWords): Template {
  const current = template.layers.find((layer) => layer.id === id);
  if (current === undefined) {
    return template;
  }
  const chosen = chosenWordsOf(current);
  if (chosen === null || chosen.design !== words.design) {
    throw new Error(`Layer "${id}" can't take the words of a ${words.design}`);
  }
  if (sameWords(chosen, words)) {
    return template;
  }
  const layers = template.layers.map((layer): Layer => {
    if (layer !== current) {
      return layer;
    }
    if (layer.kind === 'activityBlock') {
      return { ...layer, block: words };
    }
    if (layer.kind === 'summaryBlock' && words.design !== 'chat') {
      return { ...layer, block: words };
    }
    throw new Error(`Layer "${id}" can't take the words of a ${words.design}`);
  });
  return { ...template, layers };
}
