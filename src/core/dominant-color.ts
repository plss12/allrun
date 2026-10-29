/**
 * The dominant color of a photo: the color of its largest group of similar colors, the default
 * background where the photo leaves the canvas empty (ADR 009). Unlike the average, which tends
 * to a dull grey-brown, it is a color the photo really has.
 *
 * Idea: modified median cut quantization (MMCQ), as Leptonica and color-thief implement it
 * (D. Bloomberg, "Color quantization using modified median cut", 2008). The colors go into a
 * histogram of 5 bits per channel (with the sums of the pixels in each bin); the box of colors
 * that holds them is cut in two at the median of its longest side, again and again, first the
 * most populated boxes, then those with the most pixels and volume together, until there are
 * `MAX_BOXES` or every box holds similar colors. The most populated box is the largest group of
 * similar colors, and the average of its pixels the answer.
 *
 * Meant for a reduced copy of the photo (64 px), read once per photo: time O(p + k · 2^15) for p
 * pixels and k boxes, space O(2^15) for the histogram.
 */

/** Bits kept of each channel: 32 levels, 32768 bins. */
const SIGNIFICANT_BITS = 5;
const SHIFT = 8 - SIGNIFICANT_BITS;
const LEVELS = 1 << SIGNIFICANT_BITS;
/** Boxes the colors are cut into. */
const MAX_BOXES = 8;
/** Share of the boxes cut by population alone, before population and volume. */
const POPULATION_SHARE = 0.75;
/**
 * A box no wider than this many levels on every side (32 of 256 values) is already a group of
 * similar colors, and isn't cut: with few colors, cutting on would split one group of shades into
 * several smaller ones and let a single, less frequent color win.
 */
const SIMILAR_SPAN = 3;
/** Pixels at least this opaque count (out of 255). */
const MIN_ALPHA = 125;

/** A box of the histogram: an inclusive range of levels per channel. */
interface ColorBox {
  readonly r1: number;
  readonly r2: number;
  readonly g1: number;
  readonly g2: number;
  readonly b1: number;
  readonly b2: number;
  /** Pixels in it. */
  readonly count: number;
}

type Channel = 'r' | 'g' | 'b';

const binOf = (r: number, g: number, b: number): number =>
  (r << (2 * SIGNIFICANT_BITS)) + (g << SIGNIFICANT_BITS) + b;

const volumeOf = (box: ColorBox): number =>
  (box.r2 - box.r1 + 1) * (box.g2 - box.g1 + 1) * (box.b2 - box.b1 + 1);

function countIn(
  histogram: Uint32Array,
  r1: number,
  r2: number,
  g1: number,
  g2: number,
  b1: number,
  b2: number,
): number {
  let count = 0;
  for (let r = r1; r <= r2; r++) {
    for (let g = g1; g <= g2; g++) {
      for (let b = b1; b <= b2; b++) {
        count += histogram[binOf(r, g, b)];
      }
    }
  }
  return count;
}

function boxOf(histogram: Uint32Array, range: Omit<ColorBox, 'count'>): ColorBox {
  const { r1, r2, g1, g2, b1, b2 } = range;
  return { ...range, count: countIn(histogram, r1, r2, g1, g2, b1, b2) };
}

/**
 * Cuts `box` in two at the median of its pixels along its longest side, or `null` when its colors
 * are already similar (see {@link SIMILAR_SPAN}).
 */
function cut(histogram: Uint32Array, box: ColorBox): readonly [ColorBox, ColorBox] | null {
  const spans: Record<Channel, number> = {
    r: box.r2 - box.r1,
    g: box.g2 - box.g1,
    b: box.b2 - box.b1,
  };
  const channel: Channel =
    spans.r >= spans.g && spans.r >= spans.b ? 'r' : spans.g >= spans.b ? 'g' : 'b';
  if (spans[channel] < SIMILAR_SPAN) {
    return null;
  }
  const low = box[`${channel}1`];
  const high = box[`${channel}2`];
  const slab = (level: number): Omit<ColorBox, 'count'> => ({
    ...box,
    [`${channel}1`]: level,
    [`${channel}2`]: level,
  });
  // The first level where the pixels so far reach half of the box's.
  let sum = 0;
  let median = low;
  for (let level = low; level <= high; level++) {
    const range = slab(level);
    sum += countIn(histogram, range.r1, range.r2, range.g1, range.g2, range.b1, range.b2);
    if (sum >= box.count / 2) {
      median = level;
      break;
    }
  }
  // Both halves keep at least one level.
  const end = Math.min(median, high - 1);
  return [
    boxOf(histogram, { ...box, [`${channel}2`]: end }),
    boxOf(histogram, { ...box, [`${channel}1`]: end + 1 }),
  ];
}

/** Cuts the best box by `priority` until there are `target` boxes or none can be cut. */
function cutUntil(
  histogram: Uint32Array,
  boxes: ColorBox[],
  target: number,
  priority: (box: ColorBox) => number,
): void {
  const uncuttable = new Set<ColorBox>();
  while (boxes.length < target) {
    let best: ColorBox | null = null;
    for (const box of boxes) {
      if (
        box.count > 0 &&
        !uncuttable.has(box) &&
        (best === null || priority(box) > priority(best))
      ) {
        best = box;
      }
    }
    if (best === null) {
      return;
    }
    const halves = cut(histogram, best);
    if (halves === null) {
      uncuttable.add(best);
      continue;
    }
    boxes.splice(boxes.indexOf(best), 1, ...halves.filter((half) => half.count > 0));
  }
}

const hex = (value: number): string =>
  Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0');

/**
 * The dominant color of an image's pixels (RGBA, 8 bits per channel, unpremultiplied, row after
 * row), as `#RRGGBB`; `null` when no pixel is opaque enough to count.
 *
 * @throws RangeError when `pixels` doesn't hold whole RGBA pixels.
 */
export function dominantColor(pixels: Uint8Array): string | null {
  if (pixels.length % 4 !== 0) {
    throw new RangeError(`Expected RGBA pixels, got ${pixels.length} bytes`);
  }
  const bins = 1 << (3 * SIGNIFICANT_BITS);
  const histogram = new Uint32Array(bins);
  // The pixels' own channels summed per bin, so the answer is their average, not a bin's middle.
  const sums = {
    red: new Float64Array(bins),
    green: new Float64Array(bins),
    blue: new Float64Array(bins),
  };
  const range = { r1: LEVELS, r2: -1, g1: LEVELS, g2: -1, b1: LEVELS, b2: -1 };
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < MIN_ALPHA) {
      continue;
    }
    const r = pixels[i] >> SHIFT;
    const g = pixels[i + 1] >> SHIFT;
    const b = pixels[i + 2] >> SHIFT;
    const bin = binOf(r, g, b);
    histogram[bin]++;
    sums.red[bin] += pixels[i];
    sums.green[bin] += pixels[i + 1];
    sums.blue[bin] += pixels[i + 2];
    count++;
    range.r1 = Math.min(range.r1, r);
    range.r2 = Math.max(range.r2, r);
    range.g1 = Math.min(range.g1, g);
    range.g2 = Math.max(range.g2, g);
    range.b1 = Math.min(range.b1, b);
    range.b2 = Math.max(range.b2, b);
  }
  if (count === 0) {
    return null;
  }
  const boxes: ColorBox[] = [{ ...range, count }];
  cutUntil(histogram, boxes, Math.ceil(MAX_BOXES * POPULATION_SHARE), (box) => box.count);
  cutUntil(histogram, boxes, MAX_BOXES, (box) => box.count * volumeOf(box));
  const largest = boxes.reduce((best, box) => (box.count > best.count ? box : best));
  return averageColor(histogram, sums, largest);
}

/** The average color of the pixels in a box. */
function averageColor(
  histogram: Uint32Array,
  sums: { readonly red: Float64Array; readonly green: Float64Array; readonly blue: Float64Array },
  box: ColorBox,
): string {
  let total = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let r = box.r1; r <= box.r2; r++) {
    for (let g = box.g1; g <= box.g2; g++) {
      for (let b = box.b1; b <= box.b2; b++) {
        const bin = binOf(r, g, b);
        total += histogram[bin];
        red += sums.red[bin];
        green += sums.green[bin];
        blue += sums.blue[bin];
      }
    }
  }
  return `#${hex(red / total)}${hex(green / total)}${hex(blue / total)}`.toUpperCase();
}
