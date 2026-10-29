import { Canvas, Group, type SkImage } from '@shopify/react-native-skia';

import { backgroundColor } from '@/core/design-background';
import { CANVAS_FORMATS, type Template } from '@/core/template';

import { scenePhoto } from './export-scene';
import { type LayerContext, prepareLayers, TemplateScene } from './template-scene';

/**
 * A template drawn small, live: with the user's own data and photo, placed and over the
 * background as the template says, so the result shows before choosing it. Where nothing is under
 * the widgets, the transparency checkerboard shows, as in the editor.
 */
export function TemplateThumbnail({
  template,
  layerContext,
  photo,
  dominant,
  width,
}: {
  readonly template: Template;
  readonly layerContext: LayerContext;
  readonly photo: SkImage | null;
  /** The photo's dominant color, for the `auto` background; `null` without a photo. */
  readonly dominant: string | null;
  /** Width on screen, in points. */
  readonly width: number;
}) {
  const canvas = CANVAS_FORMATS[template.format];
  const ratio = width / canvas.width;
  const color = backgroundColor(template.background, dominant);
  // The scene of the editor's canvas (and of the exported image), only scaled down.
  return (
    <Canvas style={{ width, height: canvas.height * ratio }}>
      <Group transform={[{ scale: ratio }]}>
        <TemplateScene
          format={template.format}
          layers={prepareLayers(template, layerContext)}
          backdrop={color === null ? { kind: 'checker' } : { kind: 'color', color }}
          photo={photo === null ? null : scenePhoto(template, photo)}
        />
      </Group>
    </Canvas>
  );
}
