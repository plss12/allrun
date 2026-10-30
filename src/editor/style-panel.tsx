import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { splitOpacity } from '@/core/color-menu';
import {
  layerColor,
  setAxisLabels,
  setBlockOptions,
  setChartOptions,
  setDataLabels,
  setImageFrame,
  setLayerColor,
  setLogoOptions,
  setStrokeWidth,
  setTextStyle,
  STROKE_WIDTHS,
  type TextStyle,
} from '@/core/layer-style';
import {
  BACKDROPS,
  FONT_IDS,
  IMAGE_FRAMES,
  isCapsOnly,
  type FontId,
  LETTER_SPACINGS,
  type Layer,
  type Template,
} from '@/core/template';
import { isAppReplica, isDataWidget } from '@/core/activity-block';
import { isSummaryDataWidget, isSummaryReplica } from '@/core/summary-block';
import { colors } from '@/theme/colors';

import { ColorMenu, OpacityBar } from './color-menu';
import { hasUnit } from './editor-data';
import { keepingArea } from './font-change';
import type { LayerContext } from './template-scene';
import { hasBold, looksBold, PREVIEW_FAMILIES, usePreviewFonts } from './fonts';

/** A style edit of the template, applied by the editor as one undo step. */
export type StyleChange = (template: Template) => Template;

type TextLayer = Extract<Layer, { kind: 'metric' | 'summaryMetric' | 'info' | 'text' }>;
type LineLayer = Extract<Layer, { kind: 'route' | 'summaryRoutes' }>;
/** A period's chart or an activity's: they share how their texts look. */
type AnyChartLayer = Extract<Layer, { kind: 'summaryChart' | 'activityChart' }>;
type LogoLayer = Extract<Layer, { kind: 'logo' }>;
type ImageLayer = Extract<Layer, { kind: 'image' }>;
type BlockLayer = Extract<Layer, { kind: 'activityBlock' | 'summaryBlock' }>;

/** A tool of the widget column that opens a panel: its letters (or a route's line), or its color. */
export type StyleTool = 'lettering' | 'color';

/** What goes behind a text. */
type Backdrop = NonNullable<TextStyle['backdrop']>;

/**
 * The tools of the widget column a layer has: only its look. What it shows and how (a time's
 * notation, a chart's average, a route's line…) is a variant of its own in the gallery: to change
 * it, the user replaces the widget.
 */
export interface WidgetTools {
  /** "Aa": its font and format; a route's line width instead; nothing for the others. */
  readonly lettering: 'text' | 'line' | null;
  /**
   * What the color button opens: the colors and the opacity; the logo's tones (only the brand's
   * colors) and the opacity; a picture's frames and the opacity; or, for a replica of an app,
   * which keeps the app's look, only the opacity.
   */
  readonly color: 'colors' | 'tones' | 'frames' | 'opacity';
  /**
   * What goes behind its text, and how to change it, when it can have one: in the color panel,
   * under the opacity.
   */
  readonly backdrop: {
    readonly value: Backdrop;
    readonly change: (backdrop: Backdrop) => StyleChange;
  } | null;
}

export function widgetTools(layer: Layer): WidgetTools {
  switch (layer.kind) {
    case 'route':
    case 'summaryRoutes':
      return { lettering: 'line', color: 'colors', backdrop: null };
    case 'logo':
      return { lettering: null, color: 'tones', backdrop: null };
    case 'image':
      return { lettering: null, color: 'frames', backdrop: null };
    case 'activityBlock':
    case 'summaryBlock': {
      const replica =
        layer.kind === 'activityBlock'
          ? isAppReplica(layer.block.design)
          : isSummaryReplica(layer.block.design);
      return replica
        ? { lettering: null, color: 'opacity', backdrop: null }
        : { lettering: 'text', color: 'colors', backdrop: backdropOf(layer) };
    }
    default:
      return { lettering: 'text', color: 'colors', backdrop: backdropOf(layer) };
  }
}

/** A layer's backdrop and how to change it, when it can have one. */
function backdropOf(layer: TextLayer | AnyChartLayer | BlockLayer): WidgetTools['backdrop'] {
  const { format, change } = formatOf(layer);
  return format.backdrop === undefined
    ? null
    : { value: format.backdrop, change: (backdrop) => change({ backdrop }) };
}

/** Height of a row of options. */
const OPTIONS_HEIGHT = 50;
const ROW_GAP = 6;

interface StylePanelProps {
  readonly layer: Layer;
  /** The column's tool whose options show. */
  readonly tool: StyleTool;
  readonly onChange: (change: StyleChange) => void;
  /** How the layer is drawn, to keep its size when its font changes (see `keepingArea`). */
  readonly layerContext: LayerContext;
  /** The widget's opacity while its bar is dragged, which the canvas draws. */
  readonly liveOpacity: SharedValue<number>;
  /** Called when the opacity bar starts being dragged. */
  readonly onOpacityStart: () => void;
  /** Called with the opacity chosen, once, when the bar is let go. */
  readonly onOpacity: (opacity: number) => void;
  readonly onEyedropper: () => void;
}

/**
 * The options of a tool of the widget column: the fonts over the format (or a route's line
 * widths), in rows; or the color menu with the text's backdrop under it (the logo's tones, or a
 * replica's opacity alone, instead). Every choice is one undo step.
 */
export function StylePanel({
  layer,
  tool,
  onChange,
  layerContext,
  liveOpacity,
  onOpacityStart,
  onOpacity,
  onEyedropper,
}: StylePanelProps) {
  const tools = widgetTools(layer);
  const opacityControl = {
    value: layer.opacity,
    live: liveOpacity,
    onStart: onOpacityStart,
    onEnd: onOpacity,
  };
  const color = layerColor(layer);
  if (tool === 'color' && tools.color === 'colors' && color !== null) {
    return (
      <ColorMenu
        color={splitOpacity(color).hex}
        onColor={(hex) => onChange((template) => setLayerColor(template, layer.id, hex))}
        opacity={opacityControl}
        onEyedropper={onEyedropper}
      >
        {tools.backdrop === null ? null : (
          <View style={{ height: OPTIONS_HEIGHT, justifyContent: 'center' }}>
            <BackdropRow backdrop={tools.backdrop} onChange={onChange} />
          </View>
        )}
      </ColorMenu>
    );
  }
  const opacity = <OpacityBar key="opacity" control={opacityControl} color="#FFFFFF" />;
  const rows = ((): ReactNode[] => {
    if (tool === 'color') {
      switch (tools.color) {
        case 'colors':
          return [opacity];
        case 'tones':
          return layer.kind === 'logo'
            ? [<LogoRow key="tones" layer={layer} onChange={onChange} />, opacity]
            : [opacity];
        case 'frames':
          return layer.kind === 'image'
            ? [<FrameRow key="frames" layer={layer} onChange={onChange} />, opacity]
            : [opacity];
        case 'opacity':
          return [opacity];
      }
    }
    if (layer.kind === 'route' || layer.kind === 'summaryRoutes') {
      return [<LineRow key="line" layer={layer} onChange={onChange} />];
    }
    if (tools.lettering !== 'text' || layer.kind === 'logo' || layer.kind === 'image') {
      return [];
    }
    const { format, change } = formatOf(layer);
    return [
      // Another font keeps the room the widget takes, not its letters' size.
      <FontRow
        key="font"
        font={format.font}
        onPick={(font) => onChange(keepingArea(change({ font }), layer.id, layerContext))}
      />,
      <FormatRow key="format" format={format} onPatch={(patch) => onChange(change(patch))}>
        <WidgetOptions layer={layer} onChange={onChange} />
      </FormatRow>,
    ];
  })();
  return (
    // Rows of fixed height: a row that shrank would let the next one cover it.
    <View style={{ gap: ROW_GAP }}>
      {rows.map((row, index) => (
        <View
          key={index}
          style={{ height: OPTIONS_HEIGHT, flexShrink: 0, justifyContent: 'center' }}
        >
          {row}
        </View>
      ))}
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
 * Bold, italic, uppercase, an alignment button that cycles left, center and right, and the letter
 * spacing, when they apply: free text has no uppercase (the user types the capitals they want).
 * The backdrop goes with the colors. After them, `children`: the widget's own options of what it
 * shows and how.
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
  const { font, bold, italic, uppercase, align, letterSpacing } = format;
  return (
    <Row>
      <IconToggle
        icon={{ ios: 'bold', android: 'format_bold' }}
        label={t('style.bold')}
        // A font without a bold face shows what it draws, and keeps it: heavy ones on, light off.
        selected={looksBold(font, bold)}
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
          // A font with capitals only always writes in them: the option shows on, and stays.
          selected={uppercase || isCapsOnly(font)}
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
      {children}
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

/** A widget's own options of what it shows, after its format, with a line before them. */
function WidgetOptions({
  layer,
  onChange,
}: {
  readonly layer: TextLayer | AnyChartLayer | BlockLayer;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  const options =
    layer.kind === 'metric' || layer.kind === 'summaryMetric' ? (
      <DataOptions layer={layer} onChange={onChange} />
    ) : layer.kind === 'summaryChart' ? (
      <Chip
        label={t('style.axisLabels')}
        selected={layer.axisLabels}
        onPress={() => onChange((template) => setAxisLabels(template, layer.id, !layer.axisLabels))}
      />
    ) : layer.kind === 'activityBlock' || layer.kind === 'summaryBlock' ? (
      <Chip
        label={t('style.logo')}
        selected={layer.logo}
        onPress={() =>
          onChange((template) => setBlockOptions(template, layer.id, { logo: !layer.logo }))
        }
      />
    ) : null;
  return options === null ? null : (
    <>
      <Divider />
      {options}
    </>
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

/** A picture's frame: none, light or dark (the brand's Chalk and Night Ink). */
function FrameRow({
  layer,
  onChange,
}: {
  readonly layer: ImageLayer;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  return (
    <Row>
      {IMAGE_FRAMES.map((frame) => (
        <Chip
          key={frame}
          label={t(`style.frames.${frame}`)}
          selected={layer.frame === frame}
          onPress={() => onChange((template) => setImageFrame(template, layer.id, frame))}
        />
      ))}
    </Row>
  );
}

/** What goes behind a text: nothing, a translucent band or a solid one, after its icon. */
function BackdropRow({
  backdrop,
  onChange,
}: {
  readonly backdrop: NonNullable<WidgetTools['backdrop']>;
  readonly onChange: (change: StyleChange) => void;
}) {
  const { t } = useTranslation();
  return (
    <Row>
      <View
        accessible
        accessibilityLabel={t('style.backdrop')}
        style={{ width: 28, alignItems: 'center' }}
      >
        <SymbolView
          name={{ ios: 'character.textbox', android: 'format_color_fill' }}
          size={20}
          tintColor={colors.secondaryLabel}
        />
      </View>
      {BACKDROPS.map((option) => (
        <Chip
          key={option}
          label={t(`style.backdrops.${option}`)}
          selected={backdrop.value === option}
          onPress={() => onChange(backdrop.change(option))}
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
  fontFamily,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly fontFamily?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
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
