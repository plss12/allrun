import type { ParseKeys } from 'i18next';

/**
 * Every label each row of action tiles may show, for its size (see `actionLabelSize`): a tile that
 * changes its label ("Save" to "Saved", "Choose photo" to "Change photo") keeps the same size.
 */

type Translate = (key: ParseKeys) => string;

/** The export row: story, share, save and copy, and what they read once done. */
export function exportLabels(t: Translate): string[] {
  return [
    t('export.story'),
    t('export.share'),
    t('export.save'),
    t('export.saved'),
    t('export.copy'),
    t('export.copied'),
  ];
}

/** The photo's tools: remove, choose or change, reset and background. */
export function photoToolLabels(t: Translate): string[] {
  return [
    t('editor.removePhoto'),
    t('editor.choosePhoto'),
    t('editor.changePhoto'),
    t('editor.resetPhoto'),
    t('editor.background'),
  ];
}
