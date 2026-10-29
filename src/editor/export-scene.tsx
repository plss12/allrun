import type { SkImage } from '@shopify/react-native-skia';
import type { ReactElement } from 'react';

import { backgroundColor } from '@/core/design-background';
import { drawPhoto } from '@/core/photo-placement';
import { CANVAS_FORMATS, type Template } from '@/core/template';

import {
  type LayerContext,
  photoMatrix,
  photoRect,
  prepareLayers,
  type ScenePhoto,
  TemplateScene,
} from './template-scene';

/** Everything an exported image shows. */
export interface ExportDesign {
  /** The design, with where its photo goes and its background. */
  readonly template: Template;
  readonly layerContext: LayerContext;
  /** The full-quality copy of the photo, or `null` for none. */
  readonly photo: SkImage | null;
  /** The photo's dominant color, for the `auto` background; `null` without a photo. */
  readonly dominant: string | null;
}

/** The photo placed as `template` says, at any resolution of it. */
export function scenePhoto(template: Template, photo: SkImage): ScenePhoto {
  const drawing = drawPhoto(
    { width: photo.width(), height: photo.height() },
    CANVAS_FORMATS[template.format],
    template.photo,
  );
  return { image: photo, matrix: photoMatrix(drawing), rect: photoRect(drawing) };
}

/**
 * The scene of a design at its export size: the same scene as the editor's canvas, which already
 * works in export pixels, with the photo where the design puts it, over its background (or
 * nothing, where the image stays transparent). The placement is relative to the canvas, so the
 * full-quality copy lands exactly where the editor's smaller one is.
 */
export function exportScene({
  template,
  layerContext,
  photo,
  dominant,
}: ExportDesign): ReactElement {
  const color = backgroundColor(template.background, dominant);
  return (
    <TemplateScene
      format={template.format}
      layers={prepareLayers(template, layerContext)}
      backdrop={color === null ? { kind: 'none' } : { kind: 'color', color }}
      photo={photo === null ? null : scenePhoto(template, photo)}
    />
  );
}
