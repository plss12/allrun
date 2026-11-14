import { Canvas, Group, type SkImage } from '@shopify/react-native-skia';

import { backgroundColor } from '@/core/design-background';
import { CANVAS_FORMATS, type Template } from '@/core/template';

import { sceneCollage, sceneFrame, scenePhoto } from './export-scene';
import { checkerSquare, EmptyHintScale, emptyHintScale } from './scene/photo';
import { type PreparedLayer, TemplateScene } from './template-scene';

/** Where a thumbnail's photo goes while it is decoded: as a picture's while it is. */
const LOADING_PHOTO = '#3A3A3C';

/**
 * A template drawn small, with the user's data and our stock photos, placed and over the background
 * as the template says, so the design shows before choosing it. Where nothing is under the widgets,
 * the transparency checkerboard shows, as in the editor.
 */
export function TemplateThumbnail({
  template,
  layers,
  photos,
  loading,
  emptyHints = false,
  width,
}: {
  readonly template: Template;
  /** Its widgets, laid out by whoever frees them (see `design-gallery.tsx`). */
  readonly layers: readonly PreparedLayer[];
  /** The photo over the canvas, or, in a collage, the one of each cell. */
  readonly photos: readonly SkImage[];
  /** Whether its photos are on their way: what they leave empty is its place, not transparency. */
  readonly loading: boolean;
  /** Whether a collage's empty cells show their "+", as on the canvas (a user's design). */
  readonly emptyHints?: boolean;
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
        <EmptyHintScale value={emptyHintScale(ratio)}>
          <TemplateScene
            format={template.format}
            layers={layers}
            backdrop={
              color !== null
                ? { kind: 'color', color }
                : loading
                  ? { kind: 'color', color: LOADING_PHOTO }
                  : { kind: 'checker', square: checkerSquare(ratio) }
            }
            photo={
              template.collage !== undefined || photos.length === 0
                ? null
                : scenePhoto(template, photos[0])
            }
            collage={sceneCollage(template, photos, emptyHints)}
            frame={sceneFrame(template)}
          />
        </EmptyHintScale>
      </Group>
    </Canvas>
  );
}
