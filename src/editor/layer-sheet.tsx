import { Canvas, Group, Paint } from '@shopify/react-native-skia';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Platform,
  Pressable,
  SectionList,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import type { CatalogSection, NewLayer } from '@/core/layer-catalog';
import type { CanvasFormat, FontId } from '@/core/template';
import { colors } from '@/theme/colors';

import { layerText } from './editor-data';
import { SheetFrame } from './sheet-frame';
import type { LayerContext } from './template-scene';
import { GALLERY_GAP, GALLERY_PADDING, type GalleryTile, gallerySections } from './widget-gallery';

interface LayerSheetProps {
  readonly visible: boolean;
  readonly catalog: readonly CatalogSection[];
  /** Format and font of the design: each widget is drawn as it will be added. */
  readonly format: CanvasFormat;
  readonly font: FontId;
  readonly layerContext: LayerContext;
  /** Adds a widget; free text goes through `onAddText` instead. */
  readonly onAdd: (item: Exclude<NewLayer, { kind: 'text' }>) => void;
  /** Starts typing a new free text, straight on the canvas, once the sheet has closed. */
  readonly onAddText: () => void;
  readonly onClose: () => void;
}

/**
 * Behind each widget: dark, like the editor's checkerboard, so the white widgets read; Chalk for
 * the dark and colored logos. The same in both themes, as a photo would be.
 */
const TILE_BACKGROUNDS = { dark: '#1C1C1E', light: '#F6F1EA' } as const;

/**
 * Sheet to add a widget: a gallery of every widget, and each of its variants, drawn live with
 * the user's data, in sections (see `widget-gallery.ts`). A tap adds the one shown.
 */
export function LayerSheet({
  visible,
  catalog,
  format,
  font,
  layerContext,
  onAdd,
  onAddText,
  onClose,
}: LayerSheetProps) {
  const { t } = useTranslation();
  const window = useWindowDimensions();
  // iOS opens no keyboard while a sheet is on screen: free text starts once it has slid away.
  // Android has no dismiss callback, and no such limit.
  const textPending = useRef(false);
  const addText = () => {
    onClose();
    if (Platform.OS === 'ios') {
      textPending.current = true;
    } else {
      onAddText();
    }
  };
  // Measured only while open: the sheet is closed most of the time.
  const sections = visible
    ? gallerySections(catalog, format, font, layerContext, window.width, t('gallery.textSample'))
    : [];
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      // Android shows it full screen: drawn under the system bars, padded by their insets.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onDismiss={() => {
        if (textPending.current) {
          textPending.current = false;
          onAddText();
        }
      }}
    >
      <SheetFrame title={t('editor.addLayer')} closeLabel={t('editor.close')} onClose={onClose}>
        <SectionList
          sections={sections}
          keyExtractor={(row) => row.map((tile) => tile.key).join(' ')}
          stickySectionHeadersEnabled={false}
          initialNumToRender={8}
          contentContainerStyle={{ paddingHorizontal: GALLERY_PADDING, paddingBottom: 32 }}
          renderSectionHeader={({ section }) => (
            <Text
              accessibilityRole="header"
              style={{
                color: colors.secondaryLabel,
                fontSize: 13,
                fontWeight: '600',
                paddingTop: 16,
                paddingBottom: 8,
              }}
            >
              {t(`widgets.sections.${section.id}`).toLocaleUpperCase()}
            </Text>
          )}
          renderItem={({ item: row, section }) => (
            <View style={{ flexDirection: 'row', gap: GALLERY_GAP, marginBottom: GALLERY_GAP }}>
              {row.map((tile) => (
                <TileButton
                  key={tile.key}
                  tile={tile}
                  width={section.width}
                  height={section.height}
                  label={tileLabel(tile, layerContext, t)}
                  onPress={() => {
                    if (tile.item.kind === 'text') {
                      addText();
                    } else {
                      onAdd(tile.item);
                    }
                  }}
                />
              ))}
            </View>
          )}
        />
      </SheetFrame>
    </Modal>
  );
}

/**
 * What a screen reader says for a tile: the widget's name and, for a text, what it shows ("Date,
 * 14 Oct"); for the other widgets, their variant ("Route, Dashed", "Splits, Rows, Pace").
 */
function tileLabel(
  { item, prepared }: GalleryTile,
  context: LayerContext,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const shown = layerText(prepared.layer, context.data, context.textContext)?.value ?? '';
  const flag = (on: boolean | undefined, label: string) => (on === true ? label : '');
  const parts = ((): string[] => {
    switch (item.kind) {
      case 'metric':
        return [t(`metrics.${item.metric}`), shown];
      case 'summaryMetric':
        return [t(`summaryMetrics.${item.metric}`), shown];
      case 'info':
        return [t(`widgets.${item.field}`), shown];
      case 'text':
        return [t('widgets.text')];
      case 'route':
      case 'summaryRoutes':
        return [
          t(`widgets.${item.kind}`),
          t(`gallery.lineStyles.${item.line ?? 'solid'}`),
          flag(item.glow, t('gallery.glow')),
        ];
      case 'summaryChart':
        return [
          t(`widgets.sections.${item.value === 'distance' ? 'distanceChart' : 'timeChart'}`),
          item.bucket === undefined || item.bucket === 'auto'
            ? ''
            : t(`gallery.buckets.${item.bucket}`),
          flag(item.barValues, t('gallery.values')),
          flag(item.averageLine, t('gallery.average')),
        ];
      case 'activityChart':
        return [
          t(`activityCharts.${item.series}`),
          ...(item.series === 'splits'
            ? [
                item.splitPace === false
                  ? t('gallery.noValues')
                  : t(item.splitElevation === true ? 'gallery.paceAndElevation' : 'gallery.pace'),
              ]
            : []),
          flag(item.maxLabel, t('gallery.peak')),
          flag(item.averageLine, t('gallery.average')),
        ];
      case 'logo':
        return [
          t('widgets.allrunLogo'),
          t(`gallery.variants.${item.variant}`),
          t(`style.tones.${item.tone ?? 'light'}`),
        ];
    }
  })();
  return parts.filter((part) => part !== '').join(', ');
}

/** A widget drawn in its tile, centered; a tap adds it. */
function TileButton({
  tile,
  width,
  height,
  label,
  onPress,
}: {
  readonly tile: GalleryTile;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const { layer, content } = tile.prepared;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        height,
        borderRadius: 10,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: TILE_BACKGROUNDS[tile.background],
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Canvas style={{ width, height }}>
        <Group
          transform={[{ translateX: width / 2 }, { translateY: height / 2 }, { scale: tile.scale }]}
          layer={layer.opacity < 1 ? <Paint opacity={layer.opacity} /> : undefined}
        >
          {content}
        </Group>
      </Canvas>
    </Pressable>
  );
}
