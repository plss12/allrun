import type { SkImage } from '@shopify/react-native-skia';
import type { ReactElement } from 'react';

import { framePhoto, type PhotoFraming } from '@/core/photo-framing';
import { CANVAS_FORMATS, type Template } from '@/core/template';

import {
  type LayerContext,
  photoMatrix,
  photoRect,
  prepareLayers,
  TemplateScene,
} from './template-scene';

/** Everything an exported image shows. */
export interface ExportDesign {
  readonly template: Template;
  readonly layerContext: LayerContext;
  /** The full-quality copy of the photo, or `null` for a transparent sticker. */
  readonly photo: SkImage | null;
  readonly framing: PhotoFraming;
}

/**
 * The scene of a design at its export size: the same scene as the editor's canvas, which already
 * works in export pixels, with the photo placed by its framing (or nothing under the widgets).
 * The framing is in proportions of the photo, so the full-quality copy frames exactly like the
 * editor's smaller one.
 */
export function exportScene({
  template,
  layerContext,
  photo,
  framing,
}: ExportDesign): ReactElement {
  const canvas = CANVAS_FORMATS[template.format];
  const layers = prepareLayers(template, layerContext);
  if (photo === null) {
    return <TemplateScene format={template.format} layers={layers} background={{ kind: 'none' }} />;
  }
  const placement = framePhoto({ width: photo.width(), height: photo.height() }, canvas, framing);
  return (
    <TemplateScene
      format={template.format}
      layers={layers}
      background={{
        kind: 'photo',
        image: photo,
        matrix: photoMatrix(placement, canvas),
        rect: photoRect(placement),
      }}
    />
  );
}
