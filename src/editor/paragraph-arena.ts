import type { SkParagraph, SkParagraphBuilder } from '@shopify/react-native-skia';

/**
 * Native paragraphs freed together (see `inParagraphArena`). Every text a block or a layer lays out
 * is a native paragraph, each telling Hermes it holds a megabyte, which its garbage collector frees
 * late: a screen that lays out hundreds of texts each time it opens (the widget gallery) used to
 * pile them up until iOS closed the app.
 */

/** The arenas open while something is laid out, innermost last. */
const arenas: SkParagraph[][] = [];

/**
 * The paragraph `builder` builds, kept in the innermost open arena, if any, to be freed with it.
 * The builder is left to the garbage collector, as nothing keeps it: the native one has no
 * `dispose` (only CanvasKit's, in the tests, has one), and calling it crashed the app.
 */
export function finishParagraph(builder: SkParagraphBuilder): SkParagraph {
  const paragraph = builder.build();
  arenas[arenas.length - 1]?.push(paragraph);
  return paragraph;
}

/**
 * Frees `paragraph` now, a paragraph only measured (see `finishParagraph`), and takes it out of
 * its arena, which would free it again. Time O(p) for the p paragraphs of the innermost arena,
 * searched from the newest.
 */
export function discardParagraph(paragraph: SkParagraph): void {
  const arena = arenas[arenas.length - 1];
  const at = arena?.lastIndexOf(paragraph) ?? -1;
  if (at !== -1) {
    arena.splice(at, 1);
  }
  paragraph.dispose();
}

/**
 * How long freeing waits after the screen stops showing what it frees: Skia draws a canvas from
 * a recording on the UI thread, which still holds the paragraphs it drew until it is replaced.
 */
const FREE_DELAY_MS = 1000;

/** Calls `dispose` once the screen has surely stopped drawing what it frees. */
export function disposeLater(dispose: () => void): void {
  setTimeout(dispose, FREE_DELAY_MS);
}

/**
 * What `make` makes, and a way to free every paragraph built meanwhile (see `finishParagraph`),
 * once nothing draws them anymore: freeing one still drawn would crash. Time O(p) to free p
 * paragraphs.
 */
export function inParagraphArena<T>(make: () => T): {
  readonly value: T;
  readonly dispose: () => void;
} {
  const arena: SkParagraph[] = [];
  arenas.push(arena);
  try {
    return {
      value: make(),
      dispose: () => {
        for (const paragraph of arena.splice(0)) {
          paragraph.dispose();
        }
      },
    };
  } finally {
    arenas.pop();
  }
}
