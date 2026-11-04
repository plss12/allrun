import { z } from 'zod';

import { READY_DESIGN_IDS } from '@/core/designs';
import { applyCollage, applyDesign, type EditorDesign } from '@/core/editor-document';
import { COLLAGE_LAYOUTS, IMAGE_FRAMES, templateSchema } from '@/core/template';
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
 * `design` with a choice of the gallery applied.
 *
 * @param context - What AllRun's designs are laid out for.
 * @param hasPhoto - Whether the editor has a photo, which goes in the design's first slot.
 */
export function applyChoice(
  design: EditorDesign,
  choice: DesignChoice,
  context: LayerContext,
  hasPhoto: boolean,
): EditorDesign {
  switch (choice.kind) {
    case 'collage':
      return applyCollage(design, choice.layout, choice.frame);
    case 'ready':
      return applyDesign(design, readyTemplate(choice.id, context, design.format), hasPhoto);
    case 'saved':
      return {
        ...applyDesign(design, choice.template, hasPhoto),
        format: choice.template.format,
      };
  }
}
