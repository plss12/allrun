import { useTranslation } from 'react-i18next';

import type { CanvasFormat, Template } from '@/core/template';
import type { UserTemplates } from '@/data/user-templates';
import { Sheet } from '@/ui/sheet';

import type { DesignChoice } from './design-choice';
import { DesignGallery } from './design-gallery';
import { SheetFrame } from './sheet-frame';
import type { StockPhotos } from './stock-photos';
import type { LayerContext } from './template-scene';

/**
 * The editor's Designs button: the same gallery as the selection screen's tab, for the format on
 * the canvas, with a tile to save the design on it among the user's.
 */
export function TemplateSheet({
  visible,
  onClose,
  format,
  design,
  layerContext,
  stock,
  userTemplates,
  onChoose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly format: CanvasFormat;
  /** The design on the canvas, which "Save current design" keeps. */
  readonly design: Template;
  readonly layerContext: LayerContext;
  readonly stock: StockPhotos | null;
  readonly userTemplates: UserTemplates;
  readonly onChoose: (choice: DesignChoice) => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetFrame title={t('templates.title')} closeLabel={t('editor.close')} onClose={onClose}>
        <DesignGallery
          context={layerContext}
          format={format}
          stock={stock}
          userTemplates={userTemplates}
          current={design}
          onChoose={onChoose}
        />
      </SheetFrame>
    </Sheet>
  );
}
