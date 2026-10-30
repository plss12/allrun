import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ColorValue, Pressable, Text, View } from 'react-native';

import { colors } from '@/theme/colors';

/**
 * Height of the tiles under the canvas: actions and formats alike, so that space looks the same
 * whichever it shows.
 */
export const ACTION_TILE_HEIGHT = 76;

/** Size of a tile's icon, in points. */
const ICON_SIZE = 26;

/**
 * Instagram's camera beside the symbols: as tall as they look (a symbol of 26 pt draws about 22 pt
 * of ink) and with their stroke at that size, so no icon of the row looks heavier.
 */
const GLYPH = { size: 22, stroke: 1.7 } as const;

/**
 * A square-ish button with an icon over a short label, for the row under the canvas. The icon is a
 * symbol, or Instagram's camera (`instagram`), which no symbol set has.
 */
export function ActionTile({
  icon,
  label,
  onPress,
  disabled = false,
  destructive = false,
}: {
  readonly icon: SymbolViewProps['name'] | 'instagram';
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
      {icon === 'instagram' ? (
        // In a symbol's box, so its label lines up with the others'.
        <View
          style={{
            width: ICON_SIZE,
            height: ICON_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <InstagramGlyph size={GLYPH.size} stroke={GLYPH.stroke} color={color} />
        </View>
      ) : (
        <SymbolView name={icon} size={ICON_SIZE} tintColor={color} />
      )}
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

/**
 * Instagram's camera, as its glyph draws it in one color: a rounded square, its lens and the dot
 * of its flash, in proportion to `size`, in lines `stroke` wide. Drawn with views: sharp at any
 * size and there at once.
 */
function InstagramGlyph({
  size,
  stroke,
  color,
}: {
  readonly size: number;
  readonly stroke: number;
  readonly color: ColorValue;
}) {
  const lens = size * 0.46;
  const flash = size * 0.12;
  return (
    <View
      importantForAccessibility="no"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.29,
        borderCurve: 'continuous',
        borderWidth: stroke,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: lens,
          height: lens,
          borderRadius: lens / 2,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          // Its center at three quarters of the width, a quarter from the top, as the glyph's.
          left: size * 0.77 - flash / 2 - stroke,
          top: size * 0.23 - flash / 2 - stroke,
          width: flash,
          height: flash,
          borderRadius: flash / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
