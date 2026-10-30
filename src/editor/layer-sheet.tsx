import type { ParseKeys } from 'i18next';
import { Canvas, Group, Paint } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
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

import { SAMPLE_IMAGE } from '@/core/image-layer';
import type { CatalogItem, CatalogSection, NewLayer } from '@/core/layer-catalog';
import type { CanvasFormat, DesignLanguage, FontId, ImageFrame } from '@/core/template';
import { CARD_BORDER, cardSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';

import { CHOICE_TITLES, ChoiceList } from './choice-list';
import { layerText } from './editor-data';
import { disposeLater } from './paragraph-arena';
import { SheetFrame } from './sheet-frame';
import type { LayerContext } from './template-scene';
import {
  GALLERY_DOTS_HEIGHT,
  GALLERY_HINT_HEIGHT,
  GALLERY_GAP,
  GALLERY_PADDING,
  type GalleryPage,
  type GalleryWidget,
  buildGallery,
  type BuiltGallery,
} from './widget-gallery';

interface LayerSheetProps {
  readonly visible: boolean;
  readonly catalog: readonly CatalogSection[];
  /** The design's language: its verses, quotes and phrases are listed in it. */
  readonly language: DesignLanguage;
  /** Format and font of the design: each widget is drawn as it will be added. */
  readonly format: CanvasFormat;
  readonly font: FontId;
  readonly layerContext: LayerContext;
  /** Adds a widget; free text and pictures go through `onAddText` and `onAddImage` instead. */
  readonly onAdd: (item: Exclude<NewLayer, { kind: 'text' | 'image' }>) => void;
  /** Starts typing a new free text, straight on the canvas, once the sheet has closed. */
  readonly onAddText: () => void;
  /** Opens the photo library for a picture in `frame`, once the sheet has closed. */
  readonly onAddImage: (frame: ImageFrame) => void;
  readonly onClose: () => void;
}

type Block = Extract<NewLayer, { kind: 'activityBlock' }>['block'];
type SummaryBlock = Extract<NewLayer, { kind: 'summaryBlock' }>['block'];

/**
 * Widgets whose words are chosen from a list: a Bible verse, a quote, or a chat message's phrase
 * (or one of the user's), as the version tapped (a dark or a light message), of an activity or of
 * a period.
 */
type Choice =
  | {
      readonly kind: 'activityBlock';
      readonly block: Extract<Block, { design: 'verse' | 'quote' | 'chat' }>;
    }
  | {
      readonly kind: 'summaryBlock';
      readonly block: Extract<SummaryBlock, { design: 'verse' | 'quote' }>;
    };
type ChoiceBlock = Choice['block'];

/** The list a gallery item is chosen from, if it is. */
function choiceOf(item: CatalogItem): Choice | null {
  if (
    item.kind === 'activityBlock' &&
    (item.block.design === 'verse' || item.block.design === 'quote' || item.block.design === 'chat')
  ) {
    return { kind: item.kind, block: item.block };
  }
  if (
    item.kind === 'summaryBlock' &&
    (item.block.design === 'verse' || item.block.design === 'quote')
  ) {
    return { kind: item.kind, block: item.block };
  }
  return null;
}

/** The widget a choice from the list adds: of the same kind as the one tapped. */
function chosenLayer(
  kind: Choice['kind'],
  block: ChoiceBlock,
): Exclude<NewLayer, { kind: 'text' | 'image' }> {
  return kind === 'summaryBlock' && block.design !== 'chat'
    ? { kind, block }
    : { kind: 'activityBlock', block };
}

/**
 * What a gallery shows of its data, as a key: the same activity or period with the same detail
 * and place, or the same totals and sports, draws the same gallery.
 */
function galleryDataKey(data: LayerContext['data']): string {
  return data.mode === 'activity'
    ? [
        data.activity.id,
        data.detail === null ? '' : 'detail',
        data.place?.city ?? '',
        data.zones === null ? '' : 'zones',
      ].join(':')
    : [
        data.kind,
        data.summary.range.start,
        data.summary.range.end,
        data.summary.activityCount,
        data.families.join(','),
        data.current ? 'current' : '',
      ].join(':');
}

/**
 * The gallery's sections while `open`, laid out once for each `key` (what it draws), not again
 * at each render; and nothing while closed. A gallery holds hundreds of native paragraphs: the
 * one replaced, or the one shown when it closes, is freed once the screen stops drawing it (see
 * `disposeLater`), so opening it again and again doesn't pile them up.
 */
function useGallery(
  open: boolean,
  key: string,
  build: () => BuiltGallery,
): BuiltGallery['sections'] {
  const [laidOut, setLaidOut] = useState<{
    readonly key: string;
    readonly gallery: BuiltGallery;
  } | null>(null);
  const wanted = open ? key : null;
  const current =
    wanted === (laidOut?.key ?? null)
      ? laidOut
      : wanted === null
        ? null
        : { key: wanted, gallery: build() };
  if (current !== laidOut) {
    setLaidOut(current);
  }
  // A render that lays out a new gallery is redone at once with it stored: what the screen shows
  // is always the one stored, freed when replaced or when the sheet goes.
  useEffect(() => {
    if (laidOut === null) {
      return undefined;
    }
    return () => disposeLater(laidOut.gallery.dispose);
  }, [laidOut]);
  return current?.gallery.sections ?? [];
}

/**
 * Sheet to add a widget: a gallery of every widget drawn live with the user's data, in sections,
 * each tile scrolling sideways through the widget's variants (see `widget-gallery.ts`). A tap
 * adds the variant shown; a verse, a quote or a chat message's phrase is chosen first from its
 * list.
 */
export function LayerSheet({
  visible,
  catalog,
  format,
  font,
  layerContext,
  language,
  onAdd,
  onAddText,
  onAddImage,
  onClose,
}: LayerSheetProps) {
  const { t } = useTranslation();
  const window = useWindowDimensions();
  const [choosing, setChoosing] = useState<Choice | null>(null);
  const close = () => {
    setChoosing(null);
    onClose();
  };
  // iOS opens no keyboard nor the photo library while a sheet is on screen: free text and
  // pictures start once it has slid away. Android has no dismiss callback, and no such limit.
  const pending = useRef<(() => void) | null>(null);
  const afterClosing = (start: () => void) => {
    close();
    if (Platform.OS === 'ios') {
      pending.current = start;
    } else {
      start();
    }
  };
  const textSample = t('gallery.textSample');
  const sections = useGallery(
    visible,
    [
      galleryDataKey(layerContext.data),
      catalog.map((section) => section.widgets.map((widget) => widget.key).join(',')).join(';'),
      format,
      font,
      layerContext.textContext.unit,
      layerContext.textContext.locale,
      // The sample picture, once decoded.
      layerContext.images?.get(SAMPLE_IMAGE)?.image == null ? '' : 'sample',
      window.width,
      textSample,
    ].join('|'),
    () => buildGallery(catalog, format, font, layerContext, window.width, textSample),
  );
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      // Android shows it full screen: drawn under the system bars, padded by their insets.
      statusBarTranslucent
      navigationBarTranslucent
      // Android's back button leaves a list for the gallery first.
      onRequestClose={() => (choosing === null ? close() : setChoosing(null))}
      onDismiss={() => {
        const start = pending.current;
        pending.current = null;
        start?.();
      }}
    >
      {choosing !== null ? (
        <SheetFrame
          title={t(CHOICE_TITLES[choosing.block.design])}
          closeLabel={t('editor.back')}
          onClose={() => setChoosing(null)}
        >
          <ChoiceList
            words={choosing.block}
            language={language}
            onChoose={(block) => {
              setChoosing(null);
              onAdd(chosenLayer(choosing.kind, block));
            }}
          />
        </SheetFrame>
      ) : (
        <SheetFrame title={t('editor.addLayer')} closeLabel={t('editor.close')} onClose={close}>
          <SectionList
            sections={sections.map((section) => ({ id: section.id, data: section.rows }))}
            keyExtractor={(row) => row.widgets.map((widget) => widget.key).join(' ')}
            stickySectionHeadersEnabled={false}
            initialNumToRender={8}
            // Rows two screens away are let go: each tile draws on a canvas of its own.
            windowSize={5}
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
                    label={(page) => pageLabel(page, layerContext, (key) => t(key))}
                    hint={
                      choiceOf(widget.pages[0].item) === null &&
                      widget.pages[0].item.kind !== 'image'
                        ? undefined
                        : t('gallery.choose')
                    }
                    onPress={(page) => {
                      const { item } = page;
                      const choice = choiceOf(item);
                      if (choice !== null) {
                        setChoosing(choice);
                      } else if (item.kind === 'text') {
                        afterClosing(onAddText);
                      } else if (item.kind === 'image') {
                        afterClosing(() => onAddImage(item.frame));
                      } else {
                        onAdd(item);
                      }
                    }}
                  />
                ))}
              </View>
            )}
          />
        </SheetFrame>
      )}
    </Modal>
  );
}

/**
 * What a screen reader says for a page: the widget's name and, for a text, what it shows ("Date,
 * 14 Oct"); for the other widgets, their variant ("Route, Dashed", "Splits, Pace"). It translates
 * with a function of the keys alone: i18next's own `t`, inferring every key built here against
 * all the app's texts, grows too deep for the compiler.
 */
function pageLabel(
  { item, prepared }: GalleryPage,
  context: LayerContext,
  t: (key: ParseKeys) => string,
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
          t(`gallery.chartLooks.${item.look}`),
          flag(item.totals === 2, t('gallery.chartLooks.twoTotals')),
          item.bucket === undefined || item.bucket === 'auto'
            ? ''
            : t(`gallery.buckets.${item.bucket}`),
          flag(item.barValues, t('gallery.values')),
          flag(item.averageLine, t('gallery.average')),
          flag(item.header === false, t('gallery.named')),
        ];
      case 'activityChart':
        return [
          t(`activityCharts.${item.series}`),
          ...(item.series !== 'splits'
            ? []
            : item.splitPace === false
              ? [t('gallery.noValues')]
              : [
                  t('gallery.pace'),
                  flag(item.splitElevation, t('gallery.elevation')),
                  flag(item.splitHeartRate, t('gallery.heartRate')),
                ]),
          item.zones === undefined ? '' : t(`gallery.zones.${item.zones}`),
          flag(item.averageLine, t('gallery.average')),
          flag(item.header === false, t('gallery.named')),
        ];
      case 'logo':
        return [t('widgets.allrunLogo'), t(`gallery.variants.${item.variant}`)];
      case 'image':
        return [t('widgets.image'), t(`style.frames.${item.frame}`)];
      case 'activityBlock': {
        const { block } = item;
        const name: string = t(`widgets.blocks.${block.design}`);
        if (block.design === 'verse') {
          return [name, t(`widgets.verses.${block.verse}.source`)];
        }
        if (block.design === 'quote') {
          return [name, t(`widgets.quotes.${block.quote}.author`)];
        }
        if (block.design === 'chat') {
          return [
            name,
            t(`gallery.blockLayouts.${block.layout}`),
            typeof block.phrase === 'string'
              ? t(`widgets.phrases.${block.phrase}`)
              : block.phrase.own,
          ];
        }
        if (!('layout' in block)) {
          return [name];
        }
        return [
          name,
          t(`gallery.blockLayouts.${block.layout}`),
          'top' in block && block.top === 'time' ? t('gallery.timeOnTop') : '',
        ];
      }
      case 'summaryBlock': {
        const { block } = item;
        const name: string = t(`widgets.summaryBlocks.${block.design}`);
        if (block.design === 'verse') {
          return [name, t(`widgets.verses.${block.verse}.source`)];
        }
        if (block.design === 'quote') {
          return [name, t(`widgets.quotes.${block.quote}.author`)];
        }
        if (block.design === 'periodNotes') {
          return [
            name,
            t(`gallery.blockLayouts.${block.layout}`),
            t(`gallery.noteRows.${block.rows}`),
          ];
        }
        return [
          name,
          block.design === 'periodData'
            ? t(`gallery.dataCounts.${(['one', 'two', 'three'] as const)[block.count - 1]}`)
            : block.design === 'periodTable'
              ? t(`widgets.${block.value === 'distance' ? 'distanceChart' : 'timeChart'}`)
              : 'layout' in block
                ? t(`gallery.blockLayouts.${block.layout}`)
                : '',
        ];
      }
    }
  })();
  return parts.filter((part) => part !== '').join(', ');
}

/**
 * A widget's tile: its variants side by side, one page each, scrolled sideways, with a dot per
 * page under them. A tap adds the variant on the page; a widget chosen from a list says so with
 * its `hint` at the bottom.
 */
function WidgetTile({
  widget,
  width,
  height,
  label,
  hint,
  onPress,
}: {
  readonly widget: GalleryWidget;
  readonly width: number;
  readonly height: number;
  readonly label: (page: GalleryPage) => string;
  readonly hint?: string;
  readonly onPress: (page: GalleryPage) => void;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(0);
  const several = widget.pages.length > 1;
  // Pages as wide as the inside of the card's edge, which is what the pager pages by.
  const pageWidth = width - 2 * CARD_BORDER;
  const pageHeight = height - 2 * CARD_BORDER;
  /**
   * A picture's sample photo leaves room for its hint over the dots, which would cover it (see
   * `GALLERY_HINT_HEIGHT`); other widgets sit as high as in the tiles next to them, the hint going
   * where the dots would, or over them without taking room.
   */
  const canvasHeight = widget.pages.some(({ item }) => item.kind === 'image')
    ? pageHeight - GALLERY_DOTS_HEIGHT - GALLERY_HINT_HEIGHT
    : several || hint !== undefined
      ? pageHeight - GALLERY_DOTS_HEIGHT
      : pageHeight;
  return (
    <View
      style={{
        ...cardSurface(14),
        width,
        height,
        overflow: 'hidden',
      }}
    >
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={several}
        // The dot follows the finger, not only the end of the swipe.
        scrollEventThrottle={16}
        onScroll={(event) =>
          setShown(pageAt(event.nativeEvent.contentOffset.x, pageWidth, widget.pages.length))
        }
      >
        {widget.pages.map((page, i) => (
          <Pressable
            key={page.key}
            accessibilityRole="button"
            accessibilityLabel={label(page)}
            accessibilityHint={hint ?? (several ? t('gallery.moreVariants') : undefined)}
            accessibilityElementsHidden={i !== shown}
            importantForAccessibility={i === shown ? 'auto' : 'no-hide-descendants'}
            onPress={() => onPress(page)}
            style={({ pressed }) => ({
              width: pageWidth,
              height: pageHeight,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            {
              // Only the page shown and those beside it, which a swipe brings in, have a canvas:
              // each one holds GPU memory, and a gallery has over a hundred pages.
              Math.abs(i - shown) <= 1 ? (
                <PageCanvas page={page} width={pageWidth} height={canvasHeight} />
              ) : null
            }
          </Pressable>
        ))}
      </ScrollView>
      {hint !== undefined ? (
        <View
          pointerEvents="none"
          // Over the dots, when there are some.
          style={{
            position: 'absolute',
            bottom: several ? GALLERY_DOTS_HEIGHT + 2 : 6,
            left: 0,
            right: 0,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: '600',
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 8,
              overflow: 'hidden',
              backgroundColor: 'rgba(255, 255, 255, 0.18)',
            }}
          >
            {hint}
          </Text>
        </View>
      ) : null}
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

/** The page of a pager `width` wide mostly on screen at `offset`, within its `count` pages. */
function pageAt(offset: number, width: number, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.round(offset / width)));
}
