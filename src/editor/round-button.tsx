import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { floatingSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';

export const FLOATING_INK = '#FFFFFF';
/** Diameter of a floating button: Apple's minimum touch target. */
export const ROUND_BUTTON_SIZE = 44;
/**
 * Controls that hide without unmounting: under the new architecture `display: 'none'` drops the
 * native views too, and showing them again reloaded their images (the sport's icon came late).
 * Hidden, they are see-through and let every touch through; shown, only their buttons take
 * touches, and the canvas gets the rest.
 */
export function KeptMounted({
  hidden,
  style,
  children,
}: {
  readonly hidden: boolean;
  readonly style?: ViewStyle;
  readonly children: ReactNode;
}) {
  return (
    <View
      pointerEvents={hidden ? 'none' : 'box-none'}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={hidden}
      style={[style, { opacity: hidden ? 0 : 1 }]}
    >
      {children}
    </View>
  );
}

/** The look of the one action that finishes the image: Track Red. */
const ACCENT_SURFACE: ViewStyle = { backgroundColor: colors.tint };

/**
 * A round button floating over the canvas, with an icon (or `children`, such as a ratio's text).
 */
export function RoundButton({
  icon,
  label,
  onPress,
  disabled = false,
  selected,
  size = ROUND_BUTTON_SIZE,
  children,
}: {
  readonly icon?: SymbolViewProps['name'];
  /** What the button does, for screen readers (the icon says it to the eye). */
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  /** Whether a menu it opens is open; leave it out for plain buttons. */
  readonly selected?: boolean;
  readonly size?: number;
  readonly children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { expanded: selected }) }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        ...floatingSurface(size / 2, selected === true),
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      {icon === undefined ? null : (
        <SymbolView name={icon} size={size * 0.45} weight="semibold" tintColor={FLOATING_INK} />
      )}
      {children}
    </Pressable>
  );
}

/**
 * A wide floating button with an icon and, optionally, a word: the editor's main actions at the
 * bottom. `accent` fills it in Track Red, for the one action that finishes the image.
 */
export function PillButton({
  icon,
  iconSize = 22,
  label,
  showLabel = false,
  onPress,
  disabled = false,
  accent = false,
  height,
  minWidth,
}: {
  readonly icon: SymbolViewProps['name'];
  readonly iconSize?: number;
  readonly label: string;
  /** Whether the word shows next to the icon (it is always read to screen readers). */
  readonly showLabel?: boolean;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly accent?: boolean;
  readonly height: number;
  readonly minWidth?: number;
}) {
  const ink = accent ? colors.onTint : FLOATING_INK;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        ...(accent
          ? { ...ACCENT_SURFACE, borderRadius: height / 2, borderCurve: 'continuous' }
          : floatingSurface(height / 2)),
        height,
        minWidth: minWidth ?? height,
        paddingHorizontal: showLabel ? 20 : 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <SymbolView name={icon} size={iconSize} weight="semibold" tintColor={ink} />
      {showLabel ? (
        <Text
          numberOfLines={1}
          importantForAccessibility="no"
          maxFontSizeMultiplier={1.3}
          style={{ color: ink, fontSize: 17, fontWeight: '700' }}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}
