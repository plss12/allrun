import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { type CanvasFormat, CANVAS_FORMATS } from '@/core/template';
import { colors } from '@/theme/colors';

import { floatingSurface } from '@/theme/card-surface';

import { FLOATING_INK } from './round-button';

/** Formats from tallest to widest. */
const FORMATS: readonly CanvasFormat[] = ['story', 'tall', 'portrait', 'square', 'landscape'];
/** Longest side of the shape drawn on each format's row. */
const SHAPE = 24;
const ROW_HEIGHT = 44;

/** Size of a format's shape: its proportions, with the longer side fixed. */
function formatShape(format: CanvasFormat): { width: number; height: number } {
  const { width, height } = CANVAS_FORMATS[format];
  return width >= height
    ? { width: SHAPE, height: (SHAPE * height) / width }
    : { width: (SHAPE * width) / height, height: SHAPE };
}

/**
 * The canvas formats in a floating panel, opened from the editor's Ratio button: a row per
 * format with its shape and proportions, the chosen one lit.
 */
export function FormatMenu({
  format: current,
  onPick,
}: {
  readonly format: CanvasFormat;
  readonly onPick: (format: CanvasFormat) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="menu"
      accessibilityLabel={t('editor.format')}
      style={{ ...floatingSurface(18), padding: 6, gap: 2 }}
    >
      {FORMATS.map((format) => {
        const chosen = format === current;
        const ink = chosen ? colors.onTint : FLOATING_INK;
        return (
          <Pressable
            key={format}
            accessibilityRole="menuitem"
            accessibilityLabel={t(`formats.${format}`)}
            accessibilityState={{ selected: chosen }}
            onPress={() => onPick(format)}
            style={({ pressed }) => ({
              height: ROW_HEIGHT,
              minWidth: 104,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderRadius: 12,
              borderCurve: 'continuous',
              backgroundColor: chosen ? colors.tint : 'transparent',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ width: SHAPE, alignItems: 'center' }}>
              <View
                style={{
                  ...formatShape(format),
                  borderWidth: 2,
                  borderRadius: 4,
                  borderColor: ink,
                }}
              />
            </View>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{ color: ink, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}
            >
              {t(`formatRatios.${format}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
