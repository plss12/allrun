import { Canvas, Group, type SkImage } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  framePhoto,
  panFraming,
  type PhotoFraming,
  type Size,
  zoomFraming,
} from '@/core/photo-framing';
import { CANVAS_FORMATS } from '@/core/template';

import { TemplateScene, type TemplateSceneProps } from './template-scene';

interface EditorCanvasProps extends Omit<TemplateSceneProps, 'background'> {
  /** On-screen width; the height follows the template format. */
  readonly displayWidth: number;
  /** The photo, or `null` to show the placeholder while there is none. */
  readonly photo: SkImage | null;
  readonly framing: PhotoFraming;
  /** Called once per gesture, when the fingers lift, with the framing the user ended on. */
  readonly onFramingChange: (framing: PhotoFraming) => void;
}

/**
 * The template scene scaled down from its 1080 px export size to the screen, with the photo
 * framed by dragging and pinching.
 *
 * During a gesture the framing lives in a shared value updated on the UI thread, which moves only
 * the photo: React doesn't re-render and the layers aren't redrawn. When the fingers lift, the
 * framing goes to `onFramingChange` (one undo step per gesture).
 */
export function EditorCanvas({
  displayWidth,
  photo,
  framing,
  onFramingChange,
  ...scene
}: EditorCanvasProps) {
  const canvas = CANVAS_FORMATS[scene.template.format];
  const ratio = displayWidth / canvas.width;
  const photoSize: Size | null =
    photo === null ? null : { width: photo.width(), height: photo.height() };

  const liveFraming = useSharedValue(framing);
  // Undo, redo or a new photo replace the framing from outside.
  useEffect(() => {
    liveFraming.set(framing);
  }, [framing, liveFraming]);

  const photoRect = useDerivedValue(() =>
    photoSize === null
      ? { x: 0, y: 0, width: canvas.width, height: canvas.height }
      : framePhoto(photoSize, canvas, liveFraming.get()),
  );

  // Pan and pinch run together; the framing is committed once both have ended.
  const panning = useSharedValue(false);
  const pinching = useSharedValue(false);
  const pan = Gesture.Pan()
    .enabled(photoSize !== null)
    // Android follows the first finger by default; iOS and this follow the fingers' centroid.
    .averageTouches(true)
    .onStart(() => {
      panning.set(true);
    })
    .onChange((event) => {
      if (photoSize !== null) {
        liveFraming.set(
          panFraming(
            photoSize,
            canvas,
            liveFraming.get(),
            event.changeX / ratio,
            event.changeY / ratio,
          ),
        );
      }
    })
    .onEnd(() => {
      panning.set(false);
      if (!pinching.get()) {
        scheduleOnRN(onFramingChange, liveFraming.get());
      }
    });
  const pinch = Gesture.Pinch()
    .enabled(photoSize !== null)
    .onStart(() => {
      pinching.set(true);
    })
    .onChange((event) => {
      // The first event of some devices carries no scale yet.
      if (photoSize !== null && event.scaleChange > 0) {
        liveFraming.set(
          zoomFraming(photoSize, canvas, liveFraming.get(), event.scaleChange, {
            x: event.focalX / ratio,
            y: event.focalY / ratio,
          }),
        );
      }
    })
    .onEnd(() => {
      pinching.set(false);
      if (!panning.get()) {
        scheduleOnRN(onFramingChange, liveFraming.get());
      }
    });

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
      <Canvas style={{ width: displayWidth, height: canvas.height * ratio }}>
        <Group transform={[{ scale: ratio }]}>
          <TemplateScene
            {...scene}
            background={
              photo === null
                ? { kind: 'placeholder' }
                : { kind: 'photo', image: photo, rect: photoRect }
            }
          />
        </Group>
      </Canvas>
    </GestureDetector>
  );
}
