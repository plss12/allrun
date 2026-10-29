import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { DesignBackground } from '@/core/template';
import { colors } from '@/theme/colors';

/** Diameter of a swatch, with room for the ring of the chosen one. */
const SWATCH = 36;
const RING = 3;

/** The backgrounds on offer until R3c's color menu: the photo's color, black, white, none. */
const OPTIONS = [
  { key: 'auto', background: { kind: 'auto' } },
  { key: 'black', background: { kind: 'color', color: '#000000' } },
  { key: 'white', background: { kind: 'color', color: '#FFFFFF' } },
  { key: 'transparent', background: { kind: 'transparent' } },
] as const satisfies readonly { key: string; background: DesignBackground }[];

function sameBackground(a: DesignBackground, b: DesignBackground): boolean {
  return a.kind === b.kind && (a.kind !== 'color' || (b.kind === 'color' && a.color === b.color));
}

/**
 * The background of the design, in a row of swatches under the photo's tools: the photo's own
 * color (drawn as it is now, `dominant`), black, white or none. The chosen one carries a ring.
 */
export function BackgroundPicker({
  background,
  dominant,
  onChange,
}: {
  readonly background: DesignBackground;
  /** The photo's dominant color, shown on the auto swatch; `null` while unknown. */
  readonly dominant: string | null;
  readonly onChange: (background: DesignBackground) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('editor.background')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 }}
    >
      <Text
        importantForAccessibility="no"
        maxFontSizeMultiplier={1.3}
        style={{ flex: 1, color: colors.label, fontSize: 15, fontWeight: '600' }}
      >
        {t('editor.background')}
      </Text>
      {OPTIONS.map(({ key, background: option }) => {
        const chosen = sameBackground(option, background);
        const fill =
          option.kind === 'color' ? option.color : option.kind === 'auto' ? dominant : null;
        return (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityLabel={t(`editor.backgrounds.${key}`)}
            accessibilityState={{ checked: chosen }}
            hitSlop={4}
            onPress={() => onChange(option)}
            style={({ pressed }) => ({
              width: SWATCH + 2 * RING,
              height: SWATCH + 2 * RING,
              borderRadius: SWATCH / 2 + RING,
              borderWidth: RING,
              borderColor: chosen ? colors.tint : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                width: SWATCH - 2,
                height: SWATCH - 2,
                borderRadius: SWATCH / 2,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.25)',
                backgroundColor: fill ?? colors.tertiarySystemBackground,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {option.kind === 'transparent' ? (
                <SymbolView
                  name={{ ios: 'circle.slash', android: 'block' }}
                  size={18}
                  tintColor={colors.secondaryLabel}
                />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
