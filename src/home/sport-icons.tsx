import { type ColorValue, Image, type ImageSourcePropType } from 'react-native';

import type { SportIconId } from '@/core/activity-block';

/**
 * The sports' icons on screen: the same Material Symbols the widgets draw into the images (see
 * `scripts/icons`), so a sport looks the same everywhere. SF Symbols can't go into an exported
 * image, so the interface doesn't use them for sports either. Tinted with the system's colors.
 */

/** Icon of a sport, of hiking, or of all sports together (the filter). */
export type SportIconName = SportIconId | 'all';

// Metro needs each image required by a literal path.
const SCREEN: Readonly<Record<SportIconName, ImageSourcePropType>> = {
  run: require('../../assets/images/sports/run.png'),
  ride: require('../../assets/images/sports/ride.png'),
  walk: require('../../assets/images/sports/walk.png'),
  hike: require('../../assets/images/sports/hike.png'),
  swim: require('../../assets/images/sports/swim.png'),
  training: require('../../assets/images/sports/training.png'),
  other: require('../../assets/images/sports/other.png'),
  all: require('../../assets/images/sports/all.png'),
};

/** The icons at a native menu's size, which takes images as they are. */
export const SPORT_MENU_ICONS: Readonly<Record<SportIconName, ImageSourcePropType>> = {
  run: require('../../assets/images/sports/menu/run.png'),
  ride: require('../../assets/images/sports/menu/ride.png'),
  walk: require('../../assets/images/sports/menu/walk.png'),
  hike: require('../../assets/images/sports/menu/hike.png'),
  swim: require('../../assets/images/sports/menu/swim.png'),
  training: require('../../assets/images/sports/menu/training.png'),
  other: require('../../assets/images/sports/menu/other.png'),
  all: require('../../assets/images/sports/menu/all.png'),
};

/** A sport's icon, `size` points square, in `color`. Decorative: the text says the sport. */
export function SportIcon({
  icon,
  size,
  color,
}: {
  readonly icon: SportIconName;
  readonly size: number;
  readonly color: ColorValue;
}) {
  return (
    <Image
      source={SCREEN[icon]}
      accessible={false}
      style={{ width: size, height: size, tintColor: color }}
    />
  );
}
