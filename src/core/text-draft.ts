import { newLayer } from './default-layout';
import { type Layer, MAX_TEXT_LENGTH, type Template } from './template';
import { addLayer, cleanText, removeLayer, setTextContent } from './template-edit';

/**
 * Free text typed straight onto the canvas: while the keyboard is up the canvas shows the draft
 * as it is typed, and only "Done" commits it, as a single undo step.
 */
export interface TextDraft {
  /** The text layer being written; for a new text, the id it will get. */
  readonly layerId: string;
  /** Whether the text is new, so committing adds it instead of rewriting it. */
  readonly isNew: boolean;
  readonly content: string;
}

/** Starts rewriting an existing text layer. */
export function editTextDraft(layer: Extract<Layer, { kind: 'text' }>): TextDraft {
  return { layerId: layer.id, isNew: false, content: layer.content };
}

/**
 * The template as the canvas shows it while typing: the draft in place of the layer's content, or
 * a new text layer on top. Only for display: the content may be empty, which a stored template
 * never allows. Time and space O(n) for n layers.
 */
export function previewTextDraft(template: Template, draft: TextDraft): Template {
  if (draft.isNew) {
    const layer = newLayer(
      { kind: 'text', content: draft.content },
      draft.layerId,
      template.format,
    );
    return { ...template, layers: [...template.layers, layer] };
  }
  const layers = template.layers.map((layer) =>
    layer.id === draft.layerId && layer.kind === 'text'
      ? { ...layer, content: draft.content }
      : layer,
  );
  return { ...template, layers };
}

/**
 * Commits a draft: a new text is added on top, an existing one rewritten. Text left blank adds
 * nothing, and removes an existing text, like clearing it in a story editor. Returns `template`
 * itself when nothing changes. Time and space O(n) for n layers.
 *
 * @throws Error when the text is longer than `MAX_TEXT_LENGTH` (the text field stops there).
 */
export function commitTextDraft(template: Template, draft: TextDraft): Template {
  if (draft.content.trim() === '') {
    return draft.isNew ? template : removeLayer(template, draft.layerId);
  }
  const content = cleanText(draft.content);
  if (content === null) {
    throw new Error(`Text layers hold at most ${MAX_TEXT_LENGTH} characters`);
  }
  return draft.isNew
    ? addLayer(template, newLayer({ kind: 'text', content }, draft.layerId, template.format))
    : setTextContent(template, draft.layerId, content);
}
