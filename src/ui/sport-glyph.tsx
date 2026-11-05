import type { SportIconId } from '@/core/activity-block';
import { IconCharacter } from '@/ui/app-icon';
import { SPORT_ICON_CHARACTERS } from '@/ui/icons/icon-font.generated';

/** Icon of a sport, of hiking, or of all sports together (the filter). */
export type SportIconName = SportIconId | 'all';

/**
 * A sport's icon on screen, from the same Material Symbols paths the widgets draw into the images
 * (the icons' font is made from them), so a sport looks the same everywhere. In the middle of its
 * box by its own shape, as the interface's icons, so it is centered in a round button. Unlike a PNG,
 * which React Native loads and decodes asynchronously, it is there on the first frame. Decorative:
 * the text or the button next to it says the sport.
 */
export function SportGlyph({
  icon,
  size,
  color,
}: {
  readonly icon: SportIconName;
  readonly size: number;
  readonly color: string;
}) {
  return <IconCharacter character={SPORT_ICON_CHARACTERS[icon]} size={size} color={color} />;
}
