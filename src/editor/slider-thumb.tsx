import { BlurMask, Canvas, Circle } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { FLOATING_INK } from './round-button';

/**
 * The thumb of a slider, on a canvas of its own over the track: only this little canvas is drawn
 * again as the finger moves. An animated view costs far more: on Android, Reanimated commits the
 * tree of the screen on every frame, 22 ms a frame on a Samsung M32 for moving a dot (ADR 014).
 *
 * `x` and `y` are its center, in the canvas; `width` and `height`, the canvas, as big as the thumb's
 * whole path with room for its soft shadow. Time O(1) per frame.
 */
export function SliderThumb({
  width,
  height,
  size,
  x,
  y,
}: {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
}) {
  const shadowY = useDerivedValue(() => y.get() + 1);
  return (
    <Canvas
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no"
      style={{ position: 'absolute', left: 0, top: 0, width, height }}
    >
      <Circle cx={x} cy={shadowY} r={size / 2} color="rgba(0, 0, 0, 0.4)">
        <BlurMask blur={2} style="normal" />
      </Circle>
      <Circle cx={x} cy={y} r={size / 2} color={FLOATING_INK} />
    </Canvas>
  );
}
