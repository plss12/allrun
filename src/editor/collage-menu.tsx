import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { type CollageCell, collageCells } from '@/core/collage';
import type { CollageLayout } from '@/core/template';
import { floatingSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';

import { TOP_BAR_GAP } from './editor-top-bar';
import { ROUND_BUTTON_SIZE } from './round-button';

/**
 * The panel fits the buttons around it, so the corner stays even: as wide as the two beside the
 * arrow over it, and as tall as the three of the column next to it.
 */
const PANEL = {
  width: 2 * ROUND_BUTTON_SIZE + TOP_BAR_GAP,
  height: 3 * ROUND_BUTTON_SIZE + 2 * TOP_BAR_GAP,
  padding: 6,
  gap: 6,
} as const;
const TILE = {
  width: (PANEL.width - 2 * PANEL.padding - PANEL.gap) / 2,
  height: (PANEL.height - 2 * PANEL.padding - 2 * PANEL.gap) / 3,
} as const;
/** Every layout's drawing, the same size: only its inner lines change. */
const SHAPE = { width: 18, height: 28, line: 1.5, radius: 4 } as const;
const UNCHOSEN_TILE = 'rgba(255, 255, 255, 0.1)';
const UNCHOSEN_INK = 'rgba(255, 255, 255, 0.75)';
const CHOSEN_TILE = '#FFFFFF';

const ONE_PHOTO: readonly CollageCell[] = [{ x: 0, y: 0, width: 1, height: 1 }];

/** The ways to lay the photos out, as the panel shows them, by their number of photos. */
const OPTIONS: readonly (CollageLayout | null)[] = [null, 'two', 'three', 'four', 'six', 'oneTwo'];

/** The lines between cells: each cell draws the one on its top and on its left, if inside. */
function InnerLines({
  cells,
  color,
}: {
  readonly cells: readonly CollageCell[];
  readonly color: string;
}) {
  return cells.flatMap((cell, index) => [
    cell.y > 0 ? (
      <View
        key={`top-${index}`}
        style={{
          position: 'absolute',
          left: cell.x * SHAPE.width,
          top: cell.y * SHAPE.height - SHAPE.line / 2,
          width: cell.width * SHAPE.width,
          height: SHAPE.line,
          backgroundColor: color,
        }}
      />
    ) : null,
    cell.x > 0 ? (
      <View
        key={`left-${index}`}
        style={{
          position: 'absolute',
          left: cell.x * SHAPE.width - SHAPE.line / 2,
          top: cell.y * SHAPE.height,
          width: SHAPE.line,
          height: cell.height * SHAPE.height,
          backgroundColor: color,
        }}
      />
    ) : null,
  ]);
}

/** One way to lay the photos out: its outline and the lines between its cells. */
function LayoutTile({
  cells,
  label,
  chosen,
  onPress,
}: {
  readonly cells: readonly CollageCell[];
  readonly label: string;
  readonly chosen: boolean;
  readonly onPress: () => void;
}) {
  const ink = chosen ? colors.tint : UNCHOSEN_INK;
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityState={{ selected: chosen }}
      onPress={onPress}
      style={({ pressed }) => ({
        ...TILE,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderCurve: 'continuous',
        backgroundColor: chosen ? CHOSEN_TILE : UNCHOSEN_TILE,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ width: SHAPE.width, height: SHAPE.height }}>
        <InnerLines cells={cells} color={ink} />
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderWidth: SHAPE.line,
            borderRadius: SHAPE.radius,
            borderColor: ink,
          }}
        />
      </View>
    </Pressable>
  );
}

/**
 * The ways to lay the photos out, in a floating panel opened from the editor's Collages button: one
 * photo and each collage, two to a row, drawn in outline, the chosen one lit.
 */
export function CollageMenu({
  layout: current,
  onPick,
}: {
  /** The collage's layout; `null` for one photo. */
  readonly layout: CollageLayout | null;
  readonly onPick: (layout: CollageLayout | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="menu"
      accessibilityLabel={t('editor.collages')}
      style={{
        ...floatingSurface(18),
        width: PANEL.width,
        height: PANEL.height,
        padding: PANEL.padding,
        gap: PANEL.gap,
        flexDirection: 'row',
        flexWrap: 'wrap',
      }}
    >
      {OPTIONS.map((layout) => (
        <LayoutTile
          key={layout ?? 'one'}
          cells={layout === null ? ONE_PHOTO : collageCells(layout)}
          label={t(`editor.collageLayouts.${layout ?? 'one'}`)}
          chosen={current === layout}
          onPress={() => onPick(layout)}
        />
      ))}
    </View>
  );
}
