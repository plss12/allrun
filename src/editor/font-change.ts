import type { Size } from '@/core/photo-framing';
import type { Template } from '@/core/template';
import { keepLayerArea } from '@/core/template-edit';

import { type LayerContext, prepareLayers } from './template-scene';

/**
 * `change` (another font for the layer `id`) and then the layer rescaled to cover as much of the
 * canvas as before (see `keepLayerArea`), both sizes measured as `context` draws them: a font of
 * other proportions doesn't make a widget the user sized shoot up or shrink away. Time O(t) for
 * laying out the layer's t texts twice.
 */
export function keepingArea(
  change: (template: Template) => Template,
  id: string,
  context: LayerContext,
): (template: Template) => Template {
  return (template) => {
    const next = change(template);
    if (next === template) {
      return template;
    }
    const before = measured(template, id, context);
    const after = measured(next, id, context);
    return before === null || after === null ? next : keepLayerArea(next, id, before, after);
  };
}

/** The layer `id` of `template` as drawn, before its scale; `null` when missing or empty. */
function measured(template: Template, id: string, context: LayerContext): Size | null {
  const layer = template.layers.find((candidate) => candidate.id === id);
  if (layer === undefined) {
    return null;
  }
  const [prepared] = prepareLayers({ ...template, layers: [layer] }, context);
  return prepared === undefined ? null : { width: prepared.width, height: prepared.height };
}
