import { type ReactElement, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SheetFrame } from '@/editor/sheet-frame';
import { Sheet } from '@/ui/sheet';

import { PhotoBrowser } from './photo-browser';

/** How a choice of photos goes: up to how many, and whether "No photo" is offered. */
export interface PhotoRequest {
  readonly max: number;
  readonly allowNone: boolean;
}

const ONE_PHOTO: PhotoRequest = { max: 1, allowNone: false };

/**
 * The app's own grid in a sheet, to choose photos from inside the editor. `pick` opens it for one
 * photo and resolves with its library id, or `null` if the user closes it. `choose` opens it as
 * `request` says: several marked in order, with a button to add them, when `max` is over one, and
 * the "No photo" cell first with `allowNone`; it resolves with their library ids in order (none for
 * "No photo"), or `null` if the user closes it. `sheet` goes in the screen's tree, inside its
 * `SheetHost`.
 */
export function usePhotoPicker(): {
  readonly pick: () => Promise<string | null>;
  readonly choose: (request: PhotoRequest) => Promise<readonly string[] | null>;
  readonly sheet: ReactElement;
} {
  const { t } = useTranslation();
  const [request, setRequest] = useState<PhotoRequest | null>(null);
  const waiting = useRef<((ids: readonly string[] | null) => void) | null>(null);
  const finish = (ids: readonly string[] | null) => {
    waiting.current?.(ids);
    waiting.current = null;
    setRequest(null);
  };
  const choose = (next: PhotoRequest) =>
    new Promise<readonly string[] | null>((resolve) => {
      waiting.current?.(null);
      waiting.current = resolve;
      setRequest(next);
    });
  // Kept while the sheet closes, so its title doesn't change on the way down.
  const [shown, setShown] = useState<PhotoRequest>(ONE_PHOTO);
  if (request !== null && request !== shown) {
    setShown(request);
  }
  return {
    pick: () => choose(ONE_PHOTO).then((ids) => (ids === null ? null : (ids[0] ?? null))),
    choose,
    sheet: (
      <Sheet visible={request !== null} onClose={() => finish(null)}>
        <SheetFrame
          title={
            shown.max > 1
              ? t('photos.chooseSeveral', { max: String(shown.max) })
              : t('photos.choose')
          }
          closeLabel={t('editor.close')}
          onClose={() => finish(null)}
        >
          {request !== null ? (
            <PhotoBrowser
              max={request.max}
              onPick={(id) => finish([id])}
              onPickMany={finish}
              onNoPhoto={request.allowNone ? () => finish([]) : undefined}
            />
          ) : null}
        </SheetFrame>
      </Sheet>
    ),
  };
}
