import type { LayerTransform } from './layer-transform';
import type { CanvasFormat, Template } from './template';

/**
 * What undo, redo and Start over cover: the widgets. `null` while they are the default layout,
 * which each format lays out its own way; the user's own layers once they edit them, which
 * follow any format thanks to their relative positions.
 *
 * The format and the photo framing are left out: the user picks them first and then works on
 * the widgets, so undoing a widget or starting the design over keeps them.
 */
export type EditorLayers = Template['layers'] | null;

/** Default layout of the current activity or summary for a format. */
export type DefaultTemplate = (format: CanvasFormat) => Template;

/** Format the editor opens in. */
export const INITIAL_FORMAT: CanvasFormat = 'story';

/** The design on the canvas: the default layout of `format`, or the user's layers in it. */
export function layoutTemplate(
  defaultTemplate: DefaultTemplate,
  format: CanvasFormat,
  layers: EditorLayers,
): Template {
  const template = defaultTemplate(format);
  return layers === null ? template : { ...template, layers };
}

/**
 * Applies an edit (see `template-edit.ts`) to the design on the canvas, `template`; its layers
 * become the user's own. Returns `layers` itself when the edit returns `template` unchanged, so
 * committing the result records no undo step.
 */
export function editLayers(
  layers: EditorLayers,
  template: Template,
  change: (template: Template) => Template,
): EditorLayers {
  const edited = change(template);
  return edited === template ? layers : edited.layers;
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
 * Whether starting over would change anything: the user edited the widgets. Starting over goes
 * back to the default layout (`null`) of whatever format is chosen, as one undo step.
 */
export function canRestore(layers: EditorLayers): boolean {
  return layers !== null;
}

function sameTransform(a: LayerTransform, b: LayerTransform): boolean {
  return a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotation === b.rotation;
}
