import { Canvas, Group, Paint } from '@shopify/react-native-skia';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
import {
  GALLERY_DOTS_HEIGHT,
  GALLERY_GAP,
  GALLERY_PADDING,
  type GalleryPage,
  type GalleryWidget,
  gallerySections,
} from './widget-gallery';

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

/** Behind each widget: dark, like the editor's checkerboard, so the white widgets read. */
const TILE_BACKGROUND = '#1C1C1E';

/**
 * Sheet to add a widget: a gallery of every widget drawn live with the user's data, in sections,
 * each tile scrolling sideways through the widget's variants (see `widget-gallery.ts`). A tap
 * adds the variant shown.
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
          sections={sections.map((section) => ({ id: section.id, data: section.rows }))}
          keyExtractor={(row) => row.widgets.map((widget) => widget.key).join(' ')}
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
          renderItem={({ item: row }) => (
            <View style={{ flexDirection: 'row', gap: GALLERY_GAP, marginBottom: GALLERY_GAP }}>
              {row.widgets.map((widget) => (
                <WidgetTile
                  key={widget.key}
                  widget={widget}
                  width={row.width}
                  height={row.height}
                  label={(page) => pageLabel(page, layerContext, t)}
                  onPress={(page) => {
                    if (page.item.kind === 'text') {
                      addText();
                    } else {
                      onAdd(page.item);
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
 * What a screen reader says for a page: the widget's name and, for a text, what it shows ("Date,
 * 14 Oct"); for the other widgets, their variant ("Route, Dashed", "Splits, Pace").
 */
function pageLabel(
  { item, prepared }: GalleryPage,
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
          t(`widgets.${item.value === 'distance' ? 'distanceChart' : 'timeChart'}`),
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
        return [t('widgets.allrunLogo'), t(`gallery.variants.${item.variant}`)];
    }
  })();
  return parts.filter((part) => part !== '').join(', ');
}

/**
 * A widget's tile: its variants side by side, one page each, scrolled sideways, with a dot per
 * page under them. A tap adds the variant on the page.
 */
function WidgetTile({
  widget,
  width,
  height,
  label,
  onPress,
}: {
  readonly widget: GalleryWidget;
  readonly width: number;
  readonly height: number;
  readonly label: (page: GalleryPage) => string;
  readonly onPress: (page: GalleryPage) => void;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(0);
  const several = widget.pages.length > 1;
  return (
    <View
      style={{
        width,
        height,
        borderRadius: 10,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: TILE_BACKGROUND,
      }}
    >
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={several}
        onMomentumScrollEnd={(event) =>
          setShown(Math.round(event.nativeEvent.contentOffset.x / width))
        }
      >
        {widget.pages.map((page, i) => (
          <Pressable
            key={page.key}
            accessibilityRole="button"
            accessibilityLabel={label(page)}
            accessibilityHint={several ? t('gallery.moreVariants') : undefined}
            accessibilityElementsHidden={i !== shown}
            importantForAccessibility={i === shown ? 'auto' : 'no-hide-descendants'}
            onPress={() => onPress(page)}
            style={({ pressed }) => ({ width, height, opacity: pressed ? 0.6 : 1 })}
          >
            <PageCanvas
              page={page}
              width={width}
              height={several ? height - GALLERY_DOTS_HEIGHT : height}
            />
          </Pressable>
        ))}
      </ScrollView>
      {several ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 6,
            left: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 5,
          }}
        >
          {widget.pages.map((page, i) => (
            <View
              key={page.key}
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: i === shown ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)',
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A variant drawn centered in its page, at its tile's scale. */
function PageCanvas({
  page,
  width,
  height,
}: {
  readonly page: GalleryPage;
  readonly width: number;
  readonly height: number;
}) {
  const { layer, content } = page.prepared;
  return (
    <Canvas style={{ width, height }}>
      <Group
        transform={[{ translateX: width / 2 }, { translateY: height / 2 }, { scale: page.scale }]}
        layer={layer.opacity < 1 ? <Paint opacity={layer.opacity} /> : undefined}
      >
        {content}
      </Group>
    </Canvas>
  );
}
