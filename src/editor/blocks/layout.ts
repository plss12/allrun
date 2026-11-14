import type { SkParagraph } from '@shopify/react-native-skia';

import type { Viewport } from '@/core/map-tiles';
import type { Point } from '@/core/route-projection';

import type { WidgetMap } from '../widget-map';
import type { IconId } from './pieces';

/** Something drawn in a block, at its place in the block (top-left origin). */
export type Piece =
  | {
      readonly kind: 'text';
      readonly paragraph: SkParagraph;
      readonly x: number;
      readonly y: number;
      /** Drawn this many times taller than it is laid out (see `STRETCHED_FONTS`). */
      readonly stretch?: number;
      /** Drawn this many times its laid-out size: a small text laid out large (see `scaledBox`). */
      readonly scale?: number;
      /** Casts the shadow of shapes once stretched, laid out without its own (see `capitals`). */
      readonly shadow?: true;
      /**
       * Drawn turned a quarter counterclockwise (see `turned`): placed at (x, y) in a frame
       * `length` long whose top-left corner, once turned, is at (`turn.x`, `turn.y`).
       */
      readonly turn?: { readonly x: number; readonly y: number; readonly length: number };
    }
  | {
      /** A replica's card or bubble, in its app's color. */
      readonly kind: 'panel';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly radius: number;
      readonly color: string;
      /**
       * Part of a see-through view, as the phone's glass: drawn in its turn among the app's
       * marks, without a shadow (it would darken it from inside), and its `edge` in a color.
       */
      readonly flat?: true;
      readonly edge?: string;
    }
  | {
      /**
       * A replica's colors fading from top to bottom over a rectangle, kept within the rounded
       * card it lies on (`card`): the light on a timing tower's header, the shadow under it.
       */
      readonly kind: 'shade';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      /** Its colors, evenly spread from its top to its bottom, or from its left to its right. */
      readonly colors: readonly string[];
      readonly across?: true;
      readonly card: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly radius: number;
      };
    }
  | {
      /**
       * A sheet of paper that lifts off the photo with a shadow: a receipt, torn in teeth at its
       * top and bottom (`receipt`), or a boarding pass, its corners rounded and notched on both
       * sides where its stub tears off, `cut` down from its top (`pass`).
       */
      readonly kind: 'paper';
      readonly shape: 'receipt' | 'pass';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly color: string;
      readonly cut?: number;
    }
  | {
      /** The grain of a sheet of paper over a rectangle: specks of `color`, the same every time. */
      readonly kind: 'grain';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly color: string;
    }
  | {
      /** A marker's strokes behind words, one rectangle per stretch of a line. */
      readonly kind: 'highlight';
      readonly rects: readonly {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      }[];
      readonly color: string;
    }
  | {
      /** A replica's thin line in its own color, without a shadow: the camera's grid. */
      readonly kind: 'hairline';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly width: number;
      readonly color: string;
    }
  | {
      /** The tail of a sent chat message, out of its bubble's top right corner. */
      readonly kind: 'messageTail';
      readonly x: number;
      readonly y: number;
      readonly color: string;
    }
  | {
      /** An app's mark drawn with lines: the back chevron, or the read ticks. */
      readonly kind: 'chevron' | 'ticks';
      readonly x: number;
      readonly y: number;
      readonly size: number;
      readonly color: string;
    }
  | {
      readonly kind: 'icon';
      readonly icon: IconId;
      readonly x: number;
      readonly y: number;
      readonly size: number;
      /** A replica's own color for it; the block's when absent. */
      readonly color?: string;
    }
  | {
      /** A control of an app drawn as a filled glyph (see `symbolArt`), `size` square. */
      readonly kind: 'symbol';
      readonly symbol: AppSymbol;
      readonly x: number;
      readonly y: number;
      readonly size: number;
      readonly color: string;
    }
  | {
      /** A replica's round button: filled, or a ring `stroke` wide. */
      readonly kind: 'disc';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly color: string;
      readonly stroke?: number;
    }
  | {
      readonly kind: 'logo';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      /** A replica's own color for it; the block's when absent. */
      readonly color?: string;
    }
  | {
      /** AllRun's monogram, in a replica's own color. */
      readonly kind: 'mark';
      readonly x: number;
      readonly y: number;
      readonly height: number;
      readonly color: string;
    }
  | {
      /**
       * A route's map (ADR 021), a rounded square `size` wide at (x, y), in the map's own colors:
       * `viewport` is the square's, from its corner.
       */
      readonly kind: 'map';
      readonly x: number;
      readonly y: number;
      readonly size: number;
      readonly radius: number;
      readonly viewport: Viewport;
      readonly tiles: WidgetMap['tiles'];
    }
  | {
      readonly kind: 'route';
      readonly points: readonly Point[];
      /**
       * Its own color (a replica's) and width; the block's color and `ROUTE_STROKE` when absent.
       */
      readonly color?: string;
      readonly width?: number;
    };

/** The controls of the apps a replica recreates. */
export type AppSymbol =
  | 'backward'
  | 'pause'
  | 'forward'
  | 'airplay'
  | 'waveform'
  | 'flip'
  | 'pin'
  | 'stopwatch'
  | 'badge'
  | 'check';

/** A measured part of a block, which places its pieces with its top-left corner at (x, y). */
export interface Box {
  readonly width: number;
  readonly height: number;
  readonly place: (x: number, y: number) => Piece[];
}

export type Align = 'start' | 'center' | 'end';

/** Where a `size` long box starts within `span` when aligned. */
const offset = (align: Align, size: number, span: number): number =>
  align === 'start' ? 0 : align === 'end' ? span - size : (span - size) / 2;

/** Boxes one under another, `gap` apart, aligned across. */
export function column(boxes: readonly Box[], gap: number, align: Align): Box {
  const width = Math.max(0, ...boxes.map((box) => box.width));
  const height =
    boxes.reduce((sum, box) => sum + box.height, 0) + gap * Math.max(0, boxes.length - 1);
  return {
    width,
    height,
    place: (x, y) => {
      let top = y;
      return boxes.flatMap((box) => {
        const pieces = box.place(x + offset(align, box.width, width), top);
        top += box.height + gap;
        return pieces;
      });
    },
  };
}

/**
 * A box of texts turned a quarter counterclockwise, read upwards: what was its start is at its
 * bottom, and its first line at its left.
 */
export function turned(box: Box): Box {
  return {
    width: box.height,
    height: box.width,
    place: (x, y) =>
      box.place(0, 0).map((piece) => {
        if (piece.kind !== 'text') {
          throw new Error(`Only texts turn, not a ${piece.kind}`);
        }
        return { ...piece, turn: { x, y, length: box.width } };
      }),
  };
}

/** How many times larger than drawn a small text is laid out (see `scaledBox`). */
const LAYOUT_SCALE = 4;

/**
 * A box of texts laid out {@link LAYOUT_SCALE} times larger than drawn, `build` laying it out
 * that many times its size: the phone rounds small type's metrics and advances to whole units,
 * which moves a text a few units big off where it is measured (a day's number off the center of
 * its mark); laid out large, the rounding is too small to see.
 */
export function scaledBox(build: (scale: number) => Box): Box {
  const box = build(LAYOUT_SCALE);
  return {
    width: box.width / LAYOUT_SCALE,
    height: box.height / LAYOUT_SCALE,
    place: (x, y) =>
      box.place(0, 0).map((piece) => {
        if (piece.kind !== 'text') {
          throw new Error(`Only texts scale, not a ${piece.kind}`);
        }
        return {
          ...piece,
          x: x + piece.x / LAYOUT_SCALE,
          y: y + piece.y / LAYOUT_SCALE,
          scale: (piece.scale ?? 1) / LAYOUT_SCALE,
        };
      }),
  };
}

/** Boxes side by side, `gap` apart, aligned up and down. */
export function row(boxes: readonly Box[], gap: number, align: Align): Box {
  const width =
    boxes.reduce((sum, box) => sum + box.width, 0) + gap * Math.max(0, boxes.length - 1);
  const height = Math.max(0, ...boxes.map((box) => box.height));
  return {
    width,
    height,
    place: (x, y) => {
      let left = x;
      return boxes.flatMap((box) => {
        const pieces = box.place(left, y + offset(align, box.height, height));
        left += box.width + gap;
        return pieces;
      });
    },
  };
}

/** A box widened to `width`, its content aligned within it. */
export function widened(box: Box, width: number, align: Align): Box {
  const span = Math.max(width, box.width);
  return {
    width: span,
    height: box.height,
    place: (x, y) => box.place(x + offset(align, box.width, span), y),
  };
}

/** `left` at the start and `right` at the end of a `width` wide line, bottoms lined up. */
export function spread(left: Box, right: Box, width: number): Box {
  const span = Math.max(width, left.width + right.width);
  const height = Math.max(left.height, right.height);
  return {
    width: span,
    height,
    place: (x, y) => [
      ...left.place(x, y + height - left.height),
      ...right.place(x + span - right.width, y + height - right.height),
    ],
  };
}

/**
 * Boxes along a `width` long line, bottoms lined up: the first at its start, the last at its end
 * and the rest evenly between them, at least `minGap` apart (one alone is centered).
 */
export function justified(boxes: readonly Box[], width: number, minGap: number): Box {
  if (boxes.length === 1) {
    return widened(boxes[0], width, 'center');
  }
  const used = boxes.reduce((sum, box) => sum + box.width, 0);
  const span = Math.max(width, used + minGap * (boxes.length - 1));
  const gap = (span - used) / (boxes.length - 1);
  const height = Math.max(0, ...boxes.map((box) => box.height));
  return {
    width: span,
    height,
    place: (x, y) => {
      let left = x;
      return boxes.flatMap((box) => {
        const pieces = box.place(left, y + height - box.height);
        left += box.width + gap;
        return pieces;
      });
    },
  };
}

/**
 * A `width` × `height` box with each of `parts` at its own place in it (top-left corners), for
 * a replica that copies where an app puts each thing.
 */
export function placed(
  width: number,
  height: number,
  parts: readonly { readonly box: Box; readonly x: number; readonly y: number }[],
): Box {
  return {
    width,
    height,
    place: (x, y) => parts.flatMap((part) => part.box.place(x + part.x, y + part.y)),
  };
}

/** `front` centered over `back`, as big as the bigger of them. */
export function overlay(back: Box, front: Box): Box {
  const width = Math.max(back.width, front.width);
  const height = Math.max(back.height, front.height);
  return {
    width,
    height,
    place: (x, y) => [
      ...back.place(x + (width - back.width) / 2, y + (height - back.height) / 2),
      ...front.place(x + (width - front.width) / 2, y + (height - front.height) / 2),
    ],
  };
}

/** Width of each column of a table: its widest cell. */
export const columnWidths = (cells: readonly (readonly Box[])[]): number[] =>
  cells[0].map((_, i) => Math.max(...cells.map((line) => line[i].width)));

/** Width of a table of `widths` columns, `gap` apart and `pad` inside its edges. */
export const tableWidth = (widths: readonly number[], gap: number, pad: number): number =>
  widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1) + 2 * pad;

/** A row of a table, `height` tall: each box at the start of its column, centered up and down. */
export function tableRow(
  boxes: readonly Box[],
  widths: readonly number[],
  gap: number,
  pad: number,
  height: number,
): Box {
  let left = pad;
  return placed(
    tableWidth(widths, gap, pad),
    height,
    boxes.map((box, i) => {
      const x = left;
      left += widths[i] + gap;
      return { box, x, y: (height - box.height) / 2 };
    }),
  );
}
