import {
  Circle,
  ColorMatrix,
  FilterMode,
  Group,
  Image,
  ImageShader,
  MipmapMode,
  Rect,
  Shader,
  Skia,
  type SkPath,
  type SkRuntimeEffect,
} from '@shopify/react-native-skia';
import { createContext, use } from 'react';

import { photoFilterLook } from '@/core/photo-filter';
import { CANVAS_FORMATS, type CanvasFormat } from '@/core/template';

import type { ScenePhoto } from '../template-scene';

/** The sign on an empty cell, on the canvas: a plus on a dark circle, in canvas pixels. */
const EMPTY_HINT = { radius: 56, length: 52, thickness: 7 } as const;

/**
 * How many times bigger the scene draws the sign of an empty photo (see `EMPTY_HINT`): 1 on the
 * canvas; more in a thumbnail, where at the canvas's size it was a dot (see `emptyHintScale`).
 */
export const EmptyHintScale = createContext(1);

/** Smallest radius of an empty photo's sign in a thumbnail, at the canvas's level, in points. */
const THUMBNAIL_HINT_RADIUS = 10;

/**
 * The `EmptyHintScale` of a scene drawn `ratio` points per canvas pixel: its sign at least
 * `THUMBNAIL_HINT_RADIUS` points in radius, never smaller than on the canvas.
 */
export function emptyHintScale(ratio: number): number {
  return Math.max(1, THUMBNAIL_HINT_RADIUS / (EMPTY_HINT.radius * ratio));
}

/** The sign to fill an empty place with a photo, on the canvas: never in the image. */
export function EmptySign({ cx, cy }: { readonly cx: number; readonly cy: number }) {
  const scale = use(EmptyHintScale);
  const radius = EMPTY_HINT.radius * scale;
  const length = EMPTY_HINT.length * scale;
  const thickness = EMPTY_HINT.thickness * scale;
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={radius} color="rgba(0, 0, 0, 0.45)" />
      <Rect
        x={cx - length / 2}
        y={cy - thickness / 2}
        width={length}
        height={thickness}
        color="#FFFFFF"
      />
      <Rect
        x={cx - thickness / 2}
        y={cy - length / 2}
        width={thickness}
        height={length}
        color="#FFFFFF"
      />
    </Group>
  );
}

/** The two tones of the transparency checkerboard and the side of its squares (canvas pixels). */
export const CHECKER_DARK = '#1C1C1E';
export const CHECKER_LIGHT = '#2C2C2E';
export const CHECKER_SQUARE = 40;

/** Smallest side of the checkerboard's squares in a thumbnail, on screen, in points. */
const THUMBNAIL_CHECKER_SQUARE = 10;

/**
 * The side of the checkerboard's squares, in canvas pixels, of a scene drawn `ratio` points per
 * canvas pixel: at least `THUMBNAIL_CHECKER_SQUARE` points on screen, never smaller than on the
 * canvas. In a thumbnail, the canvas's squares were so small that it looked black, like a black
 * background (the user's report).
 */
export function checkerSquare(ratio: number): number {
  return Math.max(CHECKER_SQUARE, Math.round(THUMBNAIL_CHECKER_SQUARE / ratio));
}

/** The light squares of the checkerboard of each format and size of square, built once. */
const checkerPaths = new Map<string, SkPath>();

export function checkerPath(format: CanvasFormat, square: number): SkPath {
  const key = `${format}|${square}`;
  const cached = checkerPaths.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const { width, height } = CANVAS_FORMATS[format];
  const builder = Skia.PathBuilder.Make();
  for (let row = 0; row * square < height; row++) {
    for (let column = row % 2; column * square < width; column += 2) {
      builder.addRect(Skia.XYWHRect(column * square, row * square, square, square));
    }
  }
  const path = builder.detach();
  checkerPaths.set(key, path);
  return path;
}

/**
 * Photos are usually much larger than the canvas; trilinear filtering (linear + mipmaps) keeps
 * them smooth when scaled down instead of aliased.
 */
export const PHOTO_SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear } as const;

/** How many times a blur reads the photo for each of its pixels, along its way. */
const BLUR_SAMPLES = 24;

/**
 * The photo smeared sideways, along its own width, `span` canvas pixels in all, read evenly along
 * that way around each pixel: a photo panned with the subject.
 */
const MOTION_BLUR = `
uniform shader image;
uniform float span;
half4 main(float2 p) {
  half4 sum = half4(0);
  for (int i = 0; i < ${BLUR_SAMPLES}; i++) {
    float t = float(i) / ${BLUR_SAMPLES - 1}.0 - 0.5;
    sum += image.eval(p + float2(span * t, 0.0));
  }
  return sum / ${BLUR_SAMPLES}.0;
}`;

/**
 * The photo smeared out from its middle, the drawing's origin (see `photoRect`): each pixel the
 * mean of the photo between it and `strength` of the way toward the middle, so the middle stays
 * sharp and the edges rush in.
 */
const ZOOM_BLUR = `
uniform shader image;
uniform float strength;
half4 main(float2 p) {
  half4 sum = half4(0);
  for (int i = 0; i < ${BLUR_SAMPLES}; i++) {
    float t = float(i) / ${BLUR_SAMPLES - 1}.0;
    sum += image.eval(p * (1.0 - strength * t));
  }
  return sum / ${BLUR_SAMPLES}.0;
}`;

/** The blurs' shaders, compiled once, when first drawn (Skia is loaded by then). */
const blurEffects = new Map<string, SkRuntimeEffect>();

function blurEffect(source: string): SkRuntimeEffect {
  const kept = blurEffects.get(source);
  if (kept !== undefined) {
    return kept;
  }
  const effect = Skia.RuntimeEffect.Make(source);
  if (effect === null) {
    throw new Error('Could not compile a filter of the photo');
  }
  blurEffects.set(source, effect);
  return effect;
}

/**
 * The canvas's photo with its filter (see `photo-filter.ts`), in the coordinates of its
 * `photoMatrix` group, canvas pixels around the photo's middle as it covers the canvas: a look is a
 * color matrix on the photo; a blur, a shader reading it, the same on the canvas, on the screen and
 * in the image (the canvas is `canvasWidth` pixels wide in every format), and as much bigger or
 * smaller as the photo is drawn, as a blur taken with the photo would be.
 */
export function FilteredPhoto({
  photo,
  canvasWidth,
}: {
  readonly photo: ScenePhoto;
  readonly canvasWidth: number;
}) {
  if (photo.baked !== undefined) {
    return <Image image={photo.baked} rect={photo.rect} fit="fill" sampling={PHOTO_SAMPLING} />;
  }
  const look =
    photo.filter === undefined || photo.filter === null ? null : photoFilterLook(photo.filter);
  if (look === null || look.kind === 'matrix') {
    return (
      <Image image={photo.image} rect={photo.rect} fit="fill" sampling={PHOTO_SAMPLING}>
        {look === null ? null : <ColorMatrix matrix={[...look.matrix]} />}
      </Image>
    );
  }
  const imageShader = (
    <ImageShader
      image={photo.image}
      rect={photo.rect}
      fit="fill"
      tx="clamp"
      ty="clamp"
      sampling={PHOTO_SAMPLING}
    />
  );
  return (
    <Rect rect={photo.rect}>
      {look.kind === 'motionBlur' ? (
        <Shader source={blurEffect(MOTION_BLUR)} uniforms={{ span: look.length * canvasWidth }}>
          {imageShader}
        </Shader>
      ) : (
        <Shader source={blurEffect(ZOOM_BLUR)} uniforms={{ strength: look.strength }}>
          {imageShader}
        </Shader>
      )}
    </Rect>
  );
}

/** Shown in a picture while it is decoded: a neutral gray, as a photo app's empty cell. */
export const LOADING_PICTURE = '#3A3A3C';
