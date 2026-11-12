import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { Template } from '@/core/template';
import type { UserTemplates } from '@/data/user-templates';
import { Sheet } from '@/ui/sheet';

import type { DesignChoice } from './design-choice';
import { DesignGallery } from './design-gallery';
import { SheetFrame } from './sheet-frame';
import type { StockPhotos } from './stock-photos';
import type { LayerContext } from './template-scene';

/**
 * The editor's Designs button: the same gallery as the selection screen's tab, with a tile to save
 * the design on the canvas among the user's, whose own show those of its format.
 *
 * It stays mounted once opened, as the widget gallery does (ADR 015): closing it let go of every
 * thumbnail's canvas, and Android destroying their surfaces held frames of 110-200 ms, on choosing
 * a design too; and each opening drew them again. While it stays closed it isn't drawn again (see
 * `TemplateSheet`), so the editor's edits cost nothing more.
 */
function TemplateSheetContent({
  visible,
  onClose,
  design,
  layerContext,
  stock,
  userTemplates,
  onChoose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** The design on the canvas, which "Save current design" keeps. */
  readonly design: Template;
  readonly layerContext: LayerContext;
  readonly stock: StockPhotos | null;
  readonly userTemplates: UserTemplates;
  readonly onChoose: (choice: DesignChoice) => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} keepMounted>
      <SheetFrame title={t('templates.title')} closeLabel={t('editor.close')} onClose={onClose}>
        <DesignGallery
          context={layerContext}
          stock={stock}
          userTemplates={userTemplates}
          current={design}
          onChoose={onChoose}
        />
      </SheetFrame>
    </Sheet>
  );
}

/** {@link TemplateSheetContent}, drawn again only while it shows or as it opens or closes. */
export const TemplateSheet = memo(
  TemplateSheetContent,
  (before, after) => !before.visible && !after.visible,
);
