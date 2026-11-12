import { Canvas, RoundedRect } from '@shopify/react-native-skia';
import { BlurView } from 'expo-blur';
import { type ReactNode, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ReduceMotion, useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';
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
const GLASS_WITHOUT_BLUR = 'rgba(14, 14, 16, 0.82)';
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

/**
 * The glass the tabs lie on, ours and not the system's (only some iPhones have Liquid Glass): what
 * is behind, blurred, under a translucent grey lit from above, with an edge that catches the light.
 * On Android, only the grey, darker to keep the tabs readable over a card: its blur copies the whole
 * screen on every frame of a scroll, in a list already short of time on a modest phone.
 */
function TabsGround({ width, children }: { readonly width: number; readonly children: ReactNode }) {
  return (
    <View
      style={{
        width,
        height: TOP_BAR_HEIGHT,
        borderRadius: TOP_BAR_HEIGHT / 2,
        overflow: 'hidden',
        backgroundColor: Platform.OS === 'ios' ? undefined : GLASS_WITHOUT_BLUR,
      }}
    >
      {Platform.OS === 'ios' ? (
        <BlurView tint="dark" intensity={GLASS_BLUR} style={StyleSheet.absoluteFill} />
      ) : null}
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

/**
 * A round button beside the tabs, on the same glass as them, as tall as the bar: the home's logo,
 * which opens the profile, and its filter (the owner's choice).
 */
export function GlassButton({
  label,
  onPress,
  children,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <TabsGround width={TOP_BAR_HEIGHT}>
        <View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          style={{ ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' }}
        >
          {children}
        </View>
      </TabsGround>
    </Pressable>
  );
}

/** The chosen tab's capsule. */
const CAPSULE_COLOR = 'rgba(0, 0, 0, 0.55)';

/**
 * Tabs on the glass, the chosen one in a darker capsule that slides to it. The capsule is drawn
 * with Skia, on a canvas of its own: an animated view makes Reanimated commit the tree of the whole
 * screen on every frame of its spring, and under the Designs or Stickers gallery that took a
 * modest phone's UI thread most of the time the tab took to show (ADR 014).
 */
export function GlassTabs({
  values,
  selectedIndex,
  onChange,
  width: wanted,
}: {
  readonly values: readonly string[];
  readonly selectedIndex: number;
  readonly onChange: (index: number) => void;
  readonly width: number;
}) {
  const width = tabsWidth(wanted, useWindowDimensions().width);
  const tabWidth = (width - 2 * CAPSULE_INSET) / values.length;
  const position = useSharedValue(selectedIndex * tabWidth);
  useEffect(() => {
    position.set(withSpring(selectedIndex * tabWidth, TAB_SPRING));
  }, [position, selectedIndex, tabWidth]);
  const capsuleX = useDerivedValue(() => CAPSULE_INSET + position.get());
  const capsuleHeight = TOP_BAR_HEIGHT - 2 * CAPSULE_INSET;
  return (
    <TabsGround width={width}>
      <Canvas
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no"
        style={{ position: 'absolute', left: 0, top: 0, width, height: TOP_BAR_HEIGHT }}
      >
        <RoundedRect
          x={capsuleX}
          y={CAPSULE_INSET}
          width={tabWidth}
          height={capsuleHeight}
          r={capsuleHeight / 2}
          color={CAPSULE_COLOR}
        />
      </Canvas>
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
              maxFontSizeMultiplier={1.1}
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
