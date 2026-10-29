import { Canvas, LinearGradient, Path, Rect, Skia, vec } from '@shopify/react-native-skia';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  BRAND_SWATCHES,
  COLOR_GRID,
  GRID_COLUMNS,
  GRID_SHADES,
  type GridColor,
  MIN_OPACITY,
  withOpacity,
} from '@/core/color-menu';
import { useColorFavorites } from '@/data/color-favorites';
import { colors } from '@/theme/colors';

import { FLOATING_INK } from './round-button';

/** A swatch of the favorites' row, and the room between them. */
const SWATCH = 40;
const SWATCH_GAP = 8;

/** A swatch besides the colors: the background's own color (auto) or none (transparent). */
export interface SpecialSwatch {
  readonly key: string;
  readonly label: string;
  /** What it shows: a color, or `null` for the transparency checkerboard. */
  readonly fill: string | null;
  readonly selected: boolean;
  readonly onPress: () => void;
}

/** The opacity bar's value and what moving it does. */
export interface OpacityControl {
  readonly value: number;
  /** Set on every frame while the bar is dragged, for the canvas to draw it live. */
  readonly live?: SharedValue<number>;
  /** Called when the bar starts being dragged. */
  readonly onStart?: () => void;
  /** Called with the opacity chosen, once, when the bar is let go. */
  readonly onEnd: (opacity: number) => void;
  /** Dimmed and still, when it doesn't apply (no background). */
  readonly disabled?: boolean;
  /** The color the bar fades, when it isn't one of the menu's (the photo's own, for auto). */
  readonly color?: string;
}

interface ColorMenuProps {
  /** The color chosen (`#RRGGBB`), or `null` when it has none of its own (auto, transparent). */
  readonly color: string | null;
  readonly onColor: (hex: string) => void;
  readonly opacity: OpacityControl;
  /** Swatches before the brand's, such as the background's auto and transparent. */
  readonly specials?: readonly SpecialSwatch[];
  readonly onEyedropper: () => void;
  /** Rows under the favorites, such as a text's backdrop. */
  readonly children?: ReactNode;
}

/**
 * The color menu (ADR 009), for a widget or the design's background: the grid of colors (no
 * spectrum, no sliders for the color itself), the opacity bar, and a row with the eyedropper,
 * any special swatches, the brand's colors, the user's favorites and "+" to keep the color
 * chosen among them (a long press on one removes it). Every choice is one undo step.
 */
export function ColorMenu({
  color,
  onColor,
  opacity,
  specials = [],
  onEyedropper,
  children,
}: ColorMenuProps) {
  const { t } = useTranslation();
  const { favorites, add, remove } = useColorFavorites();
  const chosen = color?.toUpperCase() ?? null;
  return (
    <View style={{ gap: 12 }}>
      <ColorGrid chosen={chosen} onColor={onColor} />
      <OpacityBar control={opacity} color={opacity.color ?? chosen ?? FLOATING_INK} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: SWATCH_GAP, alignItems: 'center' }}
      >
        <RoundIcon
          icon={{ ios: 'eyedropper', android: 'colorize' }}
          label={t('colorMenu.eyedropper')}
          onPress={onEyedropper}
        />
        {specials.map((special) => (
          <Swatch
            key={special.key}
            fill={special.fill}
            label={special.label}
            selected={special.selected}
            onPress={special.onPress}
          />
        ))}
        {BRAND_SWATCHES.map((hex, index) => (
          <Swatch
            key={hex}
            fill={hex}
            label={t(`colorMenu.brand.${BRAND_NAMES[index]}`)}
            selected={chosen === hex}
            onPress={() => onColor(hex)}
          />
        ))}
        {favorites.map((hex, index) => (
          <Swatch
            key={hex}
            fill={hex}
            label={t('colorMenu.favorite', { n: index + 1 })}
            hint={t('colorMenu.removeHint')}
            selected={chosen === hex}
            onPress={() => onColor(hex)}
            onLongPress={() =>
              Alert.alert(t('colorMenu.removeTitle'), undefined, [
                { text: t('editor.cancel'), style: 'cancel' },
                { text: t('colorMenu.remove'), style: 'destructive', onPress: () => remove(hex) },
              ])
            }
          />
        ))}
        <RoundIcon
          icon={{ ios: 'plus', android: 'add' }}
          label={t('colorMenu.addFavorite')}
          disabled={
            chosen === null ||
            favorites.includes(chosen) ||
            (BRAND_SWATCHES as readonly string[]).includes(chosen)
          }
          onPress={() => {
            if (chosen !== null) {
              add(chosen);
            }
          }}
        />
      </ScrollView>
      {children}
    </View>
  );
}

/** The brand's colors, in the order of `BRAND_SWATCHES`, by their names. */
const BRAND_NAMES = ['trackRed', 'nightInk', 'chalk'] as const;

/**
 * The grid, as wide as the menu, in square cells without gaps and with rounded outer corners; the
 * color chosen, if it is one of them, ringed.
 */
function ColorGrid({
  chosen,
  onColor,
}: {
  readonly chosen: string | null;
  readonly onColor: (hex: string) => void;
}) {
  const { t } = useTranslation();
  const rows = COLOR_GRID.length;
  /** What a screen reader says of a color: "White", "Gray 3", "Blue, shade 4 of 9". */
  const label = (color: GridColor): string => {
    if (color.kind === 'gray') {
      return color.step === 0
        ? t('colorMenu.white')
        : color.step === GRID_COLUMNS - 1
          ? t('colorMenu.black')
          : t('colorMenu.gray', { step: color.step });
    }
    return t('colorMenu.shade', {
      hue: t(`colorMenu.hues.${color.hue}`),
      shade: color.shade,
      shades: GRID_SHADES,
    });
  };
  return (
    <View
      style={{
        aspectRatio: GRID_COLUMNS / rows,
        borderRadius: 10,
        borderCurve: 'continuous',
        overflow: 'hidden',
      }}
    >
      {COLOR_GRID.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flex: 1, flexDirection: 'row' }}>
          {row.map((cell) => {
            const selected = chosen === cell.hex;
            return (
              <Pressable
                key={cell.hex}
                accessibilityRole="button"
                accessibilityLabel={label(cell)}
                accessibilityState={{ selected }}
                onPress={() => onColor(cell.hex)}
                style={{ flex: 1, backgroundColor: cell.hex }}
              >
                {selected ? (
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: '#FFFFFF',
                      boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.6)',
                    }}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** A swatch of the row: a color, or the checkerboard of none, ringed when chosen. */
function Swatch({
  fill,
  label,
  hint,
  selected,
  onPress,
  onLongPress,
}: {
  readonly fill: string | null;
  readonly label: string;
  readonly hint?: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly onLongPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        width: SWATCH,
        height: SWATCH,
        borderRadius: 10,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: fill ?? undefined,
        borderWidth: selected ? 2.5 : 1,
        borderColor: selected ? '#FFFFFF' : colors.separator,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {fill === null ? <Checker width={SWATCH} height={SWATCH} square={8} /> : null}
    </Pressable>
  );
}

/** A round button of the row with an icon: the eyedropper, "+". */
function RoundIcon({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  readonly icon: SymbolViewProps['name'];
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: SWATCH,
        height: SWATCH,
        borderRadius: SWATCH / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.tertiarySystemBackground,
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      <SymbolView name={icon} size={18} weight="semibold" tintColor={FLOATING_INK} />
    </Pressable>
  );
}

/** The transparency checkerboard, in squares of `square` points. */
function Checker({
  width,
  height,
  square,
}: {
  readonly width: number;
  readonly height: number;
  readonly square: number;
}) {
  const builder = Skia.PathBuilder.Make();
  for (let row = 0; row * square < height; row++) {
    for (let column = row % 2; column * square < width; column += 2) {
      builder.addRect(Skia.XYWHRect(column * square, row * square, square, square));
    }
  }
  const path = builder.detach();
  return (
    <Canvas pointerEvents="none" style={{ position: 'absolute', width, height }}>
      <Rect x={0} y={0} width={width} height={height} color="#D9D9D9" />
      <Path path={path} color="#8E8E93" />
    </Canvas>
  );
}

const BAR_HEIGHT = 32;
const THUMB = 26;

function clampOpacity(value: number): number {
  'worklet';
  return Math.min(1, Math.max(MIN_OPACITY, value));
}

/** Where an opacity sits along the bar: 0 at its left end, the faintest on offer, 1 at the right. */
function barOf(opacity: number): number {
  'worklet';
  return (clampOpacity(opacity) - MIN_OPACITY) / (1 - MIN_OPACITY);
}

/**
 * The opacity, as a bar from the faintest on offer (`MIN_OPACITY`, at its left end) to the color
 * itself, over a checkerboard, with its percentage beside it. The thumb goes where the finger touches and follows it; `live` carries
 * the value meanwhile, and it is chosen once, when the finger lifts.
 */
export function OpacityBar({
  control,
  color,
}: {
  readonly control: OpacityControl;
  readonly color: string;
}) {
  const { t, i18n } = useTranslation();
  const { value, live, onStart, onEnd, disabled = false } = control;
  const shown = new Intl.NumberFormat(i18n.language, { style: 'percent' });
  const [width, setWidth] = useState(0);
  /** The percentage while the bar is dragged; the value's otherwise. */
  const [livePercent, setLivePercent] = useState<number | null>(null);
  const percent = livePercent ?? Math.round(value * 100);
  const position = useSharedValue(value);
  const dragging = useSharedValue(false);
  // Undo or another widget change it from outside; never mid-drag.
  useEffect(() => {
    if (!dragging.get()) {
      position.set(value);
    }
  }, [value, position, dragging]);

  const range = Math.max(1, width - THUMB);
  /** The value chosen and the percentage back to it, in one update. */
  const finish = (opacity: number) => {
    onEnd(opacity);
    setLivePercent(null);
  };
  const moveTo = (x: number) => {
    'worklet';
    const along = Math.min(1, Math.max(0, (x - THUMB / 2) / range));
    const next = MIN_OPACITY + along * (1 - MIN_OPACITY);
    const before = Math.round(position.get() * 100);
    position.set(next);
    live?.set(next);
    if (Math.round(next * 100) !== before) {
      scheduleOnRN(setLivePercent, Math.round(next * 100));
    }
  };
  const pan = usePanGesture({
    enabled: !disabled && width > 0,
    minDistance: 0,
    onActivate: (event) => {
      dragging.set(true);
      live?.set(position.get());
      if (onStart !== undefined) {
        scheduleOnRN(onStart);
      }
      moveTo(event.x);
    },
    onUpdate: (event) => moveTo(event.x),
    onDeactivate: () => {
      dragging.set(false);
      scheduleOnRN(finish, position.get());
    },
  });
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: barOf(position.get()) * range }],
  }));

  const step = (delta: number) => onEnd(clampOpacity(Math.round((value + delta) * 10) / 10));
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <GestureDetector gesture={pan}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('style.opacity')}
          accessibilityState={{ disabled }}
          accessibilityValue={{ text: shown.format(percent / 100) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) =>
            step(event.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)
          }
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={{ flex: 1, height: BAR_HEIGHT, justifyContent: 'center' }}
        >
          <View
            style={{
              height: BAR_HEIGHT,
              borderRadius: BAR_HEIGHT / 2,
              overflow: 'hidden',
            }}
          >
            {width > 0 ? (
              <>
                <Checker width={width} height={BAR_HEIGHT} square={BAR_HEIGHT / 4} />
                <Canvas
                  pointerEvents="none"
                  style={{ position: 'absolute', width, height: BAR_HEIGHT }}
                >
                  <Rect x={0} y={0} width={width} height={BAR_HEIGHT}>
                    <LinearGradient
                      // From the faintest on offer, under the thumb at the left end, to the color.
                      start={vec(THUMB / 2, 0)}
                      end={vec(width - THUMB / 2, 0)}
                      colors={[withOpacity(color, MIN_OPACITY), color]}
                    />
                  </Rect>
                </Canvas>
              </>
            ) : null}
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                width: THUMB,
                height: THUMB,
                borderRadius: THUMB / 2,
                backgroundColor: FLOATING_INK,
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.5)',
              },
              thumbStyle,
            ]}
          />
        </View>
      </GestureDetector>
      <Text
        importantForAccessibility="no"
        maxFontSizeMultiplier={1.3}
        style={{
          width: 52,
          textAlign: 'right',
          color: colors.label,
          fontSize: 15,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
        }}
      >
        {shown.format(percent / 100)}
      </Text>
    </View>
  );
}
