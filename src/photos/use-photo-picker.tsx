import { type ReactElement, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from 'react-native';

import { SheetFrame } from '@/editor/sheet-frame';

import { PhotoBrowser } from './photo-browser';

/**
 * The app's own grid in a sheet, to choose a photo from inside the editor. `pick` opens it and
 * resolves with the photo's library id, or `null` if the user closes it; `sheet` goes in the
 * screen's tree. iOS opens no sheet over another: start it once any other has gone.
 */
export function usePhotoPicker(): {
  readonly pick: () => Promise<string | null>;
  readonly sheet: ReactElement;
} {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const waiting = useRef<((id: string | null) => void) | null>(null);
  const finish = (id: string | null) => {
    waiting.current?.(id);
    waiting.current = null;
    setOpen(false);
  };
  return {
    pick: () =>
      new Promise((resolve) => {
        waiting.current?.(null);
        waiting.current = resolve;
        setOpen(true);
      }),
    sheet: (
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        allowSwipeDismissal
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => finish(null)}
      >
        <SheetFrame
          title={t('photos.choose')}
          closeLabel={t('editor.close')}
          onClose={() => finish(null)}
        >
          {open ? <PhotoBrowser onPick={finish} /> : null}
        </SheetFrame>
      </Modal>
    ),
  };
}
