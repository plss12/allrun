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
  setDateFormat,
  setLineOptions,
  setLayerColor,
  setLayerOpacity,
  setLogoOptions,
  setPeriodFormat,
  setStrokeWidth,
  setTextStyle,
  STROKE_WIDTHS,
  STYLE_COLOR_PAGES,
  STYLE_OPACITIES,
  type TextStyle,
} from '@/core/layer-style';
import type { BucketSize, PeriodSummary } from '@/core/summary';
import {
  BACKDROPS,
  DATE_FORMATS,
  DISTANCE_DECIMALS,
  FONT_IDS,
  type FontId,
  LETTER_SPACINGS,
  type Layer,
  LINE_STYLES,
  PERIOD_FORMATS,
  type Template,
  TIME_NOTATIONS,
} from '@/core/template';
import { colors } from '@/theme/colors';

import { hasUnit, isDistanceLayer, isPaceLayer, isTimeLayer, MISSING_VALUE } from './editor-data';
import { hasBold, isCapsOnly, PREVIEW_FAMILIES, usePreviewFonts } from './fonts';

/** A style edit of the template, applied by the editor as one undo step. */
export type StyleChange = (template: Template) => Template;

type Tab = 'color' | 'font' | 'format' | 'width' | 'data' | 'opacity' | 'variant' | 'tone';

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
  /**
   * What a text widget shows with the current data (its value, without label or unit), or `null`
   * for other layers: options that change how a value is written show it written each way.
   */
  readonly textOf: (layer: Layer) => string | null;
  readonly onChange: (change: StyleChange) => void;
}

/**
 * Style options of the selected layer, one tab at a time, in the space of the editor's formats
 * (the editor's main button turns into "Done" meanwhile). Every tap is one undo step.
 */
export function StylePanel({
  layer,
  summary,
  autoBucket,
  locale,
  textOf,
  onChange,
}: StylePanelProps) {
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
            textOf={textOf}
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
  readonly backdrop?: NonNullable<TextStyle['backdrop']>;
  readonly letterSpacing?: NonNullable<TextStyle['letterSpacing']>;
}

/**
 * Bold, uppercase and an alignment button that cycles left, center and right, when they apply:
 * free text has no uppercase (the user types the capitals they want). After them, `children`:
 * the widget's own options of what it shows and how.
 */
function FormatRow({
  format,
  onPatch,
  children,
}: {
  readonly format: Format;
  readonly onPatch: (patch: Partial<Omit<Format, 'font'>>) => void;
  readonly children?: ReactNode;
}) {
  const { t } = useTranslation();
  const { font, bold, uppercase, align, backdrop, letterSpacing } = format;
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
      {backdrop === undefined ? null : (
        <IconToggle
          icon={{ ios: 'character.textbox', android: 'format_color_fill' }}
          label={t('style.backdrop')}
          value={t(`style.backdrops.${backdrop}`)}
          selected={backdrop !== 'none'}
          onPress={() => onPatch({ backdrop: nextOf(BACKDROPS, backdrop) })}
        />
      )}
      {letterSpacing === undefined ? null : (
        // Like the alignment button: it shows the current spacing and cycles on each tap.
        <IconToggle
          glyph={<SpacingGlyph spacing={letterSpacing} />}
          label={t('style.letterSpacing')}
          value={t(`style.letterSpacings.${letterSpacing}`)}
          selected={false}
          onPress={() => onPatch({ letterSpacing: nextOf(LETTER_SPACINGS, letterSpacing) })}
        />
      )}
      {children === undefined ? null : (
        <>
          <Divider />
          {children}
        </>
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
  const { font, bold, uppercase, align, backdrop, letterSpacing } = layer.style;
  return {
    format: {
      font,
      bold,
      uppercase: layer.kind === 'text' ? undefined : uppercase,
      align,
      backdrop: backdrop ?? 'none',
      letterSpacing: letterSpacing ?? 'normal',
    },
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
  textOf,
  onChange,
}: {
  readonly tab: Tab;
  readonly layer: Layer;
  readonly buckets: readonly BucketSize[];
  readonly autoBucket: BucketSize | null;
  readonly values: readonly ChartValue[];
  readonly locale: string;
  readonly textOf: (layer: Layer) => string | null;
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
        <FormatRow format={format} onPatch={(patch) => onChange(change(patch))}>
          {layer.kind === 'metric' || layer.kind === 'summaryMetric' ? (
            <DataOptions layer={layer} textOf={textOf} onChange={onChange} />
          ) : layer.kind === 'summaryChart' ? (
            <ChartOptions layer={layer} onChange={onChange} />
          ) : layer.kind === 'info' && layer.field === 'activityDate' ? (
            <DateOptions layer={layer} textOf={textOf} onChange={onChange} />
          ) : layer.kind === 'info' && layer.field === 'periodName' ? (
            <PeriodOptions layer={layer} textOf={textOf} onChange={onChange} />
          ) : undefined}
        </FormatRow>
      );
    }
    case 'width':
      return layer.kind === 'route' || layer.kind === 'summaryRoutes' ? (
        <LineRow layer={layer} onChange={onChange} />
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

/**
 * How a pace or a time is written, first (how the value itself reads), then whether a metric
 * shows its name and, when it has one, its unit. The pace and time chips show the widget's own
 * value written the current way; a pace without a value shows the pattern instead.
 */
function DataOptions({
  layer,
  textOf,
  onChange,
}: {
  readonly layer: Extract<Layer, { kind: 'metric' | 'summaryMetric' }>;
  readonly textOf: (layer: Layer) => string | null;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  const pace = layer.paceNotation ?? 'colon';
  const time = layer.timeNotation ?? 'clock';
  const decimals = layer.decimals ?? 2;
  const paceIn = (paceNotation: 'colon' | 'marks') => {
    const text = textOf({ ...layer, paceNotation });
    return text === null || text === MISSING_VALUE ? PACE_PATTERNS[paceNotation] : text;
  };
  return (
    <>
      {isPaceLayer(layer) ? (
        <CycleChip
          label={paceIn(pace)}
          accessibilityLabel={t('style.paceNotation')}
          accessibilityValue={t(`style.paceNotations.${pace}`)}
          onPress={() =>
            onChange((template) =>
              setDataLabels(template, layer.id, { paceNotation: nextOf(PACE_NOTATIONS, pace) }),
            )
          }
        />
      ) : null}
      {isDistanceLayer(layer) ? (
        <CycleChip
          label={textOf(layer) ?? ''}
          accessibilityLabel={t('style.decimals')}
          accessibilityValue={String(decimals)}
          onPress={() =>
            onChange((template) =>
              setDataLabels(template, layer.id, { decimals: nextOf(DISTANCE_DECIMALS, decimals) }),
            )
          }
        />
      ) : null}
      {isTimeLayer(layer) ? (
        <CycleChip
          label={textOf(layer) ?? ''}
          accessibilityLabel={t('style.timeNotation')}
          accessibilityValue={t(`style.timeNotations.${time}`)}
          onPress={() =>
            onChange((template) =>
              setDataLabels(template, layer.id, { timeNotation: nextOf(TIME_NOTATIONS, time) }),
            )
          }
        />
      ) : null}
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
    </>
  );
}

const PACE_NOTATIONS = ['colon', 'marks'] as const;

/** How each pace notation looks, for a widget without a pace to show it with. */
const PACE_PATTERNS = { colon: 'm:ss', marks: `m'ss"` } as const;

/** The option after `current`, back to the first after the last. */
function nextOf<T>(options: readonly T[], current: T): T {
  return options[(options.indexOf(current) + 1) % options.length];
}

/** How an activity's date reads: its own date written so, each tap the next format. */
function DateOptions({
  layer,
  textOf,
  onChange,
}: {
  readonly layer: Extract<Layer, { kind: 'info' }>;
  readonly textOf: (layer: Layer) => string | null;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  const current = layer.dateFormat ?? 'full';
  const text = textOf(layer) ?? '';
  return (
    <CycleChip
      label={text}
      accessibilityLabel={t('style.dateFormat')}
      accessibilityValue={text}
      onPress={() =>
        onChange((template) => setDateFormat(template, layer.id, nextOf(DATE_FORMATS, current)))
      }
    />
  );
}

/**
 * How a period's name reads: its own name written so, each tap the next format that writes it
 * differently. None for a year, which only reads "2026".
 */
function PeriodOptions({
  layer,
  textOf,
  onChange,
}: {
  readonly layer: Extract<Layer, { kind: 'info' }>;
  readonly textOf: (layer: Layer) => string | null;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  const text = textOf(layer) ?? '';
  // One format per way of writing this period: a month and a week differ in different formats.
  const seen = new Set<string>();
  const formats = PERIOD_FORMATS.filter((periodFormat) => {
    const written = textOf({ ...layer, periodFormat }) ?? '';
    if (seen.has(written)) {
      return false;
    }
    seen.add(written);
    return true;
  });
  if (formats.length < 2) {
    return null;
  }
  // A format that writes the same as an earlier one moves on from that one.
  const position = formats.findIndex(
    (periodFormat) => (textOf({ ...layer, periodFormat }) ?? '') === text,
  );
  const next = formats[(position + 1) % formats.length];
  return (
    <CycleChip
      label={text}
      accessibilityLabel={t('style.periodFormat')}
      accessibilityValue={text}
      onPress={() => onChange((template) => setPeriodFormat(template, layer.id, next))}
    />
  );
}

const WIDTHS = ['thin', 'medium', 'thick'] as const;

/**
 * How a route's line looks: its width, from three sizes suited to one route or to a period's
 * many; solid, dashed or dotted, in one chip that moves to the next on each tap; a glow; and, for
 * one activity's route, marks where it starts and ends.
 */
function LineRow({
  layer,
  onChange,
}: {
  readonly layer: LineLayer;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  const sizes = STROKE_WIDTHS[layer.kind];
  const line = layer.stroke.line ?? 'solid';
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
      <Divider />
      <CycleChip
        label={t(`style.lineStyles.${line}`)}
        accessibilityLabel={t('style.lineStyle')}
        accessibilityValue={t(`style.lineStyles.${line}`)}
        onPress={() =>
          onChange((template) =>
            setLineOptions(template, layer.id, { line: nextOf(LINE_STYLES, line) }),
          )
        }
      />
      <Chip
        label={t('style.glow')}
        selected={layer.stroke.glow ?? false}
        onPress={() =>
          onChange((template) =>
            setLineOptions(template, layer.id, { glow: !(layer.stroke.glow ?? false) }),
          )
        }
      />
      {layer.kind === 'route' ? (
        <Chip
          label={t('style.endpoints')}
          selected={layer.endpoints ?? false}
          onPress={() =>
            onChange((template) =>
              setLineOptions(template, layer.id, { endpoints: !(layer.endpoints ?? false) }),
            )
          }
        />
      ) : null}
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

/**
 * The chart's extras, first the bars' (an average line), then its texts (each bar's day, week
 * or month under it, and its title).
 */
function ChartOptions({
  layer,
  onChange,
}: {
  readonly layer: ChartLayer;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Chip
        label={t('style.averageLine')}
        selected={layer.averageLine ?? false}
        onPress={() =>
          onChange((template) =>
            setChartOptions(template, layer.id, { averageLine: !(layer.averageLine ?? false) }),
          )
        }
      />
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
    </>
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

/** A thin line between groups of options in a row. */
function Divider() {
  return (
    <View
      style={{ width: 1, height: 28, marginHorizontal: 4, backgroundColor: colors.separator }}
    />
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

/**
 * One chip for the ways a value can be written: it shows the value written the current way and
 * switches to the next way on each tap, so the row doesn't fill with a chip per option.
 */
function CycleChip({
  label,
  accessibilityLabel,
  accessibilityValue,
  onPress,
}: {
  readonly label: string;
  /** What the chip chooses ("Date format"). */
  readonly accessibilityLabel: string;
  /** The current choice, spoken. */
  readonly accessibilityValue: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: accessibilityValue }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: 999,
        justifyContent: 'center',
        backgroundColor: colors.secondarySystemBackground,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: colors.label, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/** Room between the letters of the spacing button's glyph, for each spacing (points). */
const GLYPH_SPACING = { normal: 0, wide: 2.5, wider: 6 } as const;

/** Two letters as far apart as the chosen spacing: the icon of the letter spacing button. */
function SpacingGlyph({ spacing }: { readonly spacing: keyof typeof GLYPH_SPACING }) {
  return (
    <Text
      allowFontScaling={false}
      style={{
        color: colors.label,
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: GLYPH_SPACING[spacing],
        // The spacing also follows the last letter: this keeps the pair centered.
        marginRight: -GLYPH_SPACING[spacing],
      }}
    >
      AB
    </Text>
  );
}

/** A square button with an icon: a symbol, or a `glyph` drawn for it. */
function IconToggle({
  icon,
  glyph,
  label,
  value,
  selected,
  onPress,
  disabled = false,
}: {
  readonly icon?: SymbolViewProps['name'];
  readonly glyph?: ReactNode;
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
      {glyph ??
        (icon === undefined ? null : (
          <SymbolView name={icon} size={20} tintColor={selected ? colors.onTint : colors.label} />
        ))}
    </Pressable>
  );
}
