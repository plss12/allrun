import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';

import type { SportFamily } from '@/core/sports';
import { floatingSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';
import { AppIcon } from '@/ui/app-icon';
import { SportGlyph } from '@/ui/sport-glyph';
import { Text } from '@/ui/text';
import { useTopBarRoom } from '@/ui/top-bar';

/** What the filter shows: one family, or every activity. */
export type SportFilter = SportFamily | 'all';

const ROW_HEIGHT = 44;
const ICON_SIZE = 22;
/** Room between the panel and the header's right edge, and under the header. */
const EDGE = 12;
const BELOW_HEADER = 4;

/**
 * The home's filter by sport, dropping from the header's button: our own panel rather than the
 * native menu, whose items can't show the sports' icons (react-native-screens sets an item's image
 * once it has loaded, after iOS has built the menu, so it never shows). Each row carries its
 * sport's icon, drawn with Skia as everywhere else, and the chosen one a check. A tap outside
 * closes it.
 */
export function SportFilterMenu({
  visible,
  families,
  chosen,
  onChoose,
  onClose,
}: {
  readonly visible: boolean;
  /** The families the user has, in their order. */
  readonly families: readonly SportFamily[];
  readonly chosen: SportFilter;
  readonly onChoose: (filter: SportFilter) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const barRoom = useTopBarRoom();
  const options: readonly SportFilter[] = ['all', ...families];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('editor.close')}
        onPress={onClose}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View
        accessibilityRole="menu"
        accessibilityLabel={t('home.filter')}
        style={{
          ...floatingSurface(18),
          position: 'absolute',
          top: barRoom + BELOW_HEADER,
          right: EDGE,
          minWidth: 220,
          padding: 6,
          boxShadow: '0 8px 22px rgba(0, 0, 0, 0.5)',
        }}
      >
        {options.map((option) => {
          const selected = option === chosen;
          return (
            <Pressable
              key={option}
              accessibilityRole="menuitem"
              accessibilityState={{ selected }}
              onPress={() => {
                onChoose(option);
                onClose();
              }}
              style={({ pressed }) => ({
                height: ROW_HEIGHT,
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderRadius: 12,
                borderCurve: 'continuous',
                backgroundColor: pressed ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              })}
            >
              <SportGlyph icon={option} size={ICON_SIZE} color={colors.label} />
              <Text numberOfLines={1} style={{ flex: 1, color: colors.label, fontSize: 17 }}>
                {option === 'all' ? t('summary.allSports') : t(`families.${option}`)}
              </Text>
              <View style={{ width: 18, alignItems: 'center' }}>
                {selected ? <AppIcon name="check" size={18} color={colors.label} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}
