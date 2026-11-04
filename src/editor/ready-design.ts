import { type ReadyDesignId, readyDesign } from '@/core/designs';
import { CANVAS_FORMATS, type CanvasFormat, type Layer, type Template } from '@/core/template';

import { inParagraphArena } from './paragraph-arena';
import { type LayerContext, prepareLayers } from './template-scene';

/**
 * One of AllRun's designs for what `context` holds, its widgets aligned as measured with the real
 * fonts: a recipe knows where they go, but not how wide they come out. Time O(a) for a widgets to
 * align, each measured and freed at once.
 */
export function readyTemplate(
  id: ReadyDesignId,
  context: LayerContext,
  format: CanvasFormat,
): Template {
  const { data } = context;
  const { template, alignRight } = readyDesign(id, data, format);
  if (alignRight.length === 0) {
    return template;
  }
  const canvas = CANVAS_FORMATS[format];
  const measured = inParagraphArena(() =>
    alignRight.map(({ id: layerId, right }) => ({
      layerId,
      right,
      width:
        prepareLayers(
          { ...template, layers: template.layers.filter((layer) => layer.id === layerId) },
          context,
        )[0]?.width ?? 0,
    })),
  );
  measured.dispose();
  const layers = template.layers.map((layer): Layer => {
    const aligned = measured.value.find(({ layerId }) => layerId === layer.id);
    return aligned === undefined
      ? layer
      : {
          ...layer,
          transform: {
            ...layer.transform,
            x: aligned.right - (aligned.width * layer.transform.scale) / 2 / canvas.width,
          },
        };
  });
  return { ...template, layers };
}
