import { Canvas, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';

import type { SportIconId } from '@/core/activity-block';
import { SPORT_ICON_PATHS, SPORT_ICON_SIZE } from '@/editor/icons/sport-icons.generated';

/** Icon of a sport, of hiking, or of all sports together (the filter). */
export type SportIconName = SportIconId | 'all';

/** Each sport's path, parsed once per session. */
const paths = new Map<SportIconName, SkPath>();

function pathOf(icon: SportIconName): SkPath {
  const cached = paths.get(icon);
  if (cached !== undefined) {
    return cached;
  }
  const path = Skia.Path.MakeFromSVGString(SPORT_ICON_PATHS[icon]);
  if (path === null) {
    throw new Error(`Invalid SVG path of the sport icon "${icon}"`);
  }
  paths.set(icon, path);
  return path;
}

/**
 * A sport's icon on screen, drawn as a vector with Skia from the same Material Symbols paths the
 * widgets draw into the images, so a sport looks the same everywhere (SF Symbols can't go into an
 * exported image, so the interface doesn't use them for sports either). Unlike a PNG, which React
 * Native loads and decodes asynchronously (an empty space for a moment, longer in Expo Go, where
 * images come from Metro), it is drawn on the first frame, like the system's symbols. Decorative:
 * the text or the button next to it says the sport.
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
  return (
    <Canvas
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no"
      style={{ width: size, height: size }}
    >
      <Group transform={[{ scale: size / SPORT_ICON_SIZE }, { translateY: SPORT_ICON_SIZE }]}>
        <Path path={pathOf(icon)} color={color} />
      </Group>
    </Canvas>
  );
}
