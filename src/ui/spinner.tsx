import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme/colors';

/**
 * The app's loading indicator, the same on every phone (ADR 013): eight spokes, fading from the
 * first, turning in steps, as iOS draws its own. React Native's `ActivityIndicator` is each
 * system's, and on Android creating the first one held the UI thread 65 ms (ADR 014).
 */

/** How many spokes, and how long a turn takes. */
const SPOKES = 8;
const TURN_MS = 800;

export function Spinner({
  // As big as the owner asked (2026-11-14): at 20 it was too small.
  size = 28,
  color = colors.secondaryLabel,
  accessibilityLabel,
  style,
}: {
  readonly size?: number;
  readonly color?: string;
  readonly accessibilityLabel?: string;
  /** Where it goes: it is centered in it. */
  readonly style?: ViewStyle;
}) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.set(
      withRepeat(withTiming(1, { duration: TURN_MS, easing: Easing.steps(SPOKES, false) }), -1),
    );
    return () => cancelAnimation(turn);
  }, [turn]);
  const turning = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.get() * 360}deg` }],
  }));
  const spokeWidth = Math.max(1.5, size * 0.09);
  const spokeLength = size * 0.28;
  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={[{ alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Animated.View style={[{ width: size, height: size }, turning]}>
        {Array.from({ length: SPOKES }, (_, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: (size - spokeWidth) / 2,
              top: 0,
              width: spokeWidth,
              height: size,
              alignItems: 'center',
              transform: [{ rotate: `${(-i * 360) / SPOKES}deg` }],
            }}
          >
            <View
              style={{
                width: spokeWidth,
                height: spokeLength,
                borderRadius: spokeWidth / 2,
                backgroundColor: color,
                // The leading spoke the darkest, those behind it lighter, as the turn leaves them.
                opacity: 1 - (0.75 * i) / SPOKES,
              }}
            />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
