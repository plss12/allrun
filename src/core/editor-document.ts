import { newCollage, withCellPlacement } from './collage';
import { EDITOR_PHOTO, fillSlots, isImageLayer, isPhotoSlot, SAMPLE_IMAGE } from './image-layer';
import type { LayerTransform } from './layer-transform';
import { COVER_PLACEMENT, type PhotoPlacement, samePlacement } from './photo-placement';
import {
  AUTO_BACKGROUND,
  type CanvasFormat,
  type Collage,
  type CollageLayout,
  type DesignBackground,
  type DesignLanguage,
  type ImageFrame,
  type Template,
} from './template';
import type { DistanceUnit } from './units';

/**
 * The widgets of a design. `null` while they are the default layout, which each format lays out
 * its own way; the user's own layers once they edit them, which follow any format thanks to their
 * relative positions.
 */
export type EditorLayers = Template['layers'] | null;

/**
 * What undo, redo and Start over cover: the whole design (ADR 009). The editor is one step, so a
 * slip on the photo or a format tried out is as easy to make as a widget moved, and as easy to
 * take back. The photo itself is not here: undo never swaps photos.
 */
export interface EditorDesign {
  readonly format: CanvasFormat;
  /** Where the photo goes, relative to the canvas (see `photo-placement.ts`). */
  readonly photo: PhotoPlacement;
  /** The photos in a collage (see `collage.ts`), or `null` for one photo, as `photo` says. */
  readonly collage: Collage | null;
  /** The frame around its photos, one or several. */
  readonly frame: ImageFrame;
  /** What shows where the photo leaves the canvas empty. */
  readonly background: DesignBackground;
  readonly layers: EditorLayers;
  /** The distance unit of every widget; `null`, the device's. */
  readonly units: DistanceUnit | null;
  /** The language of every widget; `null`, the app's. */
  readonly language: DesignLanguage | null;
}

/** Default layout of the current activity or summary for a format. */
export type DefaultTemplate = (format: CanvasFormat) => Template;

/** Format the editor opens in. */
export const INITIAL_FORMAT: CanvasFormat = 'story';

/**
 * How the editor opens: the story format, the photo covering the canvas over its dominant color,
 * and the default widgets, in the device's unit and the app's language.
 */
export const INITIAL_DESIGN: EditorDesign = {
  format: INITIAL_FORMAT,
  photo: COVER_PLACEMENT,
  collage: null,
  frame: 'none',
  background: AUTO_BACKGROUND,
  layers: null,
  units: null,
  language: null,
};

/**
 * The design on the canvas: the default layout of its format, or the user's layers in it, with
 * its photo's placement, its background, and its unit and language when it has its own.
 */
export function layoutTemplate(defaultTemplate: DefaultTemplate, design: EditorDesign): Template {
  const template = defaultTemplate(design.format);
  return {
    ...template,
    layers: design.layers ?? template.layers,
    photo: design.photo,
    ...(design.collage === null ? {} : { collage: design.collage }),
    ...(design.frame === 'none' ? {} : { frame: design.frame }),
    background: design.background,
    ...(design.units === null ? {} : { units: design.units }),
    ...(design.language === null ? {} : { language: design.language }),
  };
}

/**
 * Applies an edit of the widgets (see `template-edit.ts`) to `design`; its layers become the
 * user's own. Returns `design` itself when the edit changes nothing, so committing the result
 * records no undo step.
 */
export function editLayers(
  design: EditorDesign,
  defaultTemplate: DefaultTemplate,
  change: (template: Template) => Template,
): EditorDesign {
  const template = layoutTemplate(defaultTemplate, design);
  const edited = change(template);
  return edited === template ? design : { ...design, layers: edited.layers };
}

/**
 * The layers a design brings, with the pictures of `design` in them. A design never keeps pictures,
 * which belong to the image being made, so the ones the user stuck on stay on top, and those in
 * slots go to the new design's slots, with the editor's photo first if it isn't in one yet.
 * Time O(n) for n layers.
 */
function keepingImages(
  design: EditorDesign,
  layers: Template['layers'],
  hasPhoto: boolean,
): Template['layers'] {
  const current = design.layers ?? [];
  const inSlots = current
    .filter(isPhotoSlot)
    .map((layer) => layer.image)
    .filter((image) => image !== SAMPLE_IMAGE);
  const pictures =
    hasPhoto && !inSlots.includes(EDITOR_PHOTO) ? [EDITOR_PHOTO, ...inSlots] : inSlots;
  const own = layers.filter((layer) => !isImageLayer(layer) || isPhotoSlot(layer));
  return [
    ...fillSlots(own, pictures),
    ...current.filter((layer) => isImageLayer(layer) && !isPhotoSlot(layer)),
  ];
}

/**
 * Applies a design: its widgets, with the user's pictures (see `keepingImages`), where its photo
 * goes, its background, and its unit and language (the device's and the app's when it has none; the
 * format is the same: the designs offered are the format's).
 *
 * @param hasPhoto - Whether the editor has a photo, which goes in the design's first slot.
 */
export function applyDesign(
  design: EditorDesign,
  saved: Pick<
    Template,
    'layers' | 'photo' | 'collage' | 'frame' | 'background' | 'units' | 'language'
  >,
  hasPhoto: boolean,
): EditorDesign {
  return {
    ...design,
    layers: keepingImages(design, saved.layers, hasPhoto),
    photo: saved.photo,
    collage: saved.collage ?? null,
    frame: saved.frame ?? 'none',
    background: saved.background,
    units: saved.units ?? null,
    language: saved.language ?? null,
  };
}

/**
 * Another distance unit for every widget (`null`: the device's). Returns `design` itself when it
 * is the same.
 */
export function setUnits(design: EditorDesign, units: DistanceUnit | null): EditorDesign {
  return units === design.units ? design : { ...design, units };
}

/**
 * Another language for every widget (`null`: the app's). Returns `design` itself when it is the
 * same.
 */
export function setLanguage(design: EditorDesign, language: DesignLanguage | null): EditorDesign {
  return language === design.language ? design : { ...design, language };
}

/**
 * Another format. The widgets stay where they are, in relative positions, and the user rearranges
 * them if they need to (undo brings the old format back); the default layout is laid out again
 * for the new format. Returns `design` itself for the same format.
 */
export function setFormat(design: EditorDesign, format: CanvasFormat): EditorDesign {
  return format === design.format ? design : { ...design, format };
}

/** Places the photo anew. Returns `design` itself when it is already there. */
export function setPhotoPlacement(design: EditorDesign, photo: PhotoPlacement): EditorDesign {
  return samePlacement(design.photo, photo) ? design : { ...design, photo };
}

/**
 * Lays the photos out another way (`null`: one photo). Each keeps where it was in its cell, so
 * changing layouts and coming back loses nothing. Returns `design` itself when it is the same.
 */
export function setCollageLayout(design: EditorDesign, layout: CollageLayout | null): EditorDesign {
  if ((design.collage?.layout ?? null) === layout) {
    return design;
  }
  if (layout === null) {
    return { ...design, collage: null };
  }
  return { ...design, collage: { ...(design.collage ?? newCollage(layout)), layout } };
}

/**
 * Lays the photos out as a collage of the Designs gallery (`layout`, `null` for one photo; its
 * `frame`). The widgets stay, without the slots of a design that had them, and its background with
 * them: their photos go back to the canvas. Time O(n) for n layers.
 */
export function applyCollage(
  design: EditorDesign,
  layout: CollageLayout | null,
  frame: ImageFrame,
): EditorDesign {
  const laidOut = setFrame(setCollageLayout(design, layout), frame);
  const layers = laidOut.layers;
  return layers?.some(isPhotoSlot) === true
    ? {
        ...laidOut,
        layers: layers.filter((layer) => !isPhotoSlot(layer)),
        background: AUTO_BACKGROUND,
      }
    : laidOut;
}

/** Another frame around the photos. Returns `design` itself when it is the same. */
export function setFrame(design: EditorDesign, frame: ImageFrame): EditorDesign {
  return design.frame === frame ? design : { ...design, frame };
}

/** Places the photo of a collage's cell anew. Returns `design` itself when it is already there. */
export function setCellPlacement(
  design: EditorDesign,
  index: number,
  placement: PhotoPlacement,
): EditorDesign {
  return design.collage === null || samePlacement(design.collage.placements[index], placement)
    ? design
    : { ...design, collage: withCellPlacement(design.collage, index, placement) };
}

/** Another background. Returns `design` itself when it is the same. */
export function setBackground(design: EditorDesign, background: DesignBackground): EditorDesign {
  return sameBackground(design.background, background) ? design : { ...design, background };
}

/**
 * Moves, scales or rotates one layer. Returns `template` itself when the layer is missing or
 * already there, so no empty undo step is recorded.
 */
export function setLayerTransform(
  template: Template,
  id: string,
  transform: LayerTransform,
): Template {
  const current = template.layers.find((layer) => layer.id === id);
  if (current === undefined || sameTransform(current.transform, transform)) {
    return template;
  }
  const layers = template.layers.map((layer) =>
    layer.id === id ? { ...layer, transform } : layer,
  );
  return { ...template, layers };
}

/**
 * Start over: the design as the editor opened, but for the format, which the user chose for where
 * the image goes (and the photo, which is not in the design). Returns `design` itself when there
 * is nothing to start over, so it records no undo step.
 */
export function startOver(design: EditorDesign): EditorDesign {
  return canStartOver(design) ? { ...INITIAL_DESIGN, format: design.format } : design;
}

/**
 * Whether starting over would change anything: the widgets, the photo, the background, the unit
 * or the language.
 */
export function canStartOver(design: EditorDesign): boolean {
  return (
    design.layers !== null ||
    design.units !== null ||
    design.language !== null ||
    design.collage !== null ||
    design.frame !== INITIAL_DESIGN.frame ||
    !samePlacement(design.photo, INITIAL_DESIGN.photo) ||
    !sameBackground(design.background, INITIAL_DESIGN.background)
  );
}

function sameTransform(a: LayerTransform, b: LayerTransform): boolean {
  return a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotation === b.rotation;
}

function sameBackground(a: DesignBackground, b: DesignBackground): boolean {
  switch (a.kind) {
    case 'auto':
      return b.kind === 'auto' && (a.opacity ?? 1) === (b.opacity ?? 1);
    case 'color':
      return b.kind === 'color' && a.color === b.color;
    case 'transparent':
      return b.kind === 'transparent';
  }
}
