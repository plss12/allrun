import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { scaleOfSlider, sliderOfScale } from '@/core/layer-transform';
import { layerColor } from '@/core/layer-style';
import type { Layer } from '@/core/template';
import { floatingSurface, roundSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';

import { BRAND_GEOMETRY } from './brand/geometry.generated';
import { TOP_BAR_GAP } from './editor-top-bar';
import { FLOATING_INK, ROUND_BUTTON_SIZE, RoundButton } from './round-button';
import { type StyleTool, widgetTools } from './style-panel';

/** A tool of the column: the size slider, or one whose options open in a panel. */
export type ColumnTool = 'size' | StyleTool;

/** The selected widget's actions, in the "…" menu. */
export interface WidgetActions {
  /** Rewrites a free text, or chooses other words for a verse; absent for other widgets. */
  readonly onEdit?: () => void;
  readonly onDuplicate: () => void;
  readonly onBringToFront: () => void;
  readonly onSendToBack: () => void;
  readonly onRemove: () => void;
  readonly canDuplicate: boolean;
  readonly canBringToFront: boolean;
  readonly canSendToBack: boolean;
}

interface WidgetColumnProps {
  readonly layer: Layer;
  /** The tool open, if any (another tap on its button closes it). */
  readonly tool: ColumnTool | null;
  readonly onToolChange: (tool: ColumnTool | null) => void;
  /** Whether the "…" menu is open (the editor closes it on a tap anywhere else). */
  readonly moreOpen: boolean;
  readonly onMoreOpenChange: (open: boolean) => void;
  readonly actions: WidgetActions;
  /** The selected widget's scale while the size slider is dragged, drawn by the canvas. */
  readonly liveScale: SharedValue<number>;
  /** Called when the slider starts being dragged: the canvas draws the widget from `liveScale`. */
  readonly onResizeStart: () => void;
  /** Called with the new scale when the slider is let go (or stepped by a screen reader). */
  readonly onResize: (scale: number) => void;
}

/**
 * The selected widget's tools, in a column on the right (ADR 009), where the design's menus go
 * while nothing is selected: its size (a vertical slider beside it), "Aa" (its font and format,
 * or a route's line width), its color (with its opacity and its text's backdrop), and "…" with
 * its actions (edit, duplicate, front, back, remove). Only the tools that apply to the widget
 * show.
 */
export function WidgetColumn({
  layer,
  tool,
  onToolChange,
  moreOpen,
  onMoreOpenChange,
  actions,
  liveScale,
  onResizeStart,
  onResize,
}: WidgetColumnProps) {
  const { t } = useTranslation();
  const tools = widgetTools(layer);
  const toggle = (next: ColumnTool) => {
    onMoreOpenChange(false);
    onToolChange(tool === next ? null : next);
  };
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={t('editor.selectedLayer')}
      pointerEvents="box-none"
      style={{ alignItems: 'flex-end', gap: TOP_BAR_GAP }}
    >
      <View pointerEvents="box-none">
        {tool === 'size' ? (
          <View style={{ position: 'absolute', top: 0, right: ROUND_BUTTON_SIZE + TOP_BAR_GAP }}>
            <SizeSlider
              buttons={tools.lettering === null ? 3 : 4}
              scale={layer.transform.scale}
              liveScale={liveScale}
              onStart={onResizeStart}
              onEnd={onResize}
            />
          </View>
        ) : null}
        <RoundButton
          icon={{ ios: 'cellularbars', android: 'signal_cellular_alt' }}
          label={t('editor.size')}
          onPress={() => toggle('size')}
          selected={tool === 'size'}
        />
      </View>
      {tools.lettering === null ? null : (
        <RoundButton
          icon={
            tools.lettering === 'line' ? { ios: 'lineweight', android: 'line_weight' } : undefined
          }
          label={t(tools.lettering === 'line' ? 'style.width' : 'editor.lettering')}
          onPress={() => toggle('lettering')}
          selected={tool === 'lettering'}
        >
          {tools.lettering === 'line' ? null : (
            <Text
              importantForAccessibility="no"
              maxFontSizeMultiplier={1}
              style={{ color: FLOATING_INK, fontSize: 17, fontWeight: '700' }}
            >
              Aa
            </Text>
          )}
        </RoundButton>
      )}
      <RoundButton
        icon={
          tools.color === 'opacity'
            ? { ios: 'circle.lefthalf.filled', android: 'opacity' }
            : undefined
        }
        label={t(tools.color === 'opacity' ? 'style.opacity' : 'style.color')}
        onPress={() => toggle('color')}
        selected={tool === 'color'}
      >
        {tools.color === 'opacity' ? null : <Swatch color={swatchOf(layer)} />}
      </RoundButton>
      <View pointerEvents="box-none">
        {moreOpen ? (
          <View style={{ position: 'absolute', top: 0, right: ROUND_BUTTON_SIZE + TOP_BAR_GAP }}>
            <MoreMenu actions={actions} onDone={() => onMoreOpenChange(false)} />
          </View>
        ) : null}
        <RoundButton
          icon={{ ios: 'ellipsis', android: 'more_horiz' }}
          label={t('editor.more')}
          onPress={() => {
            onToolChange(null);
            onMoreOpenChange(!moreOpen);
          }}
          selected={moreOpen}
        />
      </View>
    </View>
  );
}

/** The ink of each of the logo's tones, as its button shows it. */
const LOGO_TONE_INK = {
  light: BRAND_GEOMETRY.colors.laneWhite,
  dark: BRAND_GEOMETRY.colors.black,
  color: BRAND_GEOMETRY.colors.trackRed,
} as const;

/** The color the color button shows: the widget's, or the logo's tone. */
function swatchOf(layer: Layer): string {
  return layer.kind === 'logo' ? LOGO_TONE_INK[layer.tone] : (layerColor(layer) ?? FLOATING_INK);
}

/** A dot of the widget's color, ringed so that white and black both show on the button. */
function Swatch({ color }: { readonly color: string }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: color,
        borderWidth: 2,
        borderColor: FLOATING_INK,
        // A thin dark ring around the white one, for white widgets.
        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.35)',
      }}
    />
  );
}

const MENU_ROW_HEIGHT = 44;

/** The "…" menu: the selected widget's actions, a row each; removing it last, in red. */
function MoreMenu({
  actions,
  onDone,
}: {
  readonly actions: WidgetActions;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation();
  const rows: {
    readonly key: string;
    readonly icon: SymbolViewProps['name'];
    readonly label: string;
    readonly onPress: () => void;
    readonly disabled?: boolean;
    readonly destructive?: boolean;
  }[] = [
    ...(actions.onEdit === undefined
      ? []
      : [
          {
            key: 'edit',
            icon: { ios: 'character.cursor.ibeam', android: 'edit' } as const,
            label: t('editor.editText'),
            onPress: actions.onEdit,
          },
        ]),
    {
      key: 'duplicate',
      icon: { ios: 'plus.square.on.square', android: 'content_copy' },
      label: t('editor.duplicate'),
      onPress: actions.onDuplicate,
      disabled: !actions.canDuplicate,
    },
    {
      key: 'front',
      icon: { ios: 'square.3.layers.3d.top.filled', android: 'flip_to_front' },
      label: t('editor.bringToFront'),
      onPress: actions.onBringToFront,
      disabled: !actions.canBringToFront,
    },
    {
      key: 'back',
      icon: { ios: 'square.3.layers.3d.bottom.filled', android: 'flip_to_back' },
      label: t('editor.sendToBack'),
      onPress: actions.onSendToBack,
      disabled: !actions.canSendToBack,
    },
    {
      key: 'remove',
      icon: { ios: 'trash', android: 'delete' },
      label: t('editor.remove'),
      onPress: actions.onRemove,
      destructive: true,
    },
  ];
  return (
    <View accessibilityRole="menu" style={{ ...floatingSurface(18), padding: 6, gap: 2 }}>
      {rows.map((row) => {
        const ink = row.destructive === true ? colors.error : FLOATING_INK;
        const disabled = row.disabled === true;
        return (
          <Pressable
            key={row.key}
            accessibilityRole="menuitem"
            accessibilityLabel={row.label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => {
              onDone();
              row.onPress();
            }}
            style={({ pressed }) => ({
              height: MENU_ROW_HEIGHT,
              minWidth: 168,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderRadius: 12,
              borderCurve: 'continuous',
              opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
            })}
          >
            <SymbolView name={row.icon} size={20} tintColor={ink} />
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{ color: ink, fontSize: 15, fontWeight: '600' }}
            >
              {row.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The room at each end of the slider the thumb's center doesn't go into. */
const SLIDER_PADDING = 22;
const THUMB = 24;
/** How far a screen reader's step moves the slider. */
const ACCESSIBILITY_STEP = 0.05;

function clamp01(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

/**
 * A vertical slider for the selected widget's size, bigger upwards, on a logarithmic scale (see
 * `sliderOfScale`). Dragged anywhere along it, the thumb follows the finger's movement; the
 * widget is drawn from `liveScale` meanwhile, and its size is committed once, when it is let go.
 */
function SizeSlider({
  buttons,
  scale,
  liveScale,
  onStart,
  onEnd,
}: {
  /** How many buttons the column has: the slider is as tall, so it ends where the last one does. */
  readonly buttons: number;
  readonly scale: number;
  readonly liveScale: SharedValue<number>;
  readonly onStart: () => void;
  readonly onEnd: (scale: number) => void;
}) {
  const { t } = useTranslation();
  const height = buttons * ROUND_BUTTON_SIZE + (buttons - 1) * TOP_BAR_GAP;
  const range = height - 2 * SLIDER_PADDING;
  const position = useSharedValue(sliderOfScale(scale));
  const dragging = useSharedValue(false);
  // Undo, redo or a pinch change the size from outside; never mid-drag.
  useEffect(() => {
    if (!dragging.get()) {
      position.set(sliderOfScale(scale));
    }
  }, [scale, position, dragging]);

  const pan = usePanGesture({
    onActivate: () => {
      dragging.set(true);
      liveScale.set(scale);
      scheduleOnRN(onStart);
    },
    onUpdate: (event) => {
      const next = clamp01(position.get() - event.changeY / range);
      position.set(next);
      liveScale.set(scaleOfSlider(next));
    },
    onDeactivate: () => {
      dragging.set(false);
      scheduleOnRN(onEnd, liveScale.get());
    },
  });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - position.get()) * range }],
  }));

  const percent = Math.round(sliderOfScale(scale) * 100);
  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('editor.size')}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const step =
            event.nativeEvent.actionName === 'increment' ? ACCESSIBILITY_STEP : -ACCESSIBILITY_STEP;
          onEnd(scaleOfSlider(clamp01(sliderOfScale(scale) + step)));
        }}
        style={{
          ...roundSurface(ROUND_BUTTON_SIZE),
          width: ROUND_BUTTON_SIZE,
          height,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: SLIDER_PADDING,
            bottom: SLIDER_PADDING,
            left: (ROUND_BUTTON_SIZE - 4) / 2,
            width: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
          }}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: SLIDER_PADDING - THUMB / 2,
              left: (ROUND_BUTTON_SIZE - THUMB) / 2,
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: FLOATING_INK,
              boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
            },
            thumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
}
