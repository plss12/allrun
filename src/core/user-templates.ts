import { z } from 'zod';

import { withoutImages } from './image-layer';
import { type CanvasFormat, type Template, type TemplateMode, templateSchema } from './template';

/**
 * The user's own templates (ADR 007): designs saved as they are, to reuse with other activities
 * or periods. They have no name (a thumbnail tells them apart) and each belongs to the format
 * and data mode it was made in: in another format its widgets would pile up.
 */

export const savedTemplateSchema = z.object({
  /** When it was saved: the newest come first. */
  savedAt: z.iso.datetime(),
  template: templateSchema,
});

export type SavedTemplate = z.infer<typeof savedTemplateSchema>;

/**
 * Validates a stored template (raw JSON).
 *
 * @throws Error naming each invalid field when it doesn't match the schema.
 */
export function parseSavedTemplate(json: unknown): SavedTemplate {
  const result = savedTemplateSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid saved template:\n${z.prettifyError(result.error)}`, {
      cause: result.error,
    });
  }
  return result.data;
}

/**
 * The design on the canvas, ready to store as a template of its own: without the user's pictures,
 * which belong to this image, not to the design (see `image-layer.ts`).
 */
export function saveDesign(design: Template, id: string, savedAt: string): SavedTemplate {
  return { savedAt, template: { ...design, id, layers: withoutImages(design.layers) } };
}

/**
 * The saved templates that fit a design in `format` and `mode`, newest first. Time O(n log n)
 * for n templates.
 */
export function templatesFor(
  saved: readonly SavedTemplate[],
  format: CanvasFormat,
  mode: TemplateMode,
): SavedTemplate[] {
  return saved
    .filter(({ template }) => template.format === format && template.mode === mode)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/**
 * Whether `design` is already saved: one of `saved` has its format, mode, widgets (but the
 * pictures, which are never saved), photo placement and background, whatever its id. Saving it again would only add a second identical
 * thumbnail. Time O(n · s) for n templates of size s.
 */
export function isSaved(saved: readonly SavedTemplate[], design: Template): boolean {
  const layers = withoutImages(design.layers);
  return saved.some(
    ({ template }) =>
      template.format === design.format &&
      template.mode === design.mode &&
      sameJson(template.layers, layers) &&
      sameJson(template.photo, design.photo) &&
      sameJson(template.background, design.background),
  );
}

/**
 * Deep equality of JSON values. Object keys may come in any order: a template read back from
 * storage lists its fields in the schema's order, not in the order the editor built them.
 */
function sameJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameJson(item, b[i]))
    );
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  const aEntries = Object.entries(a).filter(([, value]) => value !== undefined);
  const bRecord = b as Record<string, unknown>;
  const bCount = Object.values(b).filter((value) => value !== undefined).length;
  return (
    aEntries.length === bCount && aEntries.every(([key, value]) => sameJson(value, bRecord[key]))
  );
}
