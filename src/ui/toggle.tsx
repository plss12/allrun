import { useEffect, useState } from 'react';
import { Animated, Pressable } from 'react-native';

import { colors } from '@/theme/colors';

/** The track's size and the knob's, as iOS draws a switch: the one look on both phones. */
const TRACK_WIDTH = 51;
const TRACK_HEIGHT = 31;
const KNOB = 27;
const INSET = (TRACK_HEIGHT - KNOB) / 2;
/** The track while off, the dark grey of iOS's switch in dark mode. */
const OFF_TRACK = '#39393D';

/**
 * An on/off switch, the same on every phone (ADR 013: the platform's own looks different on each),
 * in Track Red when on. Its knob slides on Animated's native driver. A screen reader reads it as a
 * switch with `label`.
 */
export function Toggle({
  value,
  onChange,
  label,
  disabled = false,
}: {
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean;
}) {
  const [position] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.timing(position, {
      toValue: value ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [value, position]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={{
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        borderRadius: TRACK_HEIGHT / 2,
        backgroundColor: value ? colors.tint : OFF_TRACK,
        opacity: disabled ? 0.4 : 1,
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          width: KNOB,
          height: KNOB,
          borderRadius: KNOB / 2,
          backgroundColor: '#FFFFFF',
          transform: [
            {
              translateX: position.interpolate({
                inputRange: [0, 1],
                outputRange: [INSET, TRACK_WIDTH - KNOB - INSET],
              }),
            },
          ],
        }}
      />
    </Pressable>
  );
}
