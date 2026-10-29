import { Canvas, type SkImage } from '@shopify/react-native-skia';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Loupe, loupePlacement, pixelColor } from './eyedropper-snapshot';

/**
 * The eyedropper of the color menu (ADR 009): a loupe over one snapshot of the design, taken when
 * it opens, that a finger moves from anywhere on the canvas; its ring shows the color of the pixel
 * at its center, which is chosen when the finger lifts.
 */

function clamp(value: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(0, value));
}

/**
 * The loupe over the canvas, as large as it is on screen (`displayWidth` wide) and over it: the
 * finger moves it by as much as it moves, from wherever it touches, so it never covers what it
 * looks at. `onPick` gets the color under its center when the finger lifts, or `null` where the
 * design is transparent.
 */
export function Eyedropper({
  image,
  displayWidth,
  onPick,
}: {
  /** The snapshot of the design (see `snapshotDesign`), at the canvas's size. */
  readonly image: SkImage;
  readonly displayWidth: number;
  readonly onPick: (hex: string | null) => void;
}) {
  const { t } = useTranslation();
  const width = image.width();
  const height = image.height();
  const ratio = displayWidth / width;
  const displayHeight = height * ratio;
  // The pixel under the loupe's center, in the snapshot; it starts in the middle.
  const point = useSharedValue({ x: Math.floor(width / 2), y: Math.floor(height / 2) });

  const pick = (x: number, y: number) => {
    onPick(pixelColor(image, x, y));
  };
  const pan = usePanGesture({
    minDistance: 0,
    onUpdate: (event) => {
      const { x, y } = point.get();
      point.set({
        x: clamp(x + event.changeX / ratio, width - 1),
        y: clamp(y + event.changeY / ratio, height - 1),
      });
    },
    onDeactivate: () => {
      const { x, y } = point.get();
      scheduleOnRN(pick, Math.floor(x), Math.floor(y));
    },
  });

  const placement = useDerivedValue(() => loupePlacement(point.get().x, point.get().y, ratio));
  const at = useDerivedValue(() => placement.get().at);
  const lens = useDerivedValue(() => placement.get().lens);
  const fill = useDerivedValue(() => placement.get().fill);

  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityLabel={t('colorMenu.eyedropper')}
        accessibilityHint={t('colorMenu.eyedropperHint')}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: displayWidth,
          height: displayHeight,
        }}
      >
        <Canvas style={{ width: displayWidth, height: displayHeight }}>
          <Loupe image={image} ratio={ratio} at={at} lens={lens} fill={fill} />
        </Canvas>
      </View>
    </GestureDetector>
  );
}
