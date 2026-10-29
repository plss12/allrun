import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, type ScrollViewInstance, Text, View } from 'react-native';

import {
  colorPageOf,
  layerColor,
  setAxisLabels,
  setBlockOptions,
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
import {
  BACKDROPS,
  FONT_IDS,
  type FontId,
  LETTER_SPACINGS,
  type Layer,
  type Template,
} from '@/core/template';
import { isAppReplica, isDataWidget } from '@/core/activity-block';
import { isSummaryDataWidget, isSummaryReplica } from '@/core/summary-block';
import { colors } from '@/theme/colors';

import { hasUnit } from './editor-data';
import { keepingArea } from './font-change';
import type { LayerContext } from './template-scene';
import { hasBold, isCapsOnly, PREVIEW_FAMILIES, usePreviewFonts } from './fonts';

/** A style edit of the template, applied by the editor as one undo step. */
export type StyleChange = (template: Template) => Template;

type Tab = 'color' | 'font' | 'format' | 'width' | 'opacity' | 'tone';

type TextLayer = Extract<Layer, { kind: 'metric' | 'summaryMetric' | 'info' | 'text' }>;
type LineLayer = Extract<Layer, { kind: 'route' | 'summaryRoutes' }>;
/** A period's chart or an activity's: they share how their texts look. */
type AnyChartLayer = Extract<Layer, { kind: 'summaryChart' | 'activityChart' }>;
type LogoLayer = Extract<Layer, { kind: 'logo' }>;
type BlockLayer = Extract<Layer, { kind: 'activityBlock' | 'summaryBlock' }>;

function isTextLayer(layer: Layer): layer is TextLayer {
  return (
    layer.kind === 'metric' ||
    layer.kind === 'summaryMetric' ||
    layer.kind === 'info' ||
    layer.kind === 'text'
  );
}

/**
 * Tabs of the panel for a layer: only its look. What it shows and how (a time's notation, a
 * chart's average, a route's line…) is a variant of its own in the gallery: to change it, the
 * user replaces the widget.
 */
function tabsFor(layer: Layer): readonly Tab[] {
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
    case 'activityChart':
      return ['color', 'font', 'format', 'opacity'];
    case 'summaryBlock':
      return isSummaryReplica(layer.block.design)
        ? ['opacity']
        : ['color', 'font', 'format', 'opacity'];
    case 'activityBlock':
      // A replica of an app keeps the app's look: only how see-through it is can change.
      return isAppReplica(layer.block.design)
        ? ['opacity']
        : ['color', 'font', 'format', 'opacity'];
    case 'logo':
      return ['tone', 'opacity'];
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
  readonly locale: string;
  readonly onChange: (change: StyleChange) => void;
  /** How the layer is drawn, to keep its size when its font changes (see `keepingArea`). */
  readonly layerContext: LayerContext;
}

/**
 * Style options of the selected layer, one tab at a time, in the space of the editor's formats
 * (the editor's main button turns into "Done" meanwhile). Every tap is one undo step.
 */
export function StylePanel({ layer, locale, onChange, layerContext }: StylePanelProps) {
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
          <TabContent
            tab={tab}
            layer={layer}
            locale={locale}
            onChange={onChange}
            layerContext={layerContext}
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
  readonly italic: boolean;
  readonly uppercase?: boolean;
  readonly align?: TextStyle['align'];
  readonly backdrop?: NonNullable<TextStyle['backdrop']>;
  readonly letterSpacing?: NonNullable<TextStyle['letterSpacing']>;
}

/**
 * Bold, italic, uppercase and an alignment button that cycles left, center and right, when they apply:
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
  const { font, bold, italic, uppercase, align, backdrop, letterSpacing } = format;
  return (
    <Row>
      <IconToggle
        icon={{ ios: 'bold', android: 'format_bold' }}
        label={t('style.bold')}
        selected={bold}
        disabled={!hasBold(font)}
        onPress={() => onPatch({ bold: !bold })}
      />
      {/* Every font can slant: those without an italic have their letters leaned. */}
      <IconToggle
        icon={{ ios: 'italic', android: 'format_italic' }}
        label={t('style.italic')}
        selected={italic}
        onPress={() => onPatch({ italic: !italic })}
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
function formatOf(layer: TextLayer | AnyChartLayer | BlockLayer): {
  readonly format: Format;
  readonly change: (patch: Partial<Format>) => StyleChange;
} {
  if (layer.kind === 'activityBlock' || layer.kind === 'summaryBlock') {
    // A block lays out its own texts: no alignment. A data widget can go on a backdrop and open
    // its letters up, as a text widget; a summary's too, but not its phrases (as an activity's).
    const { font, bold, italic, uppercase, backdrop, letterSpacing } = layer.style;
    return {
      format: {
        font,
        bold,
        italic: italic ?? false,
        uppercase,
        // A card is a backdrop already.
        ...((layer.kind === 'summaryBlock' && isSummaryDataWidget(layer.block.design)) ||
        (layer.kind === 'activityBlock' &&
          isDataWidget(layer.block.design) &&
          layer.block.design !== 'card')
          ? { backdrop: backdrop ?? 'none', letterSpacing: letterSpacing ?? 'normal' }
          : {}),
      },
      change: (patch) => (template) => setBlockOptions(template, layer.id, patch),
    };
  }
  if (layer.kind === 'summaryChart' || layer.kind === 'activityChart') {
    return {
      format: {
        font: layer.font,
        bold: layer.bold,
        italic: layer.italic ?? false,
        uppercase: layer.uppercase,
        align: layer.align,
      },
      change: (patch) => (template) => setChartOptions(template, layer.id, patch),
    };
  }
  const { font, bold, italic, uppercase, align, backdrop, letterSpacing } = layer.style;
  return {
    format: {
      font,
      bold,
      italic: italic ?? false,
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
  locale,
  onChange,
  layerContext,
}: {
  readonly tab: Tab;
  readonly layer: Layer;
  readonly locale: string;
  readonly onChange: (change: StyleChange) => void;
  readonly layerContext: LayerContext;
}) {
  const { t } = useTranslation();
  switch (tab) {
    case 'color':
      return <ColorPager layer={layer} onChange={onChange} />;
    case 'font':
    case 'format': {
      if (
        !isTextLayer(layer) &&
        layer.kind !== 'summaryChart' &&
        layer.kind !== 'activityChart' &&
        layer.kind !== 'activityBlock' &&
        layer.kind !== 'summaryBlock'
      ) {
        return null;
      }
      const { format, change } = formatOf(layer);
      return tab === 'font' ? (
        // Another font keeps the room the widget takes, not its letters' size.
        <FontRow
          font={format.font}
          onPick={(font) => onChange(keepingArea(change({ font }), layer.id, layerContext))}
        />
      ) : (
        <FormatRow format={format} onPatch={(patch) => onChange(change(patch))}>
          {layer.kind === 'metric' || layer.kind === 'summaryMetric' ? (
            <DataOptions layer={layer} onChange={onChange} />
          ) : layer.kind === 'summaryChart' ? (
            <Chip
              label={t('style.axisLabels')}
              selected={layer.axisLabels}
              onPress={() =>
                onChange((template) => setAxisLabels(template, layer.id, !layer.axisLabels))
              }
            />
          ) : layer.kind === 'activityBlock' || layer.kind === 'summaryBlock' ? (
            <Chip
              label={t('style.logo')}
              selected={layer.logo}
              onPress={() =>
                onChange((template) => setBlockOptions(template, layer.id, { logo: !layer.logo }))
              }
            />
          ) : undefined}
        </FormatRow>
      );
    }
    case 'width':
      return layer.kind === 'route' || layer.kind === 'summaryRoutes' ? (
        <LineRow layer={layer} onChange={onChange} />
      ) : null;
    case 'opacity':
      return <OpacityRow layer={layer} locale={locale} onChange={onChange} />;
    case 'tone':
      return layer.kind === 'logo' ? <LogoRow layer={layer} onChange={onChange} /> : null;
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
  const pager = useRef<ScrollViewInstance>(null);
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
function DataOptions({
  layer,
  onChange,
}: {
  readonly layer: Extract<Layer, { kind: 'metric' | 'summaryMetric' }>;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
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

/** The option after `current`, back to the first after the last. */
function nextOf<T>(options: readonly T[], current: T): T {
  return options[(options.indexOf(current) + 1) % options.length];
}

const WIDTHS = ['thin', 'medium', 'thick'] as const;

/**
 * A route's line width, from three sizes suited to one route or to a period's many. Solid,
 * dashed, dotted or glowing are widgets of their own in the gallery.
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

const LOGO_TONES = ['light', 'dark', 'color'] as const;

/**
 * The logo's tone. Its artwork (name, monogram or both) is a widget of its own in the gallery.
 */
function LogoRow({
  layer,
  onChange,
}: {
  readonly layer: LogoLayer;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  return (
    <Row>
      {LOGO_TONES.map((tone) => (
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
