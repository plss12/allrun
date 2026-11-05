import { Canvas, LinearGradient, RoundedRect, vec } from '@shopify/react-native-skia';
import type { ReactNode } from 'react';

import { CARD_BORDER, CARD_GRADIENT_COLORS } from '@/theme/card-surface';

/**
 * The cards' surface lit from above, drawn once with Skia on a canvas of its own, as the first child
 * of a card with `cardSurface`, which already has its flat color and edge. A view's own gradient
 * costs on every frame on Android, because the whole window is drawn again while a list scrolls: on
 * a Samsung M32, half of the frames of the home screen came out late because of it. A canvas is
 * drawn once, and moving it is moving a texture.
 *
 * Under the card's edge: `width` and `height` are the card's, edge included.
 */
export function CardGradient({
  width,
  height,
  radius,
  children,
}: {
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  /** What the card draws over it with Skia: on this same canvas, not on one more. */
  readonly children?: ReactNode;
}) {
  const innerWidth = width - 2 * CARD_BORDER;
  const innerHeight = height - 2 * CARD_BORDER;
  return (
    <Canvas
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no"
      style={{ position: 'absolute', left: 0, top: 0, width: innerWidth, height: innerHeight }}
    >
      <RoundedRect x={0} y={0} width={innerWidth} height={innerHeight} r={radius - CARD_BORDER}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, innerHeight)}
          colors={[...CARD_GRADIENT_COLORS]}
        />
      </RoundedRect>
      {children}
    </Canvas>
  );
}
