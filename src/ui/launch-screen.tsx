import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { MarkOnDark, WordmarkOnDark } from '@/editor/brand/brand-art';
import { BRAND_GEOMETRY } from '@/editor/brand/geometry.generated';
import { colors } from '@/theme/colors';

/**
 * The monogram's width, as the native launch screen draws it (`imageWidth` 200 in `app.json`, the
 * monogram 90 % of its image): ours takes over from it without a visible change.
 */
const MARK_WIDTH = 180;
const MARK_HEIGHT = (MARK_WIDTH * BRAND_GEOMETRY.mark.height) / BRAND_GEOMETRY.mark.width;

/** The name's width under the monogram, and the room between them. */
const WORD_WIDTH = 132;
const WORD_GAP = 28;

/**
 * The one fade of the launch screen, the same both ways (the user's decision): its name fades in
 * with it, and the whole screen fades out with it once the app is ready. The out is animated here,
 * not as it unmounts: that way it vanished at once.
 */
const FADE_MS = 400;
const FADE_EASING = Easing.inOut(Easing.quad);
const WORD_FADE = FadeIn.duration(FADE_MS).easing(FADE_EASING).delay(150);

/**
 * The app's own launch screen, over it while it gets ready (see `app/_layout.tsx`): AllRun's
 * monogram where the native launch screen shows it, and its name fading in under it, on the app's
 * own background (black, as the home screen and the dark native launch screen), so nothing changes
 * color when it fades out. Once `leaving`, it fades out, and `onGone` says it can be taken away.
 * Drawn by the app, it is the same in Expo Go, in a development build and in the stores; `onShown`
 * is when it is on screen, to let the native one go. On Android the native one is only black: from
 * Android 12 the system cuts its icon to a circle, which cut the monogram's feet, so this is the
 * first thing seen there.
 */
export function LaunchScreen({
  leaving,
  onShown,
  onGone,
}: {
  readonly leaving: boolean;
  readonly onShown: () => void;
  readonly onGone: () => void;
}) {
  const { t } = useTranslation();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!leaving) {
      return;
    }
    opacity.set(
      withTiming(0, { duration: FADE_MS, easing: FADE_EASING }, (finished) => {
        if (finished === true) {
          scheduleOnRN(onGone);
        }
      }),
    );
  }, [leaving, opacity, onGone]);
  const fading = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      onLayout={onShown}
      // While it fades out, the app under it already takes the touches.
      pointerEvents={leaving ? 'none' : 'auto'}
      accessible={!leaving}
      accessibilityLabel={t('launch.loading')}
      style={[styles.screen, fading]}
    >
      <MarkOnDark width={MARK_WIDTH} />
      {/* Under the monogram, which stays where the native launch screen has it. */}
      <View pointerEvents="none" style={styles.name}>
        <Animated.View entering={WORD_FADE}>
          <WordmarkOnDark width={WORD_WIDTH} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.systemBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: MARK_HEIGHT / 2 + WORD_GAP,
    alignItems: 'center',
  },
});
