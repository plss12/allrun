import type { LayerTransform } from './layer-transform';
import { DEFAULT_FRAMING, type PhotoFraming } from './photo-framing';
import type { CanvasFormat, Template } from './template';

/**
 * Everything the user edits in the editor and can undo: the design and how the photo is framed.
 * The photo itself and the data (activity or summary) are not part of it.
 */
export interface EditorDocument {
  readonly template: Template;
  readonly framing: PhotoFraming;
  /**
   * Whether the user changed the layers. Until they do, each format shows its own default
   * layout; afterwards a format change keeps their layers, which follow it thanks to their
   * relative positions.
   */
  readonly customLayout: boolean;
}

/** Default layout of the current activity or summary for a format. */
export type DefaultTemplate = (format: CanvasFormat) => Template;

/** Format a new design starts in, and goes back to when restored. */
export const INITIAL_FORMAT: CanvasFormat = 'story';

export function createDocument(
  defaultTemplate: DefaultTemplate,
  format: CanvasFormat,
  framing: PhotoFraming,
): EditorDocument {
  return { template: defaultTemplate(format), framing, customLayout: false };
}

/**
 * Switches the canvas format: the default layout of `format` while the layout is untouched, the
 * user's own layers otherwise. Returns `document` itself when nothing changes, so committing the
 * result records no undo step.
 */
export function setFormat(
  document: EditorDocument,
  format: CanvasFormat,
  defaultTemplate: DefaultTemplate,
): EditorDocument {
  if (format === document.template.format) {
    return document;
  }
  const template = document.customLayout
    ? { ...document.template, format }
    : defaultTemplate(format);
  return { ...document, template };
}

/**
 * Moves, scales or rotates one layer; the layout becomes the user's own. Returns `document`
 * itself when the layer is missing or already there, so no empty undo step is recorded.
 */
export function setLayerTransform(
  document: EditorDocument,
  id: string,
  transform: LayerTransform,
): EditorDocument {
  const current = document.template.layers.find((layer) => layer.id === id);
  if (current === undefined || sameTransform(current.transform, transform)) {
    return document;
  }
  const layers = document.template.layers.map((layer) =>
    layer.id === id ? { ...layer, transform } : layer,
  );
  return { ...document, template: { ...document.template, layers }, customLayout: true };
}

/**
 * Applies an edit of the layer list (see `template-edit.ts`); the layout becomes the user's own.
 * Returns `document` itself when the edit returns the template unchanged.
 */
export function editLayers(
  document: EditorDocument,
  change: (template: Template) => Template,
): EditorDocument {
  const template = change(document.template);
  if (template === document.template) {
    return document;
  }
  return { ...document, template, customLayout: true };
}

/**
 * Whether {@link restoreDocument} would change anything: the layers, the format or the photo
 * framing differ from how the editor started.
 */
export function canRestore(document: EditorDocument): boolean {
  return (
    document.customLayout ||
    document.template.format !== INITIAL_FORMAT ||
    !sameFraming(document.framing, DEFAULT_FRAMING)
  );
}

/**
 * Starts over: the editor as it opened, with the initial format, its default layout and the photo
 * centered and straight. It undoes everything undo can (the photo itself stays: picking it is not
 * an undo step), and is one undo step itself. Returns `document` itself when there is nothing to
 * restore.
 */
export function restoreDocument(
  document: EditorDocument,
  defaultTemplate: DefaultTemplate,
): EditorDocument {
  if (!canRestore(document)) {
    return document;
  }
  return createDocument(defaultTemplate, INITIAL_FORMAT, DEFAULT_FRAMING);
}

/** Sets the photo framing; returns `document` itself when it is the same framing. */
export function setFraming(document: EditorDocument, framing: PhotoFraming): EditorDocument {
  return sameFraming(framing, document.framing) ? document : { ...document, framing };
}

/** Centers a new photo: framings are proportions of one photo and mean nothing for another. */
export function resetFraming(document: EditorDocument): EditorDocument {
  return setFraming(document, DEFAULT_FRAMING);
}

/**
 * Whether two documents look the same. Layouts compare by reference: every edit makes a new
 * template, so equal references mean no edit in between. Time and space O(1).
 */
export function sameDocument(a: EditorDocument, b: EditorDocument): boolean {
  return (
    a.template === b.template &&
    a.customLayout === b.customLayout &&
    sameFraming(a.framing, b.framing)
  );
}

function sameFraming(a: PhotoFraming, b: PhotoFraming): boolean {
  return (
    a.centerX === b.centerX &&
    a.centerY === b.centerY &&
    a.zoom === b.zoom &&
    a.rotation === b.rotation
  );
}

function sameTransform(a: LayerTransform, b: LayerTransform): boolean {
  return a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotation === b.rotation;
}
