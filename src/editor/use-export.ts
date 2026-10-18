import type { SkImage } from '@shopify/react-native-skia';
import { useRef, useState } from 'react';

import { type ExportEncoding, exportEncoding, exportFileName } from '@/core/export';
import { logError } from '@/ui/log';
import { toLocalTimestamp } from '@/ui/today';

import { renderDesign, writeImage } from './export-image';
import type { ExportDesign } from './export-scene';

/** The finished image: drawn, encoded and written to a file, ready to save, share or copy. */
export interface ExportedImage {
  readonly image: SkImage;
  readonly uri: string;
  readonly encoding: ExportEncoding;
}

export type ExportState =
  | { readonly status: 'idle' }
  | { readonly status: 'rendering' }
  | { readonly status: 'ready'; readonly exported: ExportedImage }
  | { readonly status: 'error' };

const IDLE: ExportState = { status: 'idle' };

/**
 * Exporting: `start` draws the design once, at full quality, so that saving, sharing and copying
 * it are instant; `stop` leaves. A design without a photo becomes a transparent PNG, one with a
 * photo a JPEG (see `core/export.ts`). A result that arrives after `stop` is dropped.
 */
export function useExport() {
  const [state, setState] = useState<ExportState>(IDLE);
  /** Increases on every start and stop, so a stale render never lands. */
  const run = useRef(0);

  /** Prepares the image of the design that `design` resolves to. */
  const start = (design: () => Promise<ExportDesign>) => {
    run.current += 1;
    const id = run.current;
    setState({ status: 'rendering' });
    void (async () => {
      try {
        const resolved = await design();
        const encoding = exportEncoding(resolved.photo !== null);
        const image = await renderDesign(resolved);
        const name = exportFileName(encoding, toLocalTimestamp(new Date()));
        const uri = writeImage(image, encoding, name);
        if (run.current === id) {
          setState({ status: 'ready', exported: { image, uri, encoding } });
        }
      } catch (error) {
        logError('Could not prepare the image to export', error);
        if (run.current === id) {
          setState({ status: 'error' });
        }
      }
    })();
  };

  const stop = () => {
    run.current += 1;
    setState(IDLE);
  };

  return { state, start, stop };
}
