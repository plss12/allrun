import { Canvas, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';

import { UI_ICON_PATHS, UI_ICON_SIZE, type UiIconName } from '@/ui/icons/ui-icons.generated';

export type { UiIconName };

/** Each icon's path, parsed once per session. */
const paths = new Map<UiIconName, SkPath>();

function pathOf(name: UiIconName): SkPath {
  const cached = paths.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const path = Skia.Path.MakeFromSVGString(UI_ICON_PATHS[name]);
  if (path === null) {
    throw new Error(`Invalid SVG path of the icon "${name}"`);
  }
  paths.set(name, path);
  return path;
}

/**
 * An icon of the interface, drawn as a vector with Skia: the same on every phone, unlike the system's
 * symbols (SF Symbols on iOS, Material on Android), and in the middle of its box by its own shape,
 * so it is centered in whatever centers it (`npm run icons` moves each one there, and a test checks
 * it). `size` is its box: most of Material's icons draw about 5/6 of it. Decorative: the button
 * around it says what it does.
 */
export function AppIcon({
  name,
  size,
  color,
}: {
  readonly name: UiIconName;
  readonly size: number;
  readonly color: string;
}) {
  return (
    <Canvas
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no"
      style={{ width: size, height: size }}
    >
      <Group transform={[{ scale: size / UI_ICON_SIZE }]}>
        <Path path={pathOf(name)} color={color} />
      </Group>
    </Canvas>
  );
}
