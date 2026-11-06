import { ColorSpace, type ColorSpaceValue } from '@shopify/react-native-skia';
import { Platform } from 'react-native';

/**
 * The color space the editor draws and exports in: the widest the phone's screen shows, as Skia's
 * `Canvas` draws there, so what is drawn off-screen (a gesture's textures, the exported image)
 * looks as the canvas does.
 *
 * - iPhone: Display P3, as the canvas, which Skia draws in P3 on a P3 screen (every iPhone since
 *   the 7; their photos are P3 too). Color is managed there: on an older sRGB screen the canvas is
 *   sRGB, and P3 images still show right on it.
 * - Android: sRGB. Skia (2.14) draws the canvas with no color space on every Android phone, even
 *   one with a P3 screen, and reads a P3 image's colors there as sRGB ones, faded. Wide color on the
 *   Android phones whose screen has it is native work (roadmap, step 6).
 */
export const SCREEN_COLOR_SPACE: ColorSpaceValue =
  Platform.OS === 'ios' ? ColorSpace.DisplayP3 : ColorSpace.SRGB;
