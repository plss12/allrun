import { UI_ICON_CHARACTERS } from '@/ui/icons/icon-font.generated';
import type { UI_ICON_PATHS } from '@/ui/icons/ui-icons.generated';
import { INTERFACE_FACES, Text } from '@/ui/text';

export type UiIconName = keyof typeof UI_ICON_PATHS;

/**
 * A character of the icons' font, in a box of `size` that its line fills exactly, so it is in the
 * middle of whatever centers the box. A text and not a Skia canvas: on Android each canvas is a
 * texture of its own, to create and to compose on every frame, and a screen has dozens of icons (ADR
 * 014). Decorative: the button around it says what it does.
 */
export function IconCharacter({
  character,
  size,
  color,
}: {
  readonly character: string;
  readonly size: number;
  readonly color: string;
}) {
  return (
    <Text
      accessible={false}
      importantForAccessibility="no"
      allowFontScaling={false}
      style={{
        width: size,
        height: size,
        color,
        fontFamily: INTERFACE_FACES.icons,
        fontSize: size,
        lineHeight: size,
        textAlign: 'center',
      }}
    >
      {character}
    </Text>
  );
}

/**
 * An icon of the interface: the same on every phone, unlike the system's symbols (SF Symbols on iOS,
 * Material on Android), and in the middle of its box by its own shape, so it is centered in whatever
 * centers it (`npm run icons` moves each one there, and a test checks it). `size` is its box: most
 * of Material's icons draw about 5/6 of it.
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
  return <IconCharacter character={UI_ICON_CHARACTERS[name]} size={size} color={color} />;
}
