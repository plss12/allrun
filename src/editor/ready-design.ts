import { type ReadyDesignId, readyDesign } from '@/core/designs';
import type { CanvasFormat, Template } from '@/core/template';

import type { LayerContext } from './template-scene';

/**
 * One of AllRun's designs for what `context` holds: its recipe lays it out whole, its pieces
 * measuring their own parts (the chat's message beside its photos). Time and space O(1).
 */
export function readyTemplate(
  id: ReadyDesignId,
  context: LayerContext,
  format: CanvasFormat,
): Template {
  return readyDesign(id, context.data, format).template;
}
