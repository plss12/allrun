import { Canvas, Group, type SkImage } from '@shopify/react-native-skia';

import { backgroundColor } from '@/core/design-background';
import { CANVAS_FORMATS, type Template } from '@/core/template';

import { sceneCollage, sceneFrame, scenePhoto } from './export-scene';
import { type PreparedLayer, TemplateScene } from './template-scene';

/**
 * A template drawn small, with the user's data and our stock photos, placed and over the background
 * as the template says, so the design shows before choosing it. Where nothing is under the widgets,
 * the transparency checkerboard shows, as in the editor.
 */
export function TemplateThumbnail({
  template,
  layers,
  photos,
  width,
}: {
  readonly template: Template;
  /** Its widgets, laid out by whoever frees them (see `design-gallery.tsx`). */
  readonly layers: readonly PreparedLayer[];
  /** The photo over the canvas, or, in a collage, the one of each cell. */
  readonly photos: readonly SkImage[];
  /** Width on screen, in points. */
  readonly width: number;
}) {
  const canvas = CANVAS_FORMATS[template.format];
  const ratio = width / canvas.width;
  const color = backgroundColor(template.background, null);
  // The scene of the editor's canvas (and of the exported image), only scaled down.
  return (
    <Canvas style={{ width, height: canvas.height * ratio }}>
      <Group transform={[{ scale: ratio }]}>
        <TemplateScene
          format={template.format}
          layers={layers}
          backdrop={color === null ? { kind: 'checker' } : { kind: 'color', color }}
          photo={
            template.collage !== undefined || photos.length === 0
              ? null
              : scenePhoto(template, photos[0])
          }
          collage={sceneCollage(template, photos, false)}
          frame={sceneFrame(template)}
        />
      </Group>
    </Canvas>
  );
}
