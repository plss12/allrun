import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  colorPageOf,
  layerColor,
  setDataLabels,
  setLayerColor,
  setLayerOpacity,
  setLogoOptions,
  setTextStyle,
  STYLE_COLOR_PAGES,
  STYLE_OPACITIES,
  type TextStyle,
} from '@/core/layer-style';
import { FONT_IDS, type Layer, type Template } from '@/core/template';
import { colors } from '@/theme/colors';

import { hasUnit } from './editor-data';
import { FONT_FAMILIES, hasBold, isCapsOnly, PREVIEW_FAMILIES, usePreviewFonts } from './fonts';

/** A style edit of the template, applied by the editor as one undo step. */
export type StyleChange = (template: Template) => Template;

type Tab = 'color' | 'font' | 'format' | 'show' | 'opacity' | 'variant' | 'tone';

type TextLayer = Extract<Layer, { kind: 'metric' | 'summaryMetric' | 'info' | 'text' }>;
type LogoLayer = Extract<Layer, { kind: 'logo' }>;

function isTextLayer(layer: Layer): layer is TextLayer {
  return (
    layer.kind === 'metric' ||
    layer.kind === 'summaryMetric' ||
    layer.kind === 'info' ||
    layer.kind === 'text'
  );
}

/** Tabs of the panel for a layer; empty for layers it can't style yet. */
function tabsFor(layer: Layer): readonly Tab[] {
  switch (layer.kind) {
    case 'metric':
    case 'summaryMetric':
      return ['color', 'font', 'format', 'show', 'opacity'];
    case 'info':
    case 'text':
      return ['color', 'font', 'format', 'opacity'];
    case 'logo':
      return ['variant', 'tone', 'opacity'];
    case 'route':
    case 'summaryRoutes':
    case 'summaryChart':
      return [];
  }
}

/**
 * Heights of the panel's rows: the tabs and the options (with the color dots). With their gap
 * they add up to {@link STYLE_PANEL_HEIGHT}, the space of the editor's formats, so the canvas
 * keeps its size when the panel opens.
 */
const TAB_HEIGHT = 36;
const OPTIONS_HEIGHT = 50;
const ROW_GAP = 6;
export const STYLE_PANEL_HEIGHT = TAB_HEIGHT + ROW_GAP + OPTIONS_HEIGHT;

/** Whether the style panel has options for this layer. */
export function canStyle(layer: Layer): boolean {
  return tabsFor(layer).length > 0;
}

interface StylePanelProps {
  readonly layer: Layer;
  readonly locale: string;
  readonly onChange: (change: StyleChange) => void;
}

/**
 * Style options of the selected layer, one tab at a time, in the space of the editor's formats
 * (the editor's main button turns into "Done" meanwhile). Every tap is one undo step.
 */
export function StylePanel({ layer, locale, onChange }: StylePanelProps) {
  const { t } = useTranslation();
  const tabs = tabsFor(layer);
  const [chosen, setChosen] = useState<Tab>(tabs[0] ?? 'opacity');
  const tab = tabs.includes(chosen) ? chosen : tabs[0];
  return (
    // Rows of fixed height: a row that shrank would let the next one cover it.
    <View style={{ height: STYLE_PANEL_HEIGHT, gap: ROW_GAP }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        style={{ height: TAB_HEIGHT, flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{
          gap: 6,
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {tabs.map((option) => (
          <Chip
            key={option}
            role="tab"
            compact
            label={t(`style.${option}`)}
            selected={option === tab}
            onPress={() => setChosen(option)}
          />
        ))}
      </ScrollView>
      <View style={{ height: OPTIONS_HEIGHT, flexShrink: 0, justifyContent: 'center' }}>
        {tab === undefined ? null : (
          <TabContent tab={tab} layer={layer} locale={locale} onChange={onChange} />
        )}
      </View>
    </View>
  );
}

const ALIGN_ORDER: readonly TextStyle['align'][] = ['left', 'center', 'right'];

const ALIGN_ICONS: Readonly<Record<TextStyle['align'], SymbolViewProps['name']>> = {
  left: { ios: 'text.alignleft', android: 'format_align_left' },
  center: { ios: 'text.aligncenter', android: 'format_align_center' },
  right: { ios: 'text.alignright', android: 'format_align_right' },
};

/**
 * Bold, uppercase and an alignment button that cycles left, center and right. Free text has no
 * uppercase: the user types the capitals they want.
 */
function FormatRow({
  layer,
  onChange,
}: {
  readonly layer: TextLayer;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  const { style } = layer;
  const setStyle = (patch: Parameters<typeof setTextStyle>[2]) =>
    onChange((template) => setTextStyle(template, layer.id, patch));
  const nextAlign = ALIGN_ORDER[(ALIGN_ORDER.indexOf(style.align) + 1) % ALIGN_ORDER.length];
  return (
    <Row>
      <IconToggle
        icon={{ ios: 'bold', android: 'format_bold' }}
        label={t('style.bold')}
        selected={style.bold}
        disabled={!hasBold(style.font)}
        onPress={() => setStyle({ bold: !style.bold })}
      />
      {layer.kind === 'text' ? null : (
        <IconToggle
          icon={{ ios: 'textformat', android: 'match_case' }}
          label={t('style.uppercase')}
          selected={style.uppercase}
          disabled={isCapsOnly(style.font)}
          onPress={() => setStyle({ uppercase: !style.uppercase })}
        />
      )}
      <IconToggle
        icon={ALIGN_ICONS[style.align]}
        label={t('style.alignment')}
        value={t(`style.align.${style.align}`)}
        selected={false}
        onPress={() => setStyle({ align: nextAlign })}
      />
    </Row>
  );
}

function TabContent({
  tab,
  layer,
  locale,
  onChange,
}: {
  readonly tab: Tab;
  readonly layer: Layer;
  readonly locale: string;
  readonly onChange: (change: StyleChange) => void;
}) {
  switch (tab) {
    case 'color':
      return <ColorPager layer={layer} onChange={onChange} />;
    case 'font':
      return isTextLayer(layer) ? <FontRow layer={layer} onChange={onChange} /> : null;
    case 'format':
      return isTextLayer(layer) ? <FormatRow layer={layer} onChange={onChange} /> : null;
    case 'show':
      return layer.kind === 'metric' || layer.kind === 'summaryMetric' ? (
        <ShowRow layer={layer} onChange={onChange} />
      ) : null;
    case 'opacity':
      return <OpacityRow layer={layer} locale={locale} onChange={onChange} />;
    case 'variant':
    case 'tone':
      return layer.kind === 'logo' ? (
        <LogoRow layer={layer} option={tab} onChange={onChange} />
      ) : null;
  }
}

/** Largest swatch; touches reach 44 pt through a small slop. Smaller when seven don't fit. */
const SWATCH = 40;
const COLORS_PER_PAGE = 7;

/** Pages of seven swatches swiped sideways, with a dot per page that also jumps to it. */
function ColorPager({
  layer,
  onChange,
}: {
  readonly layer: Layer;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  const current = layerColor(layer)?.toUpperCase() ?? null;
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(() => colorPageOf(current));
  const pager = useRef<ScrollView>(null);
  const swatch = Math.min(SWATCH, width / COLORS_PER_PAGE);
  const goTo = (index: number, animated: boolean) => {
    pager.current?.scrollTo({ x: index * width, animated });
    setPage(index);
  };
  return (
    <View style={{ gap: 4 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width === 0 ? (
        <View style={{ height: SWATCH }} />
      ) : (
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          // Opens on the page of the layer's color.
          onLayout={() => pager.current?.scrollTo({ x: page * width, animated: false })}
          onMomentumScrollEnd={(event) =>
            setPage(Math.round(event.nativeEvent.contentOffset.x / width))
          }
        >
          {STYLE_COLOR_PAGES.map((colorPage) => (
            <View
              key={colorPage.id}
              style={{
                width,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {colorPage.colors.map((color) => {
                const selected = current === color.hex;
                return (
                  <Pressable
                    key={`${colorPage.id}-${color.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={t(`style.colors.${color.id}`)}
                    accessibilityState={{ selected }}
                    hitSlop={2}
                    onPress={() =>
                      onChange((template) => setLayerColor(template, layer.id, color.hex))
                    }
                    style={({ pressed }) => ({
                      width: swatch,
                      height: swatch,
                      borderRadius: swatch / 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: selected ? colors.tint : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: swatch - 12,
                        height: swatch - 12,
                        borderRadius: (swatch - 12) / 2,
                        backgroundColor: color.hex,
                        // Light swatches would vanish on a light interface without an edge.
                        borderWidth: 1,
                        borderColor: colors.separator,
                      }}
                    />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
        {STYLE_COLOR_PAGES.map((colorPage, index) => (
          <Pressable
            key={colorPage.id}
            accessibilityRole="button"
            accessibilityLabel={t(`style.colorPages.${colorPage.id}`)}
            accessibilityState={{ selected: index === page }}
            hitSlop={10}
            onPress={() => goTo(index, true)}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: index === page ? colors.label : colors.separator,
            }}
          />
        ))}
      </View>
    </View>
  );
}

function FontRow({
  layer,
  onChange,
}: {
  readonly layer: TextLayer;
  readonly onChange: (change: StyleChange) => void;
}) {
  const previews = usePreviewFonts();
  return (
    <Row>
      {FONT_IDS.map((font) => (
        <Chip
          key={font}
          label={FONT_FAMILIES[font]}
          fontFamily={previews ? PREVIEW_FAMILIES[font] : undefined}
          selected={layer.style.font === font}
          onPress={() => onChange((template) => setTextStyle(template, layer.id, { font }))}
        />
      ))}
    </Row>
  );
}

/** Whether a metric shows its name and, when it has one, its unit. */
function ShowRow({
  layer,
  onChange,
}: {
  readonly layer: Extract<Layer, { kind: 'metric' | 'summaryMetric' }>;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  return (
    <Row>
      <Chip
        label={t('style.showLabel')}
        selected={layer.showLabel}
        onPress={() =>
          onChange((template) => setDataLabels(template, layer.id, { showLabel: !layer.showLabel }))
        }
      />
      {hasUnit(layer) ? (
        <Chip
          label={t('style.showUnit')}
          selected={layer.showUnit}
          onPress={() =>
            onChange((template) => setDataLabels(template, layer.id, { showUnit: !layer.showUnit }))
          }
        />
      ) : null}
    </Row>
  );
}

const LOGO_OPTIONS = {
  variant: ['wordmark', 'mark', 'lockup'],
  tone: ['light', 'dark', 'color'],
} as const;

/** The logo's artwork (name, monogram or both) or its tone. */
function LogoRow({
  layer,
  option,
  onChange,
}: {
  readonly layer: LogoLayer;
  readonly option: 'variant' | 'tone';
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  return (
    <Row>
      {option === 'variant'
        ? LOGO_OPTIONS.variant.map((variant) => (
            <Chip
              key={variant}
              label={t(`style.variants.${variant}`)}
              selected={layer.variant === variant}
              onPress={() =>
                onChange((template) => setLogoOptions(template, layer.id, { variant }))
              }
            />
          ))
        : LOGO_OPTIONS.tone.map((tone) => (
            <Chip
              key={tone}
              label={t(`style.tones.${tone}`)}
              selected={layer.tone === tone}
              onPress={() => onChange((template) => setLogoOptions(template, layer.id, { tone }))}
            />
          ))}
    </Row>
  );
}

function OpacityRow({
  layer,
  locale,
  onChange,
}: {
  readonly layer: Layer;
  readonly locale: string;
  readonly onChange: (change: StyleChange) => void;
}) {
  const percent = new Intl.NumberFormat(locale, { style: 'percent' });
  return (
    <Row>
      {STYLE_OPACITIES.map((opacity) => (
        <Chip
          key={opacity}
          label={percent.format(opacity)}
          selected={Math.abs(layer.opacity - opacity) < 0.005}
          onPress={() => onChange((template) => setLayerOpacity(template, layer.id, opacity))}
        />
      ))}
    </Row>
  );
}

function Row({ children }: { readonly children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: 8,
        alignItems: 'center',
        flexGrow: 1,
        justifyContent: 'center',
      }}
    >
      {children}
    </ScrollView>
  );
}

function Chip({
  label,
  selected,
  onPress,
  role = 'button',
  compact = false,
  fontFamily,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly role?: 'button' | 'tab';
  /** Shorter, for the tab bar; the touch target still reaches 44 pt. */
  readonly compact?: boolean;
  readonly fontFamily?: string;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ selected }}
      hitSlop={compact ? 4 : undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: compact ? 36 : 44,
        paddingHorizontal: 14,
        borderRadius: 999,
        justifyContent: 'center',
        backgroundColor: selected ? colors.tint : colors.secondarySystemBackground,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          color: selected ? colors.onTint : colors.label,
          fontSize: 15,
          fontWeight: fontFamily === undefined ? '600' : undefined,
          fontFamily,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function IconToggle({
  icon,
  label,
  value,
  selected,
  onPress,
  disabled = false,
}: {
  readonly icon: SymbolViewProps['name'];
  readonly label: string;
  /** Spoken current value, for buttons that cycle through options. */
  readonly value?: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={value === undefined ? undefined : { text: value }}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 12,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? colors.tint : colors.secondarySystemBackground,
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      <SymbolView name={icon} size={20} tintColor={selected ? colors.onTint : colors.label} />
    </Pressable>
  );
}
