import { BlurView } from 'expo-blur';
import { type ComponentRef, type ReactNode, type RefObject, useEffect } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { tabsWidth } from '@/ui/tabs-layout';
import { Text } from '@/ui/text';

/**
 * The bar on top of the screens with tabs: part of the screen, not the native header. On iOS a
 * SwiftUI control in the header jumped as a screen came in, for it learns its height after it is
 * drawn, and in a box of a fixed size it was cut off; going back, it also showed twice. Here it
 * moves with its screen, and lists scroll under its glass.
 */

/** Height of the bar and of the round buttons beside its tabs, which line up with them. */
export const TOP_BAR_HEIGHT = 46;
/** Room over the bar, under the status bar, and under it, over what a list starts with. */
const ABOVE_BAR = 4;
const BELOW_BAR = 4;
/** How far inside the bar the chosen tab's capsule sits. */
const CAPSULE_INSET = 4;
const TAB_SPRING = {
  damping: 22,
  stiffness: 280,
  mass: 0.7,
  reduceMotion: ReduceMotion.System,
} as const;
/** The tabs' glass: how much it blurs (1 to 100), its tint, and its edge. */
const GLASS_BLUR = 40;
const GLASS_TINT = 'linear-gradient(180deg, rgba(80, 80, 86, 0.43) 0%, rgba(30, 30, 34, 0.5) 100%)';
const GLASS_EDGE = 'inset 0 0 0 1px rgba(255, 255, 255, 0.18)';
/** What a list passing under the bar fades into, so that the status bar stays readable. */
const TOP_FADE = 'linear-gradient(to bottom, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0))';

/** How far down a list under the bar starts, in points. */
export function useTopBarRoom(): number {
  const insets = useSafeAreaInsets();
  return insets.top + ABOVE_BAR + TOP_BAR_HEIGHT + BELOW_BAR;
}

/** Where something beside the bar's tabs starts, from the top of the screen. */
export function useTopBarTop(): number {
  return useSafeAreaInsets().top + ABOVE_BAR;
}

/** The bar: its tabs in the middle of the screen, and what goes beside them. */
export function TopBar({
  left,
  children,
}: {
  readonly left?: ReactNode;
  readonly children: ReactNode;
}) {
  const room = useTopBarRoom();
  const top = useTopBarTop();
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: room }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: room,
          experimental_backgroundImage: TOP_FADE,
        }}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top,
          left: 0,
          right: 0,
          height: TOP_BAR_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
        {left === undefined ? null : <View style={{ position: 'absolute', left: 8 }}>{left}</View>}
      </View>
    </View>
  );
}

/** What a list behind the tabs is, for Android to blur it (iOS blurs whatever is behind). */
export type BlurTarget = RefObject<ComponentRef<typeof View> | null>;

/**
 * The glass the tabs lie on, ours and not the system's (only some iPhones have Liquid Glass): what
 * is behind, blurred, under a translucent grey lit from above, with an edge that catches the light.
 * Under Android 12 there is no blur, only the translucent grey.
 */
function TabsGround({
  width,
  blurTarget,
  children,
}: {
  readonly width: number;
  readonly blurTarget: BlurTarget;
  readonly children: ReactNode;
}) {
  return (
    <View
      style={{
        width,
        height: TOP_BAR_HEIGHT,
        borderRadius: TOP_BAR_HEIGHT / 2,
        overflow: 'hidden',
      }}
    >
      <BlurView
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
        tint="dark"
        intensity={GLASS_BLUR}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFill,
          borderRadius: TOP_BAR_HEIGHT / 2,
          experimental_backgroundImage: GLASS_TINT,
          boxShadow: GLASS_EDGE,
        }}
      />
      {children}
    </View>
  );
}

/** Tabs on the glass, the chosen one in a darker capsule that slides to it. */
export function GlassTabs({
  values,
  selectedIndex,
  onChange,
  width: wanted,
  blurTarget,
}: {
  readonly values: readonly string[];
  readonly selectedIndex: number;
  readonly onChange: (index: number) => void;
  readonly width: number;
  /** What the glass blurs: the screen's content, in a `BlurTargetView` beside the bar. */
  readonly blurTarget: BlurTarget;
}) {
  const width = tabsWidth(wanted, useWindowDimensions().width);
  const tabWidth = (width - 2 * CAPSULE_INSET) / values.length;
  const position = useSharedValue(selectedIndex * tabWidth);
  useEffect(() => {
    position.set(withSpring(selectedIndex * tabWidth, TAB_SPRING));
  }, [position, selectedIndex, tabWidth]);
  const capsule = useAnimatedStyle(() => ({ transform: [{ translateX: position.get() }] }));
  return (
    <TabsGround width={width} blurTarget={blurTarget}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: CAPSULE_INSET,
            bottom: CAPSULE_INSET,
            left: CAPSULE_INSET,
            width: tabWidth,
            borderRadius: (TOP_BAR_HEIGHT - 2 * CAPSULE_INSET) / 2,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
          },
          capsule,
        ]}
      />
      <View
        accessibilityRole="tablist"
        style={{ flex: 1, flexDirection: 'row', paddingHorizontal: CAPSULE_INSET }}
      >
        {values.map((value, index) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: index === selectedIndex }}
            onPress={() => onChange(index)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              maxFontSizeMultiplier={1.2}
              style={{ color: colors.label, fontSize: 17, fontWeight: '500' }}
            >
              {value}
            </Text>
          </Pressable>
        ))}
      </View>
    </TabsGround>
  );
}
