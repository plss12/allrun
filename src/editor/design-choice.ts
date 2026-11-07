import { z } from 'zod';

import { READY_DESIGN_IDS } from '@/core/designs';
import {
  applyCollage,
  applyDesign,
  type EditorDesign,
  INITIAL_DESIGN,
} from '@/core/editor-document';
import { COLLAGE_LAYOUTS, IMAGE_FRAMES, type Template, templateSchema } from '@/core/template';
import { logError } from '@/ui/log';

import { readyTemplate } from './ready-design';
import type { LayerContext } from './template-scene';

const designChoiceSchema = z.discriminatedUnion('kind', [
  /** A collage of the gallery: its layout and its frame. */
  z.object({
    kind: z.literal('collage'),
    layout: z.enum(COLLAGE_LAYOUTS),
    frame: z.enum(IMAGE_FRAMES),
  }),
  /** One of AllRun's designs. */
  z.object({ kind: z.literal('ready'), id: z.enum(READY_DESIGN_IDS) }),
  /** One of the user's, carried whole: the editor doesn't have to read them to open with it. */
  z.object({ kind: z.literal('saved'), template: templateSchema }),
]);

/** What can be chosen in the Designs gallery (see `design-gallery.tsx`). */
export type DesignChoice = z.infer<typeof designChoiceSchema>;

/**
 * The design to open the editor with, as its route param says; `null` for none, or for one that
 * isn't valid, which is logged: the route can come from a deep link. Time O(n) for n characters.
 */
export function parseDesignChoice(param: string | undefined): DesignChoice | null {
  if (param === undefined) {
    return null;
  }
  try {
    return designChoiceSchema.parse(JSON.parse(param));
  } catch (error) {
    logError('Invalid design in the editor route params', error);
    return null;
  }
}

/**
 * `design` started again from a choice of the gallery (see `applyDesign`). A design over a color of
 * its own, AllRun's or the user's, takes the canvas's photo away, so it shows over its color as in
 * its tile (the user's choice: the chat over black went over the photo being edited); but a
 * collage, whose cells hold the photos. One over the canvas's photo keeps it, and with none shows
 * transparency.
 *
 * @param context - What AllRun's designs are laid out for.
 * @param pictures - The photos that go on, by their keys, for its slots.
 */
export function applyChoice(
  design: EditorDesign,
  choice: DesignChoice,
  context: LayerContext,
  pictures: readonly string[],
): EditorDesign {
  switch (choice.kind) {
    case 'collage':
      return applyCollage(design, choice.layout, choice.frame);
    case 'ready': {
      const template = readyTemplate(choice.id, context, design.format);
      return withoutPhotoUnder(template, applyDesign(design, template, pictures));
    }
    case 'saved':
      return withoutPhotoUnder(choice.template, {
        ...applyDesign(design, choice.template, pictures),
        format: choice.template.format,
      });
  }
}

/**
 * `applied`, the design `template` was applied to, without the canvas's photo if `template` goes
 * over a color of its own and isn't a collage (see `applyChoice`).
 */
function withoutPhotoUnder(template: Template, applied: EditorDesign): EditorDesign {
  return template.background.kind === 'color' && template.collage === undefined
    ? { ...applied, photoId: null }
    : applied;
}

/**
 * The design a new canvas opens with, for a choice of the gallery: one of the user's brings the unit
 * and language it was saved with, as the settings of this canvas.
 */
export function openChoice(choice: DesignChoice, context: LayerContext): EditorDesign {
  const design = applyChoice(INITIAL_DESIGN, choice, context, []);
  return choice.kind === 'saved'
    ? {
        ...design,
        units: choice.template.units ?? null,
        language: choice.template.language ?? null,
      }
    : design;
}
