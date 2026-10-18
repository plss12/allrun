import { Canvas, Group, type SkImage } from '@shopify/react-native-skia';

import type { PhotoFraming } from '@/core/photo-framing';
import { CANVAS_FORMATS, type Template } from '@/core/template';

import { exportScene } from './export-scene';
import { type LayerContext, prepareLayers, TemplateScene } from './template-scene';

/**
 * A template drawn small, live: with the user's own data and photo, framed as on the canvas, so
 * the result shows before choosing it. Without a photo, the transparency checkerboard shows
 * under the widgets, as in the editor.
 */
export function TemplateThumbnail({
  template,
  layerContext,
  photo,
  framing,
  width,
}: {
  readonly template: Template;
  readonly layerContext: LayerContext;
  readonly photo: SkImage | null;
  readonly framing: PhotoFraming;
  /** Width on screen, in points. */
  readonly width: number;
}) {
  const canvas = CANVAS_FORMATS[template.format];
  const ratio = width / canvas.width;
  // The scene of the editor's canvas (and of the exported image), only scaled down.
  const scene =
    photo === null ? (
      <TemplateScene
        format={template.format}
        layers={prepareLayers(template, layerContext)}
        background={{ kind: 'transparent' }}
      />
    ) : (
      exportScene({ template, layerContext, photo, framing })
    );
  return (
    <Canvas style={{ width, height: canvas.height * ratio }}>
      <Group transform={[{ scale: ratio }]}>{scene}</Group>
    </Canvas>
  );
}
