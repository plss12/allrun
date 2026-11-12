/**
 * The filters of the canvas's photo (R4e, ADR 017), changed by swiping one finger sideways over it,
 * as on Instagram. Only the canvas's own photo takes one: not a collage's, not a widget. The looks
 * are color matrices (Skia's 4×5, row-major, its last column added in 0..1), so the color they
 * give anything can be worked out here; the blurs are drawn by shaders (see `template-scene.tsx`).
 */

/**
 * The filters, in the order the swipe goes through them after the photo as it is: the looks from
 * the most saturated to black and white, then the blurs (the owner's order).
 */
export const PHOTO_FILTERS = [
  'chrome',
  'golden',
  'portra',
  'fade',
  'mono',
  'motionBlur',
  'zoomBlur',
] as const;

export type PhotoFilterId = (typeof PHOTO_FILTERS)[number];

/** A 4×5 color matrix, row-major: each output channel from R, G, B, A and a constant (0..1). */
export type ColorMatrix = readonly number[];

/** How a filter draws: a color matrix, or a blur along the photo or out from its middle. */
export type PhotoFilterLook =
  | { readonly kind: 'matrix'; readonly matrix: ColorMatrix }
  | { readonly kind: 'motionBlur'; readonly length: number }
  | { readonly kind: 'zoomBlur'; readonly strength: number };

const IDENTITY: ColorMatrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** The weight of each channel in a color's luminance (Rec. 709). */
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/**
 * `a` after `b`: the matrix that does `b` and then `a`, the 4×4 parts multiplied and the constants
 * carried through. Time and space O(1).
 */
export function composeMatrices(a: ColorMatrix, b: ColorMatrix): ColorMatrix {
  const out: number[] = [];
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 5; column++) {
      let value = column === 4 ? a[row * 5 + 4] : 0;
      for (let k = 0; k < 4; k++) {
        value += a[row * 5 + k] * b[k * 5 + column];
      }
      out.push(value);
    }
  }
  return out;
}

/** Each channel times its factor. */
function scaleChannels(r: number, g: number, b: number): ColorMatrix {
  return [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
}

/** Saturation times `s`: 0 is grey, 1 as it is, around each color's luminance. */
function saturation(s: number): ColorMatrix {
  const [lr, lg, lb] = LUMA.map((weight) => weight * (1 - s));
  return [lr + s, lg, lb, 0, 0, lr, lg + s, lb, 0, 0, lr, lg, lb + s, 0, 0, 0, 0, 0, 1, 0];
}

/** Contrast times `c` around mid grey, and `lift` added to every channel. */
function contrast(c: number, lift: number = 0): ColorMatrix {
  const offset = (1 - c) / 2 + lift;
  return [c, 0, 0, 0, offset, 0, c, 0, 0, offset, 0, 0, c, 0, offset, 0, 0, 0, 1, 0];
}

/** `#RRGGBB` as channels in 0..1. */
function channels(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/**
 * A split tone: the shadows toward `shadow` and the lights toward `light`, by `amount`, as one
 * matrix (the shift is linear in each color's luminance).
 */
function splitTone(shadow: string, light: string, amount: number): ColorMatrix {
  const dark = channels(shadow);
  const bright = channels(light);
  const rows = dark.flatMap((start, channel) => {
    const shift = amount * (bright[channel] - start);
    return [
      (channel === 0 ? 1 : 0) + shift * LUMA[0],
      (channel === 1 ? 1 : 0) + shift * LUMA[1],
      (channel === 2 ? 1 : 0) + shift * LUMA[2],
      0,
      amount * (start - 0.5),
    ];
  });
  return [...rows, 0, 0, 0, 1, 0];
}

/** Each filter's look. */
const LOOKS: Readonly<Record<PhotoFilterId, PhotoFilterLook>> = {
  // A warm film with soft shadows: a little less color, warmer, the blacks lifted a touch.
  portra: {
    kind: 'matrix',
    matrix: composeMatrices(
      contrast(0.94, 0.03),
      composeMatrices(scaleChannels(1.06, 1.01, 0.92), saturation(0.88)),
    ),
  },
  // An old slide film (Kodachrome): strong contrast and color, warm reds, cool shadows.
  chrome: {
    kind: 'matrix',
    matrix: composeMatrices(
      contrast(1.15),
      composeMatrices(
        splitTone('#1E4D5C', '#FFE2B0', 0.12),
        composeMatrices(scaleChannels(1.06, 1, 0.96), saturation(1.25)),
      ),
    ),
  },
  // Golden hour: warm and golden, a little more color.
  golden: {
    kind: 'matrix',
    matrix: composeMatrices(
      contrast(1.04, 0.01),
      composeMatrices(scaleChannels(1.1, 1.02, 0.85), saturation(1.06)),
    ),
  },
  // A matte, faded film: low contrast with the blacks lifted, the colors washed out.
  fade: {
    kind: 'matrix',
    matrix: composeMatrices(contrast(0.78, 0.05), saturation(0.72)),
  },
  // Black and white, with a little more contrast than the bare luminance.
  mono: { kind: 'matrix', matrix: composeMatrices(contrast(1.08), saturation(0)) },
  // A photo panned with the subject: smeared sideways, along the photo, by this share of its width.
  motionBlur: { kind: 'motionBlur', length: 0.045 },
  // Rushing in: smeared out from the photo's middle, the edges up to this share of the way.
  zoomBlur: { kind: 'zoomBlur', strength: 0.08 },
};

/** How `filter` draws. Time and space O(1). */
export function photoFilterLook(filter: PhotoFilterId): PhotoFilterLook {
  return LOOKS[filter];
}

/** The matrix of a look that has one; the blurs keep the colors. */
function matrixOf(filter: PhotoFilterId | null): ColorMatrix {
  if (filter === null) {
    return IDENTITY;
  }
  const look = LOOKS[filter];
  return look.kind === 'matrix' ? look.matrix : IDENTITY;
}

/**
 * `hex` (`#RRGGBB`) as `filter` shows it, in capitals: the photo's dominant color behind the photo
 * (the `auto` background) goes with its filter, grey under a black and white one. The blurs and no
 * filter leave it as it is. Time and space O(1).
 */
export function filteredColor(filter: PhotoFilterId | null, hex: string): string {
  const matrix = matrixOf(filter);
  const [r, g, b] = channels(hex);
  const out = [0, 1, 2].map((row) => {
    const value =
      matrix[row * 5] * r +
      matrix[row * 5 + 1] * g +
      matrix[row * 5 + 2] * b +
      matrix[row * 5 + 3] +
      matrix[row * 5 + 4];
    return Math.round(Math.min(1, Math.max(0, value)) * 255);
  });
  return `#${out.map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/**
 * The pages of the swipe: the photo as it is (`null`), then each filter. Time and space O(1).
 */
export const FILTER_PAGES: readonly (PhotoFilterId | null)[] = [null, ...PHOTO_FILTERS];

/** Fast enough a fling, in points per second, to change the filter however little it went. */
const FLING_SPEED = 600;
/** The least share of the canvas a fling has to have gone. */
const FLING_MIN_SHARE = 0.08;
/**
 * The page `step` pages from `page` (1 the next, -1 the one before), round the `count` pages: past
 * the last comes the first again, and before the first the last (the user's choice: the swipe never
 * ends). Worklet: it runs in the gesture. Time and space O(1).
 */
export function pageBeside(page: number, step: number, count: number): number {
  'worklet';
  return (((page + step) % count) + count) % count;
}

/**
 * Where the swipe shows the page coming in, from the finger's sideways way `dx` (points, to the
 * left negative) on a canvas `width` wide: as far as the finger, never past the canvas. Every page
 * has one on each side (see `pageBeside`). Worklet: it runs in the gesture.
 */
export function swipeOffset(dx: number, width: number): number {
  'worklet';
  return Math.max(-width, Math.min(width, dx));
}

/**
 * The page a swipe lands on when the finger lifts at `offset` (see `swipeOffset`) with speed
 * `velocity` (points per second), from page `page` of `count`: the next one (to the left) or the one
 * before (to the right), round the pages, when it went past half the canvas, or was flung that way
 * after a little; else the same. Worklet: it runs in the gesture. Time and space O(1).
 */
export function pageAfterSwipe(
  page: number,
  offset: number,
  velocity: number,
  width: number,
  count: number,
): number {
  'worklet';
  if (offset === 0) {
    return page;
  }
  const farEnough = Math.abs(offset) >= width / 2;
  const flung =
    Math.abs(velocity) >= FLING_SPEED &&
    Math.sign(velocity) === Math.sign(offset) &&
    Math.abs(offset) >= width * FLING_MIN_SHARE;
  return farEnough || flung ? pageBeside(page, offset < 0 ? 1 : -1, count) : page;
}
