import type { SkImage } from '@shopify/react-native-skia';
import { useRef, useState } from 'react';

import { isOpaque } from '@/core/design-background';
import { type ExportEncoding, exportEncoding, exportFileName } from '@/core/export';
import { logError } from '@/ui/log';
import { toLocalTimestamp } from '@/ui/today';

import { exportColorSpace, renderDesign, writeImage } from './export-image';
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

/** Draws a design at full quality, encoded and written to a file. */
export async function produceImage(design: ExportDesign): Promise<ExportedImage> {
  const { photo, cells = [] } = design;
  const encoding = exportEncoding(
    isOpaque(
      design.template,
      photo === null ? null : { width: photo.width(), height: photo.height() },
      design.dominant,
      cells.map((cell) => (cell === null ? null : { width: cell.width(), height: cell.height() })),
    ),
  );
  const image = await renderDesign(design, exportColorSpace(encoding));
  const uri = await writeImage(
    image,
    encoding,
    exportFileName(encoding, toLocalTimestamp(new Date())),
  );
  return { image, uri, encoding };
}

/**
 * Exporting: `start` draws the design once, at full quality, so that saving, sharing and copying
 * it are instant; `stop` leaves. An opaque design becomes a JPEG, one with see-through parts (no
 * photo, or the photo leaving the canvas partly empty over no background) a transparent PNG (see
 * `core/export.ts`). A result that arrives after `stop` is dropped.
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
        const exported = await produceImage(await design());
        if (run.current === id) {
          setState({ status: 'ready', exported });
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
