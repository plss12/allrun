import { newCollage, withCellPlacement } from './collage';
import {
  EDITOR_PHOTO,
  fillSlots,
  isImageLayer,
  isPhotoSlot,
  SAMPLE_IMAGE,
  withEmptySlots,
} from './image-layer';
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
  MAX_COLLAGE_PHOTOS,
  type Template,
} from './template';
import { sameJson } from './user-templates';
import type { DistanceUnit } from './units';

/**
 * The widgets of a design. `null` while they are the default layout, which each format lays out
 * its own way; the user's own layers once they edit them, which follow any format thanks to their
 * relative positions.
 */
export type EditorLayers = Template['layers'] | null;

/**
 * How a canvas started (what it opened with: nothing, or a design or collage of the gallery), which
 * Start over goes back to, whatever was chosen since. Its slots are empty: the photos stay as they
 * are by then.
 */
export interface DesignStart {
  readonly layers: EditorLayers;
  readonly photo: PhotoPlacement;
  readonly collage: Collage | null;
  readonly frame: ImageFrame;
  readonly background: DesignBackground;
  readonly isDesign: boolean;
}

/**
 * The design on the canvas, each value of the editor's history. What undo, redo and Start over cover
 * is what the user makes on it: the design or collage chosen, its widgets, its photos and where they
 * go, its frame and its background. Its settings are not edits (the user's choice): the format, the
 * unit and the language stay as chosen, in every value of the history (`mapHistory`), also on choosing
 * another design, until the user changes them or starts another canvas.
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
  /** The editor's photo, by its id there; `null` for none. Only the current one is decoded. */
  readonly photoId: number | null;
  /** The photos of a collage's cells after the first, which is the editor's, by their keys. */
  readonly cells: readonly (string | null)[];
  /** Whether it comes from a design of the gallery, which a collage replaces, not from a collage. */
  readonly isDesign: boolean;
}

/** A collage's cells after the first, all empty. */
export const NO_CELLS: readonly (string | null)[] = Array.from(
  { length: MAX_COLLAGE_PHOTOS - 1 },
  () => null,
);

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
  photoId: null,
  cells: NO_CELLS,
  isDesign: false,
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
 * Starts again from a design: its widgets, where its photo goes, its collage, frame and background,
 * and nothing else of the design before (the user's choice), but the settings (see `EditorDesign`).
 * The photos go on: `pictures`, by their keys, fill its slots in order. A design never keeps
 * pictures, which belong to the image being made. Time O(n) for n layers.
 */
export function applyDesign(
  design: EditorDesign,
  saved: Pick<Template, 'layers' | 'photo' | 'collage' | 'frame' | 'background'>,
  pictures: readonly string[],
): EditorDesign {
  return {
    ...design,
    photo: saved.photo,
    collage: saved.collage ?? null,
    frame: saved.frame ?? 'none',
    background: saved.background,
    layers: fillSlots(
      saved.layers.filter((layer) => !isImageLayer(layer) || isPhotoSlot(layer)),
      pictures,
    ),
    isDesign: true,
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
 * them if they need to; the default layout is laid out again for the new format. Returns `design`
 * itself for the same format.
 */
export function setFormat(design: EditorDesign, format: CanvasFormat): EditorDesign {
  return format === design.format ? design : { ...design, format };
}

/** Places the photo anew. Returns `design` itself when it is already there. */
export function setPhotoPlacement(design: EditorDesign, photo: PhotoPlacement): EditorDesign {
  return samePlacement(design.photo, photo) ? design : { ...design, photo };
}

/** The photos laid out as `layout` says, each keeping where it was in its cell. */
const withLayout = (design: EditorDesign, layout: CollageLayout | null): Collage | null =>
  layout === null ? null : { ...(design.collage ?? newCollage(layout)), layout };

/** `design` from zero with the collage `layout` and its `frame`: only the watermark, as a design. */
const fromZero = (
  design: EditorDesign,
  layout: CollageLayout | null,
  frame: ImageFrame,
): EditorDesign => ({
  ...design,
  layers: null,
  photo: COVER_PLACEMENT,
  collage: layout === null ? null : newCollage(layout),
  frame,
  background: AUTO_BACKGROUND,
  isDesign: false,
});

/**
 * Chooses a collage in the gallery (`layout`, `null` for one photo; its `frame`). Over a design it
 * starts again from zero, as another design does (see `applyDesign`); otherwise it only lays the photos
 * out, keeping the widgets, each photo where it was in its cell. Returns `design` itself when it is the
 * one it has, so no undo step is recorded.
 */
export function applyCollage(
  design: EditorDesign,
  layout: CollageLayout | null,
  frame: ImageFrame,
): EditorDesign {
  if (design.isDesign) {
    return fromZero(design, layout, frame);
  }
  return (design.collage?.layout ?? null) === layout && design.frame === frame
    ? design
    : { ...design, collage: withLayout(design, layout), frame };
}

/**
 * Changes the layout in the Collages panel. Over a design it starts again from zero, without borders
 * (also with one photo, the way out of a design); otherwise it only lays the photos out, keeping the
 * widgets and the borders. Returns `design` itself when there is nothing to change.
 */
export function setCollageLayout(design: EditorDesign, layout: CollageLayout | null): EditorDesign {
  if (design.isDesign) {
    return fromZero(design, layout, 'none');
  }
  return (design.collage?.layout ?? null) === layout
    ? design
    : { ...design, collage: withLayout(design, layout) };
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

/** How a canvas with `design` starts (see `DesignStart`). Time O(n) for n layers. */
export function designStart(design: EditorDesign): DesignStart {
  return {
    layers: design.layers === null ? null : withEmptySlots(design.layers),
    photo: design.photo,
    collage: design.collage,
    frame: design.frame,
    background: design.background,
    isDesign: design.isDesign,
  };
}

/** How a canvas starts when it opens with nothing. */
export const EMPTY_START: DesignStart = designStart(INITIAL_DESIGN);

/**
 * What Start over goes back to: how the canvas started, with its settings (see `EditorDesign`) and
 * photos as they are: those in slots go on in them, or else the editor's and the cells' fill them.
 * Time O(n) for n layers.
 */
function startingPoint(design: EditorDesign, start: DesignStart): EditorDesign {
  const inSlots = (design.layers ?? [])
    .filter(isPhotoSlot)
    .map((layer) => layer.image)
    .filter((image) => image !== SAMPLE_IMAGE);
  const others = design.cells.filter((key) => key !== null);
  const pictures =
    inSlots.length > 0 ? inSlots : design.photoId === null ? others : [EDITOR_PHOTO, ...others];
  return {
    ...design,
    ...start,
    layers: start.layers === null ? null : fillSlots(start.layers, pictures),
  };
}

/**
 * Whether Start over would change anything: all that isn't the settings or the photos. So it also
 * says whether there is anything to lose on leaving. Time O(s) for a design of size s.
 */
export function canStartOver(design: EditorDesign, start: DesignStart = EMPTY_START): boolean {
  const back = startingPoint(design, start);
  return !(
    sameJson(design.layers, back.layers) &&
    sameJson(design.photo, back.photo) &&
    sameJson(design.collage, back.collage) &&
    design.frame === back.frame &&
    sameJson(design.background, back.background)
  );
}

/**
 * Start over (see `startingPoint`). Returns `design` itself when there is nothing to start over, so
 * it records no undo step.
 */
export function startOver(design: EditorDesign, start: DesignStart = EMPTY_START): EditorDesign {
  return canStartOver(design, start) ? startingPoint(design, start) : design;
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
