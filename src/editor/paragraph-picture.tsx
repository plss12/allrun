import { Group, Picture, Skia, type SkParagraph, type SkPicture } from '@shopify/react-native-skia';

/**
 * Texts drawn as pictures of them. Skia's own `<Paragraph>` lays its paragraph out again on every
 * frame it draws, on the UI thread, and a paragraph of one line throws its lines away and makes
 * them again each time; meanwhile the JavaScript thread may paint the same paragraph (a gesture
 * records what it leaves still with `drawAsPicture`) or free it. A paragraph isn't safe on two
 * threads at once: the app closed with a native crash in `ParagraphCmd::draw` in a release build.
 * A picture is recorded once, on the JavaScript thread, and can't change: the UI thread only reads
 * it, and keeps its own reference while it draws it, so freeing it is safe at any time.
 */

/** The pictures recorded of each paragraph, at the width it was drawn. */
const pictures = new WeakMap<
  SkParagraph,
  { readonly width: number; readonly picture: SkPicture }
>();

/**
 * Room around a text where it can draw (its shadows, the glyphs that lean past their advance): the
 * recording keeps nothing out of it.
 */
const RECORD_ROOM = 100_000;

/**
 * `paragraph` laid out at `width` and painted at the origin, as a picture, recorded once for each
 * width. Time O(t) the first time, for its t characters, and O(1) after; space O(t).
 */
export function paragraphPicture(paragraph: SkParagraph, width: number): SkPicture {
  const kept = pictures.get(paragraph);
  if (kept?.width === width) {
    return kept.picture;
  }
  // As Skia's `<Paragraph>` does before painting it.
  paragraph.layout(width);
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(
    Skia.XYWHRect(-RECORD_ROOM, -RECORD_ROOM, 2 * RECORD_ROOM, 2 * RECORD_ROOM),
  );
  paragraph.paint(canvas, 0, 0);
  const picture = recorder.finishRecordingAsPicture();
  recorder.dispose();
  // Not the one it replaces: a canvas may still hold it, and the garbage collector frees it.
  pictures.set(paragraph, { width, picture });
  return picture;
}

/**
 * Frees the picture of `paragraph`, if it has one: with the paragraph, which nothing may draw again
 * (see `paragraph-arena.ts`). A canvas that still draws it keeps its own reference.
 */
export function freeParagraphPicture(paragraph: SkParagraph): void {
  const kept = pictures.get(paragraph);
  if (kept !== undefined) {
    pictures.delete(paragraph);
    kept.picture.dispose();
  }
}

/** Draws `paragraph` at (`x`, `y`) laid out at `width`, as Skia's `<Paragraph>` would. */
export function ParagraphPicture({
  paragraph,
  x,
  y,
  width,
}: {
  readonly paragraph: SkParagraph;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}) {
  return (
    <Group transform={[{ translateX: x }, { translateY: y }]}>
      <Picture picture={paragraphPicture(paragraph, width)} />
    </Group>
  );
}
