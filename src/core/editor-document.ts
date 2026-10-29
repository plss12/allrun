import type { LayerTransform } from './layer-transform';
import { DEFAULT_FRAMING, type PhotoFraming } from './photo-framing';
import type { CanvasFormat, Template } from './template';

/**
 * The widgets of a design. `null` while they are the default layout, which each format lays out
 * its own way; the user's own layers once they edit them, which follow any format thanks to their
 * relative positions.
 */
export type EditorLayers = Template['layers'] | null;

/**
 * What undo, redo and Start over cover: the whole design (ADR 009). The editor is one step, so a
 * slip on the photo or a format tried out is as easy to make as a widget moved, and as easy to
 * take back. The photo itself is not here: undo never swaps photos.
 */
export interface EditorDesign {
  readonly format: CanvasFormat;
  /** How the photo is framed, in proportions of the photo (see `photo-framing.ts`). */
  readonly framing: PhotoFraming;
  readonly layers: EditorLayers;
}

/** Default layout of the current activity or summary for a format. */
export type DefaultTemplate = (format: CanvasFormat) => Template;

/** Format the editor opens in. */
export const INITIAL_FORMAT: CanvasFormat = 'story';

/** How the editor opens: the story format, the photo centered and the default widgets. */
export const INITIAL_DESIGN: EditorDesign = {
  format: INITIAL_FORMAT,
  framing: DEFAULT_FRAMING,
  layers: null,
};

/** The design on the canvas: the default layout of its format, or the user's layers in it. */
export function layoutTemplate(defaultTemplate: DefaultTemplate, design: EditorDesign): Template {
  const template = defaultTemplate(design.format);
  return design.layers === null ? template : { ...template, layers: design.layers };
}

/**
 * Applies an edit of the widgets (see `template-edit.ts`) to `design`; its layers become the
 * user's own. Returns `design` itself when the edit changes nothing, so committing the result
 * records no undo step.
 */
export function editLayers(
  design: EditorDesign,
  defaultTemplate: DefaultTemplate,
  change: (template: Template) => Template,
): EditorDesign {
  const template = layoutTemplate(defaultTemplate, design);
  const edited = change(template);
  return edited === template ? design : { ...design, layers: edited.layers };
}

/** Replaces the widgets (with a template's, or `null` for the default ones). */
export function setLayers(design: EditorDesign, layers: EditorLayers): EditorDesign {
  return layers === design.layers ? design : { ...design, layers };
}

/**
 * Another format. The widgets stay where they are, in relative positions, and the user rearranges
 * them if they need to (undo brings the old format back); the default layout is laid out again
 * for the new format. Returns `design` itself for the same format.
 */
export function setFormat(design: EditorDesign, format: CanvasFormat): EditorDesign {
  return format === design.format ? design : { ...design, format };
}

/** Frames the photo anew. Returns `design` itself when the framing is the same. */
export function setFraming(design: EditorDesign, framing: PhotoFraming): EditorDesign {
  return sameFraming(design.framing, framing) ? design : { ...design, framing };
}

/**
 * Moves, scales or rotates one layer. Returns `template` itself when the layer is missing or
 * already there, so no empty undo step is recorded.
 */
export function setLayerTransform(
  template: Template,
  id: string,
  transform: LayerTransform,
): Template {
  const current = template.layers.find((layer) => layer.id === id);
  if (current === undefined || sameTransform(current.transform, transform)) {
    return template;
  }
  const layers = template.layers.map((layer) =>
    layer.id === id ? { ...layer, transform } : layer,
  );
  return { ...template, layers };
}

/**
 * Start over: the design as the editor opened, but for the format, which the user chose for where
 * the image goes (and the photo, which is not in the design). Returns `design` itself when there
 * is nothing to start over, so it records no undo step.
 */
export function startOver(design: EditorDesign): EditorDesign {
  return canStartOver(design)
    ? { format: design.format, framing: DEFAULT_FRAMING, layers: null }
    : design;
}

/** Whether starting over would change anything: the widgets or the framing were edited. */
export function canStartOver(design: EditorDesign): boolean {
  return design.layers !== null || !sameFraming(design.framing, DEFAULT_FRAMING);
}

function sameTransform(a: LayerTransform, b: LayerTransform): boolean {
  return a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotation === b.rotation;
}

function sameFraming(a: PhotoFraming, b: PhotoFraming): boolean {
  return (
    a.centerX === b.centerX &&
    a.centerY === b.centerY &&
    a.zoom === b.zoom &&
    a.rotation === b.rotation
  );
}
