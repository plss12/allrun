import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { MarkOnDark, WordmarkOnDark } from '@/editor/brand/brand-art';
import { BRAND_GEOMETRY } from '@/editor/brand/geometry.generated';
import { colors } from '@/theme/colors';

/**
 * The monogram's width, as the native launch screen draws it (`imageWidth` 200 in `app.json`, the
 * monogram 90 % of its image): ours takes over from it without a visible change.
 */
const MARK_WIDTH = 180;
const MARK_HEIGHT = (MARK_WIDTH * BRAND_GEOMETRY.mark.height) / BRAND_GEOMETRY.mark.width;

/** The name's width under the monogram, the room between them, and how it fades in. */
const WORD_WIDTH = 132;
const WORD_GAP = 28;
const WORD_FADE = FadeIn.duration(400).delay(150);

/** How the launch screen fades out once the app is ready. */
const LAUNCH_FADE = FadeOut.duration(300);

/**
 * The app's own launch screen, over it while it gets ready (see `app/_layout.tsx`): AllRun's
 * monogram where the native launch screen shows it, and its name fading in under it, on the app's
 * own background (black, as the home screen and the dark native launch screen), so nothing changes
 * color when it fades out, as its parent stops showing it. Drawn by the app, it is the same in Expo
 * Go, in a development build and in the stores; `onShown` is when it is on screen, to let the
 * native one go.
 */
export function LaunchScreen({ onShown }: { readonly onShown: () => void }) {
  const { t } = useTranslation();
  return (
    <Animated.View
      exiting={LAUNCH_FADE}
      onLayout={onShown}
      accessible
      accessibilityLabel={t('launch.loading')}
      style={styles.screen}
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
