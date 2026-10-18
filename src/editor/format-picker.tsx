import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { type CanvasFormat, CANVAS_FORMATS } from '@/core/template';
import { colors } from '@/theme/colors';

import { ACTION_TILE_HEIGHT } from './action-tile';

/** Formats from tallest to widest. */
const FORMATS: readonly CanvasFormat[] = ['story', 'tall', 'portrait', 'square', 'landscape'];
/** Longest side of the shape drawn on each format button. */
const SHAPE = 28;

/** Size of a format's shape on its button: its proportions, with the longer side fixed. */
function formatShape(format: CanvasFormat): { width: number; height: number } {
  const { width, height } = CANVAS_FORMATS[format];
  return width >= height
    ? { width: SHAPE, height: (SHAPE * height) / width }
    : { width: (SHAPE * width) / height, height: SHAPE };
}

/** The canvas formats in one row, each button showing its shape and proportions. */
export function FormatPicker({
  format: current,
  onPick,
}: {
  readonly format: CanvasFormat;
  readonly onPick: (format: CanvasFormat) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={{ flexDirection: 'row', gap: 6 }}
      accessibilityRole="tablist"
      accessibilityLabel={t('editor.format')}
    >
      {FORMATS.map((format) => {
        const chosen = format === current;
        const ink = chosen ? colors.onTint : colors.label;
        return (
          <Pressable
            key={format}
            accessibilityRole="tab"
            accessibilityLabel={t(`formats.${format}`)}
            accessibilityState={{ selected: chosen }}
            hitSlop={4}
            onPress={() => onPick(format)}
            style={({ pressed }) => ({
              flex: 1,
              height: ACTION_TILE_HEIGHT,
              borderRadius: 14,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: chosen ? colors.tint : colors.secondarySystemBackground,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ height: SHAPE, alignItems: 'center', justifyContent: 'center' }}>
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
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.3}
              style={{ color: ink, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}
            >
              {t(`formatRatios.${format}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
