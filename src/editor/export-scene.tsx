import type { SkImage } from '@shopify/react-native-skia';
import type { ReactElement } from 'react';

import { cellRect, collageCells, collageFrameBars, drawInCell } from '@/core/collage';
import { backgroundColor } from '@/core/design-background';
import { drawPhoto } from '@/core/photo-placement';
import { CANVAS_FORMATS, type Template } from '@/core/template';

import {
  type LayerContext,
  photoMatrix,
  photoRect,
  prepareLayers,
  type SceneCell,
  type SceneCollage,
  type SceneFrame,
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
  /** In a collage, the photo of each cell, or `null` for an empty one. */
  readonly cells?: readonly (SkImage | null)[];
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

/** The photo of a collage's cell: decoded, still loading, or none. */
export type CellPhoto = SkImage | 'loading' | null;

/** The colors of a design's frame: pure, as a picture's. */
const FRAME_COLORS = { light: '#FFFFFF', dark: '#000000' } as const;

/** The frame of a design in a scene, around its photos; `null` without one. */
export function sceneFrame(template: Template): SceneFrame | null {
  const { frame = 'none', collage, format } = template;
  return frame === 'none'
    ? null
    : {
        bars: collageFrameBars(collage?.layout ?? null, CANVAS_FORMATS[format]),
        color: FRAME_COLORS[frame],
      };
}

/**
 * The photos of a design's collage in a scene, placed as it says, each at any resolution of it;
 * `null` for a design with one photo.
 *
 * @param hints - Whether empty cells show the sign to fill them, on the canvas.
 * @param activeCell - The cell being edited, on the canvas, which the others dim to set apart.
 */
export function sceneCollage(
  template: Template,
  photos: readonly CellPhoto[],
  hints: boolean,
  activeCell: number | null = null,
): SceneCollage | null {
  const { collage } = template;
  if (collage === undefined) {
    return null;
  }
  const canvas = CANVAS_FORMATS[template.format];
  const cells = collageCells(collage.layout).map((cell, index): SceneCell => {
    const clip = cellRect(cell, canvas);
    const photo = photos[index] ?? null;
    if (photo === null) {
      return { kind: 'empty', clip, hint: hints };
    }
    if (photo === 'loading') {
      return { kind: 'loading', clip };
    }
    const drawing = drawInCell(
      { width: photo.width(), height: photo.height() },
      clip,
      collage.placements[index],
    );
    return {
      kind: 'photo',
      clip,
      photo: { image: photo, matrix: photoMatrix(drawing), rect: photoRect(drawing) },
    };
  });
  return { cells, activeCell };
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
  cells = [],
  dominant,
}: ExportDesign): ReactElement {
  const color = backgroundColor(template.background, dominant);
  return (
    <TemplateScene
      format={template.format}
      layers={prepareLayers(template, layerContext)}
      backdrop={color === null ? { kind: 'none' } : { kind: 'color', color }}
      photo={photo === null || template.collage !== undefined ? null : scenePhoto(template, photo)}
      collage={sceneCollage(template, cells, false)}
      frame={sceneFrame(template)}
    />
  );
}
