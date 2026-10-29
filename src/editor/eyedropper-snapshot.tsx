import {
  AlphaType,
  Circle,
  ColorType,
  drawAsImage,
  FilterMode,
  Group,
  Image,
  MipmapMode,
  Path,
  Rect,
  Skia,
  type SkImage,
  type SkPath,
  type Transforms3d,
} from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

import { rgbToHex } from '@/core/color-menu';
import { CANVAS_FORMATS } from '@/core/template';

import { type ExportDesign, exportScene } from './export-scene';

/**
 * The eyedropper's snapshot of the design, the color of one of its pixels, and the loupe's
 * drawing (see `eyedropper.tsx`). Apart from the loupe's gesture, so they are tested off-screen
 * with CanvasKit.
 */

/**
 * The eyedropper's snapshot of the design: the exported image, at the canvas's size, with its
 * widgets and its real transparency (none where the design lets what is under it show), so the
 * eyedropper can tell a color from nothing. Taken once, when it opens; the caller disposes of it
 * when it closes.
 *
 * @throws Error when it can't be drawn off-screen.
 */
export async function snapshotDesign(design: ExportDesign): Promise<SkImage> {
  const image = await drawAsImage(exportScene(design), CANVAS_FORMATS[design.template.format]);
  if (image === null) {
    throw new Error(`Could not draw the ${design.template.format} design for the eyedropper`);
  }
  return image;
}

/** Below this alpha (0..255) a pixel counts as nothing: the eyedropper picks no color there. */
const MIN_ALPHA = 13;

/**
 * The `#RRGGBB` of a pixel of `image` (a translucent one's own color, not mixed with what shows
 * through it), or `null` where it is transparent, or so faint it is nearly.
 *
 * @throws Error when the pixel can't be read.
 */
export function pixelColor(image: SkImage, x: number, y: number): string | null {
  const pixels = image.readPixels(x, y, {
    width: 1,
    height: 1,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!(pixels instanceof Uint8Array) || pixels.length < 4) {
    throw new Error(`Could not read the pixel at ${x}, ${y} of the eyedropper's snapshot`);
  }
  return pixels[3] < MIN_ALPHA ? null : rgbToHex(pixels[0], pixels[1], pixels[2]);
}

/** The loupe's radius and the width of its ring, in points. */
export const LOUPE_RADIUS = 52;
const RING = 12;
const OUTER = LOUPE_RADIUS + RING;
/** How much bigger than on the canvas the loupe shows the design. */
export const LOUPE_ZOOM = 6;
/** Pixels drawn as squares, so the one under the center reads as such. */
const PIXELATED = { filter: FilterMode.Nearest, mipmap: MipmapMode.None } as const;
/** The checkerboard behind the loupe, where the design is transparent, as the canvas's. */
const CHECKER_DARK = '#1C1C1E';
const CHECKER_LIGHT = '#2C2C2E';
const CHECKER_SQUARE = 8;

let checker: SkPath | null = null;

/** The checkerboard's light squares over the loupe, from its center; made once. */
function checkerPath(): SkPath {
  if (checker === null) {
    const builder = Skia.PathBuilder.Make();
    const squares = Math.ceil((2 * OUTER) / CHECKER_SQUARE);
    for (let row = 0; row < squares; row++) {
      for (let column = row % 2; column < squares; column += 2) {
        builder.addRect(
          Skia.XYWHRect(
            -OUTER + column * CHECKER_SQUARE,
            -OUTER + row * CHECKER_SQUARE,
            CHECKER_SQUARE,
            CHECKER_SQUARE,
          ),
        );
      }
    }
    checker = builder.detach();
  }
  return checker;
}

/** A circle around the loupe's center, to clip to. */
const disc = (radius: number) =>
  Skia.RRectXY(Skia.XYWHRect(-radius, -radius, 2 * radius, 2 * radius), radius, radius);

/**
 * Where the loupe is and what it shows, for the pixel (`x`, `y`) of a snapshot shown `ratio`
 * points per pixel: `at` moves the loupe to the pixel on screen; `lens` magnifies the snapshot
 * so the pixel's center is the loupe's; `fill` blows it up so the pixel alone fills the ring.
 */
export function loupePlacement(
  x: number,
  y: number,
  ratio: number,
): { readonly at: Transforms3d; readonly lens: Transforms3d; readonly fill: Transforms3d } {
  'worklet';
  const px = Math.floor(x) + 0.5;
  const py = Math.floor(y) + 0.5;
  const around = (scale: number): Transforms3d => [
    { translateX: -scale * px },
    { translateY: -scale * py },
    { scale },
  ];
  return {
    at: [{ translateX: px * ratio }, { translateY: py * ratio }],
    lens: around(ratio * LOUPE_ZOOM),
    fill: around(OUTER * 4),
  };
}

type Animated<T> = T | SharedValue<T>;

/**
 * The loupe, drawn around its center (moved there by `at`): the pixel's color in its ring, the
 * snapshot magnified inside, both over the checkerboard where the design is transparent, and
 * the pixel itself framed in the middle.
 */
export function Loupe({
  image,
  ratio,
  at,
  lens,
  fill,
}: {
  readonly image: SkImage;
  /** Points on screen per pixel of the snapshot. */
  readonly ratio: number;
  readonly at: Animated<Transforms3d>;
  readonly lens: Animated<Transforms3d>;
  readonly fill: Animated<Transforms3d>;
}) {
  const width = image.width();
  const height = image.height();
  const pixel = ratio * LOUPE_ZOOM;
  const background = (
    <>
      <Rect x={-OUTER} y={-OUTER} width={2 * OUTER} height={2 * OUTER} color={CHECKER_DARK} />
      <Path path={checkerPath()} color={CHECKER_LIGHT} />
    </>
  );
  return (
    <Group transform={at}>
      <Group clip={disc(OUTER)}>
        {background}
        <Group transform={fill}>
          <Image image={image} x={0} y={0} width={width} height={height} sampling={PIXELATED} />
        </Group>
      </Group>
      <Group clip={disc(LOUPE_RADIUS)}>
        {background}
        <Group transform={lens}>
          <Image image={image} x={0} y={0} width={width} height={height} sampling={PIXELATED} />
        </Group>
      </Group>
      <Circle cx={0} cy={0} r={OUTER} style="stroke" strokeWidth={2} color="#FFFFFF" />
      <Circle
        cx={0}
        cy={0}
        r={LOUPE_RADIUS}
        style="stroke"
        strokeWidth={1.5}
        color="rgba(0, 0, 0, 0.45)"
      />
      <Rect
        x={-pixel / 2}
        y={-pixel / 2}
        width={pixel}
        height={pixel}
        style="stroke"
        strokeWidth={1.5}
        color="#FFFFFF"
      />
    </Group>
  );
}
