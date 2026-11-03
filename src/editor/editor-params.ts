import { z } from 'zod';

import { SPORT_FAMILIES } from '@/core/sports';

/** The photo to start with, by its library id (see `data/photo-library.ts`); none, without one. */
const photo = z.string().min(1).optional();

/**
 * What the editor shows, as route params, validated: they can come from a deep link, not only from
 * our own screens. The selection screen goes by the same ones, on its way to the editor.
 */
export const editorParamsSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('activity'), activityId: z.string().min(1), photo }),
  z.object({
    mode: z.literal('summary'),
    kind: z.enum(['week', 'month', 'year', 'custom']),
    start: z.iso.date(),
    end: z.iso.date(),
    families: z
      .string()
      .transform((value) => (value === '' ? [] : value.split(',')))
      .pipe(z.array(z.enum(SPORT_FAMILIES))),
    photo,
  }),
]);

/** What the editor fills its design with: one activity, or a period of some sports. */
export type EditorRequest = z.infer<typeof editorParamsSchema>;
