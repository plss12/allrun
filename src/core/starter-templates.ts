import { defaultActivityTemplate, defaultSummaryTemplate } from './default-layout';
import type { TemplateData } from './layout-kit';
import { classicTemplate } from './starter-classic';
import { minimalTemplate } from './starter-minimal';
import { posterTemplate } from './starter-poster';
import type { CanvasFormat, Template } from './template';

/**
 * AllRun's own templates (ADR 007): recipes rather than stored designs. Each one lays out the
 * widgets for the data and the format it is given, so every one works in the five formats and
 * with any activity or summary, and brings its own font and personality. Adding one is adding a
 * recipe here.
 */
export const STARTER_TEMPLATE_IDS = ['sport', 'poster', 'classic', 'minimal'] as const;

export type StarterTemplateId = (typeof STARTER_TEMPLATE_IDS)[number];

/** The template the editor opens with: Sport, the default composition. */
export const DEFAULT_STARTER: StarterTemplateId = 'sport';

const RECIPES: Readonly<
  Record<StarterTemplateId, (data: TemplateData, format: CanvasFormat) => Template>
> = {
  sport: (data, format) =>
    data.mode === 'activity'
      ? defaultActivityTemplate(data.activity, format)
      : defaultSummaryTemplate(data.summary, format),
  poster: posterTemplate,
  classic: classicTemplate,
  minimal: minimalTemplate,
};

/** One of AllRun's templates laid out for `data` in `format`. */
export function starterTemplate(
  id: StarterTemplateId,
  data: TemplateData,
  format: CanvasFormat,
): Template {
  return RECIPES[id](data, format);
}
