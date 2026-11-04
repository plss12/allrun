import { Canvas, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';

import type { SportIconId } from '@/core/activity-block';
import { SPORT_ICON_PATHS, SPORT_ICON_SIZE } from '@/editor/icons/sport-icons.generated';
import { shiftToCenter } from '@/ui/centering';

/** Icon of a sport, of hiking, or of all sports together (the filter). */
export type SportIconName = SportIconId | 'all';

/** A sport's path and how far it moves to be in the middle of its box. */
interface Glyph {
  readonly path: SkPath;
  readonly shift: { readonly x: number; readonly y: number };
}

/** Each sport's glyph, parsed and measured once per session. */
const glyphs = new Map<SportIconName, Glyph>();

function glyphOf(icon: SportIconName): Glyph {
  const cached = glyphs.get(icon);
  if (cached !== undefined) {
    return cached;
  }
  const path = Skia.Path.MakeFromSVGString(SPORT_ICON_PATHS[icon]);
  if (path === null) {
    throw new Error(`Invalid SVG path of the sport icon "${icon}"`);
  }
  const glyph = { path, shift: shiftToCenter(path.computeTightBounds(), SPORT_ICON_SIZE) };
  glyphs.set(icon, glyph);
  return glyph;
}

/**
 * A sport's icon on screen, drawn as a vector with Skia from the same Material Symbols paths the
 * widgets draw into the images, so a sport looks the same everywhere. In the middle of its box by
 * its own shape, as the interface's icons, so it is centered in a round button. Unlike a PNG, which
 * React Native loads and decodes asynchronously (an empty space for a moment, longer in Expo Go,
 * where images come from Metro), it is drawn on the first frame. Decorative: the text or the button
 * next to it says the sport.
 */
export function SportGlyph({
  icon,
  size,
  color,
}: {
  readonly icon: SportIconName;
  readonly size: number;
  /** A plain color string: Skia doesn't take the platform's semantic colors. */
  readonly color: string;
}) {
  const { path, shift } = glyphOf(icon);
  return (
    <Canvas
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no"
      style={{ width: size, height: size }}
    >
      <Group
        transform={[
          { scale: size / SPORT_ICON_SIZE },
          { translateX: shift.x },
          { translateY: shift.y },
        ]}
      >
        <Path path={path} color={color} />
      </Group>
    </Canvas>
  );
}
