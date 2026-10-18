import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  chartBucketOptions,
  chartValueOptions,
  colorPageOf,
  layerColor,
  setChartOptions,
  setDataLabels,
  setLayerColor,
  setLayerOpacity,
  setLogoOptions,
  setStrokeWidth,
  setTextStyle,
  STROKE_WIDTHS,
  STYLE_COLOR_PAGES,
  STYLE_OPACITIES,
  type TextStyle,
} from '@/core/layer-style';
import type { BucketSize, PeriodSummary } from '@/core/summary';
import { FONT_IDS, type FontId, type Layer, type Template } from '@/core/template';
import { colors } from '@/theme/colors';

import { hasUnit } from './editor-data';
import { hasBold, isCapsOnly, PREVIEW_FAMILIES, usePreviewFonts } from './fonts';

/** A style edit of the template, applied by the editor as one undo step. */
export type StyleChange = (template: Template) => Template;

type Tab = 'color' | 'font' | 'format' | 'show' | 'width' | 'data' | 'opacity' | 'variant' | 'tone';

type TextLayer = Extract<Layer, { kind: 'metric' | 'summaryMetric' | 'info' | 'text' }>;
type LineLayer = Extract<Layer, { kind: 'route' | 'summaryRoutes' }>;
type ChartLayer = Extract<Layer, { kind: 'summaryChart' }>;
type LogoLayer = Extract<Layer, { kind: 'logo' }>;
type ChartValue = ChartLayer['value'];

function isTextLayer(layer: Layer): layer is TextLayer {
  return (
    layer.kind === 'metric' ||
    layer.kind === 'summaryMetric' ||
    layer.kind === 'info' ||
    layer.kind === 'text'
  );
}

/**
 * What a chart can measure in its period: distance only when the period has some. A chart
 * already measuring what the period lacks (from a template) keeps that choice, so it can be
 * switched to one that draws.
 */
function chartValues(layer: ChartLayer, values: readonly ChartValue[]): readonly ChartValue[] {
  return values.includes(layer.value) ? values : [layer.value, ...values];
}

/**
 * Tabs of the panel for a layer. A chart puts its data first (what it measures and its bar
 * size), only when the period offers a choice of either.
 */
function tabsFor(
  layer: Layer,
  buckets: readonly BucketSize[],
  values: readonly ChartValue[],
): readonly Tab[] {
  switch (layer.kind) {
    case 'metric':
    case 'summaryMetric':
      return ['color', 'font', 'format', 'show', 'opacity'];
    case 'info':
    case 'text':
      return ['color', 'font', 'format', 'opacity'];
    case 'route':
    case 'summaryRoutes':
      return ['color', 'width', 'opacity'];
    case 'summaryChart':
      return [
        ...(chartValues(layer, values).length > 1 || buckets.length > 1 ? (['data'] as const) : []),
        'color',
        'font',
        'format',
        'show',
        'opacity',
      ];
    case 'logo':
      return ['variant', 'tone', 'opacity'];
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

interface StylePanelProps {
  readonly layer: Layer;
  /** The summary, for what its chart can measure and its bar sizes; `null` for an activity. */
  readonly summary: PeriodSummary | null;
  /** Bar size of the period, which a chart on `auto` uses; `null` for an activity. */
  readonly autoBucket: BucketSize | null;
  readonly locale: string;
  readonly onChange: (change: StyleChange) => void;
}

/**
 * Style options of the selected layer, one tab at a time, in the space of the editor's formats
 * (the editor's main button turns into "Done" meanwhile). Every tap is one undo step.
 */
export function StylePanel({ layer, summary, autoBucket, locale, onChange }: StylePanelProps) {
  const { t } = useTranslation();
  const buckets = summary === null ? [] : chartBucketOptions(summary.range);
  const values = summary === null ? [] : chartValueOptions(summary);
  const tabs = tabsFor(layer, buckets, values);
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
          <TabContent
            tab={tab}
            layer={layer}
            buckets={buckets}
            autoBucket={autoBucket}
            values={values}
            locale={locale}
            onChange={onChange}
          />
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

/** How a text is written; options left out don't apply to the widget. */
interface Format {
  readonly font: FontId;
  readonly bold: boolean;
  readonly uppercase?: boolean;
  readonly align?: TextStyle['align'];
}

/**
 * Bold, uppercase and an alignment button that cycles left, center and right, when they apply:
 * free text has no uppercase (the user types the capitals they want) and a chart no alignment.
 */
function FormatRow({
  format,
  onPatch,
}: {
  readonly format: Format;
  readonly onPatch: (patch: Partial<Omit<Format, 'font'>>) => void;
}) {
  const { t } = useTranslation();
  const { font, bold, uppercase, align } = format;
  return (
    <Row>
      <IconToggle
        icon={{ ios: 'bold', android: 'format_bold' }}
        label={t('style.bold')}
        selected={bold}
        disabled={!hasBold(font)}
        onPress={() => onPatch({ bold: !bold })}
      />
      {uppercase === undefined ? null : (
        <IconToggle
          icon={{ ios: 'textformat', android: 'match_case' }}
          label={t('style.uppercase')}
          selected={uppercase}
          disabled={isCapsOnly(font)}
          onPress={() => onPatch({ uppercase: !uppercase })}
        />
      )}
      {align === undefined ? null : (
        <IconToggle
          icon={ALIGN_ICONS[align]}
          label={t('style.alignment')}
          value={t(`style.align.${align}`)}
          selected={false}
          onPress={() =>
            onPatch({ align: ALIGN_ORDER[(ALIGN_ORDER.indexOf(align) + 1) % ALIGN_ORDER.length] })
          }
        />
      )}
    </Row>
  );
}

/** The format a widget's panel edits, and how to apply a change to it. */
function formatOf(layer: TextLayer | ChartLayer): {
  readonly format: Format;
  readonly change: (patch: Partial<Format>) => StyleChange;
} {
  if (layer.kind === 'summaryChart') {
    return {
      format: {
        font: layer.font,
        bold: layer.bold,
        uppercase: layer.uppercase,
        align: layer.align,
      },
      change: (patch) => (template) => setChartOptions(template, layer.id, patch),
    };
  }
  const { font, bold, uppercase, align } = layer.style;
  return {
    format: { font, bold, uppercase: layer.kind === 'text' ? undefined : uppercase, align },
    change: (patch) => (template) => setTextStyle(template, layer.id, patch),
  };
}

function TabContent({
  tab,
  layer,
  buckets,
  autoBucket,
  values,
  locale,
  onChange,
}: {
  readonly tab: Tab;
  readonly layer: Layer;
  readonly buckets: readonly BucketSize[];
  readonly autoBucket: BucketSize | null;
  readonly values: readonly ChartValue[];
  readonly locale: string;
  readonly onChange: (change: StyleChange) => void;
}) {
  switch (tab) {
    case 'color':
      return <ColorPager layer={layer} onChange={onChange} />;
    case 'font':
    case 'format': {
      if (!isTextLayer(layer) && layer.kind !== 'summaryChart') {
        return null;
      }
      const { format, change } = formatOf(layer);
      return tab === 'font' ? (
        <FontRow font={format.font} onPick={(font) => onChange(change({ font }))} />
      ) : (
        <FormatRow format={format} onPatch={(patch) => onChange(change(patch))} />
      );
    }
    case 'show':
      return layer.kind === 'metric' || layer.kind === 'summaryMetric' ? (
        <ShowRow layer={layer} onChange={onChange} />
      ) : layer.kind === 'summaryChart' ? (
        <ChartShowRow layer={layer} onChange={onChange} />
      ) : null;
    case 'width':
      return layer.kind === 'route' || layer.kind === 'summaryRoutes' ? (
        <WidthRow layer={layer} onChange={onChange} />
      ) : null;
    case 'data':
      return layer.kind === 'summaryChart' ? (
        <ChartDataRow
          layer={layer}
          values={values}
          buckets={buckets}
          autoBucket={autoBucket}
          onChange={onChange}
        />
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

/** The bundled fonts, each named by its style and written in itself. */
function FontRow({
  font: current,
  onPick,
}: {
  readonly font: FontId;
  readonly onPick: (font: FontId) => void;
}) {
  const { t } = useTranslation();
  const previews = usePreviewFonts();
  return (
    <Row>
      {FONT_IDS.map((font) => (
        <Chip
          key={font}
          label={t(`fonts.${font}`)}
          fontFamily={previews ? PREVIEW_FAMILIES[font] : undefined}
          selected={current === font}
          onPress={() => onPick(font)}
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

const WIDTHS = ['thin', 'medium', 'thick'] as const;

/** Line width of a route, from three sizes suited to one route or to a period's many. */
function WidthRow({
  layer,
  onChange,
}: {
  readonly layer: LineLayer;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  const sizes = STROKE_WIDTHS[layer.kind];
  return (
    <Row>
      {WIDTHS.map((width) => (
        <Chip
          key={width}
          label={t(`style.widths.${width}`)}
          selected={layer.stroke.width === sizes[width]}
          onPress={() => onChange((template) => setStrokeWidth(template, layer.id, sizes[width]))}
        />
      ))}
    </Row>
  );
}

/**
 * The chart's data, as two separate choices with a divider between them: what the bars measure
 * (distance or time) and their size (days, weeks or months). Each shows only when the period
 * offers a choice. A chart on `auto` shows the size the period gives it as chosen; picking one
 * fixes it.
 */
function ChartDataRow({
  layer,
  values,
  buckets,
  autoBucket,
  onChange,
}: {
  readonly layer: ChartLayer;
  readonly values: readonly ChartValue[];
  readonly buckets: readonly BucketSize[];
  readonly autoBucket: BucketSize | null;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  const measures = chartValues(layer, values);
  const bucket = layer.bucket === 'auto' ? autoBucket : layer.bucket;
  return (
    <Row>
      {measures.length > 1
        ? measures.map((value) => (
            <Chip
              key={value}
              label={t(`style.values.${value}`)}
              selected={layer.value === value}
              onPress={() => onChange((template) => setChartOptions(template, layer.id, { value }))}
            />
          ))
        : null}
      {measures.length > 1 && buckets.length > 1 ? (
        <View
          importantForAccessibility="no"
          style={{ width: 1, height: 28, marginHorizontal: 8, backgroundColor: colors.separator }}
        />
      ) : null}
      {buckets.length > 1
        ? buckets.map((size) => (
            <Chip
              key={size}
              label={t(`style.buckets.${size}`)}
              selected={bucket === size}
              onPress={() =>
                onChange((template) => setChartOptions(template, layer.id, { bucket: size }))
              }
            />
          ))
        : null}
    </Row>
  );
}

/** Whether each bar has its day, week or month under it, and the chart its title. */
function ChartShowRow({
  layer,
  onChange,
}: {
  readonly layer: ChartLayer;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  return (
    <Row>
      <Chip
        label={t('style.axisLabels')}
        selected={layer.axisLabels}
        onPress={() =>
          onChange((template) =>
            setChartOptions(template, layer.id, { axisLabels: !layer.axisLabels }),
          )
        }
      />
      <Chip
        label={t('style.chartTitle')}
        selected={layer.title}
        onPress={() =>
          onChange((template) => setChartOptions(template, layer.id, { title: !layer.title }))
        }
      />
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
