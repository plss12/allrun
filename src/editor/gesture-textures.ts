import { drawAsPicture, Skia, type SkImage, type SkPicture } from '@shopify/react-native-skia';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { logError } from '@/ui/log';

import { disposeLater } from './paragraph-arena';

/** A size in pixels of the device. */
export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/** What a gesture leaves still and what it moves, to draw once into textures when it starts. */
export interface TextureRequest {
  /** Which gesture this is: a new one draws them again. */
  readonly key: string;
  /** The size of the whole canvas. */
  readonly sceneSize: PixelSize;
  /** Everything under what moves, `null` if that stays as it is (it costs little). */
  readonly under: ReactElement | null;
  /** The widgets over what moves, `null` if there are none. */
  readonly over: ReactElement | null;
  /** The widget that moves, `null` if it is a photo, which is one image already. */
  readonly live: { readonly element: ReactElement; readonly size: PixelSize } | null;
}

/** The textures of the gesture in course, once drawn. */
export interface GestureTextures {
  readonly under: SharedValue<SkImage | null>;
  readonly over: SharedValue<SkImage | null>;
  readonly live: SharedValue<SkImage | null>;
  /** The gesture they are ready for, `null` until then: the scene draws in vector meanwhile. */
  readonly readyKey: string | null;
}

/** Draws `picture` into a texture of the UI thread, the one that draws the canvas, and frees it. */
function drawTexture(
  picture: SkPicture | null,
  size: PixelSize,
  texture: SharedValue<SkImage | null>,
): boolean {
  'worklet';
  if (picture === null) {
    return true;
  }
  // A surface made for this texture and freed at once. Kept for the next gesture, it saved making
  // one, but every drag then left some 24 MB of the GPU's memory behind, never used again.
  const surface = Skia.Surface.MakeOffscreen(size.width, size.height);
  if (surface === null) {
    picture.dispose();
    return false;
  }
  surface.getCanvas().drawPicture(picture);
  surface.flush();
  // One left by a gesture just before, which nothing draws anymore: the scene went back to vector
  // when that gesture ended, before this one asked for its own.
  texture.get()?.dispose();
  texture.set(surface.makeImageSnapshot());
  surface.dispose();
  picture.dispose();
  return true;
}

function freeTexture(texture: SharedValue<SkImage | null>): void {
  'worklet';
  texture.get()?.dispose();
  texture.set(null);
}

/** The textures of a gesture, by what they hold. */
export interface TextureSlots {
  readonly under: SharedValue<SkImage | null>;
  readonly over: SharedValue<SkImage | null>;
  readonly live: SharedValue<SkImage | null>;
}

/**
 * Draws the textures `request` asks for into `slots`, and says so with `onReady`. The function it
 * returns ends the gesture: what it drew is freed a moment later, once the scene has stopped drawing
 * it, unless another gesture has started by then, whose textures would be in the slots.
 *
 * @param gestures - How many gestures have asked for textures, shared by all of them.
 * @returns What ends the gesture.
 */
export function drawGestureTextures(
  request: TextureRequest,
  slots: TextureSlots,
  gestures: { current: number },
  onReady: () => void,
): () => void {
  const { under, over, live } = slots;
  gestures.current += 1;
  const gesture = gestures.current;
  let current = true;
  const markReady = (ok: boolean) => {
    if (!ok) {
      logError('Could not draw the textures of a gesture', new Error('No offscreen surface'));
    } else if (current) {
      onReady();
    }
  };
  const record = (element: ReactElement | null): Promise<SkPicture | null> =>
    element === null ? Promise.resolve(null) : drawAsPicture(element);
  Promise.all([record(request.under), record(request.over), record(request.live?.element ?? null)])
    .then(([underPicture, overPicture, livePicture]) => {
      if (!current) {
        // Over already, and another may have drawn its own: these must not replace them.
        [underPicture, overPicture, livePicture].forEach((picture) => picture?.dispose());
        return;
      }
      const { sceneSize } = request;
      const liveSize = request.live?.size ?? sceneSize;
      // One texture per frame, so that no frame of the gesture pays for all of them: the scene
      // draws in vector until they are ready.
      scheduleOnUI(() => {
        const steps = [
          { picture: underPicture, size: sceneSize, texture: under },
          { picture: overPicture, size: sceneSize, texture: over },
          { picture: livePicture, size: liveSize, texture: live },
        ];
        let next = 0;
        const step = () => {
          // Those with nothing to draw take no frame.
          while (next < steps.length && steps[next].picture === null) {
            next += 1;
          }
          if (next === steps.length) {
            scheduleOnRN(markReady, true);
            return;
          }
          const { picture, size, texture } = steps[next];
          next += 1;
          if (!drawTexture(picture, size, texture)) {
            steps.slice(next).forEach((left) => left.picture?.dispose());
            scheduleOnRN(markReady, false);
            return;
          }
          requestAnimationFrame(step);
        };
        step();
      });
    })
    .catch((error: unknown) => logError('Could not record a gesture', error));
  return () => {
    current = false;
    // Once the scene has stopped drawing them: freeing what is still drawn would crash. By then
    // another gesture may have started, and what is in the slots would be its own: freed, the
    // canvas went black when two gestures came less than a second apart.
    disposeLater(() => {
      if (gestures.current !== gesture) {
        return;
      }
      scheduleOnUI(() => {
        freeTexture(under);
        freeTexture(over);
        freeTexture(live);
      });
    });
  };
}

/**
 * While a gesture lasts, what it leaves still is drawn once into textures, and each frame only puts
 * those textures on the screen, however many widgets, shadows and texts they hold: a blurred shadow
 * or a new size of a text costs far too much to pay on every frame of a modest phone (ADR 014). They
 * last only for the gesture: when it ends, the scene draws in vector again, and exporting never sees
 * them.
 *
 * Time O(s) once per gesture, for the s widgets of the scene, on the UI thread. Space O(canvas) in
 * the GPU, for two screens at most, freed when the gesture ends.
 */
export function useGestureTextures(request: TextureRequest | null): GestureTextures {
  const under = useSharedValue<SkImage | null>(null);
  const over = useSharedValue<SkImage | null>(null);
  const live = useSharedValue<SkImage | null>(null);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const key = request?.key ?? null;
  const gestures = useRef(0);

  useEffect(() => {
    if (request === null) {
      return undefined;
    }
    const endGesture = drawGestureTextures(request, { under, over, live }, gestures, () =>
      setReadyKey(request.key),
    );
    return () => {
      setReadyKey(null);
      endGesture();
    };
    // The gesture's key says what it draws: what it asks for doesn't change during a gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { under, over, live, readyKey };
}
