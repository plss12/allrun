import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, Text } from 'react-native';

import { colors } from '@/theme/colors';

/**
 * Height of the tiles under the canvas: actions and formats alike, so that space looks the same
 * whichever it shows.
 */
export const ACTION_TILE_HEIGHT = 76;

/** A square-ish button with an icon over a short label, for the row under the canvas. */
export function ActionTile({
  icon,
  label,
  onPress,
  disabled = false,
  destructive = false,
}: {
  readonly icon: SymbolViewProps['name'];
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
}) {
  const color = destructive ? colors.error : colors.label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        height: ACTION_TILE_HEIGHT,
        paddingHorizontal: 2,
        borderRadius: 14,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: colors.secondarySystemBackground,
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <SymbolView name={icon} size={26} tintColor={color} />
      <Text
        numberOfLines={1}
        // Long words in some languages shrink a little rather than being cut off.
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        importantForAccessibility="no"
        maxFontSizeMultiplier={1.3}
        style={{ color, fontSize: 12, fontWeight: '600' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
