import type { ParseKeys } from 'i18next';
import { Group, Paint } from '@shopify/react-native-skia';
import { memo, type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, SectionList, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { CatalogItem, CatalogSection, NewLayer } from '@/core/layer-catalog';
import { type PhraseKind, phraseLanguage, phraseWords } from '@/core/phrases';
import { BUILT_IN_PHRASES } from '@/core/phrases-built-in';
import type { CanvasFormat, DesignLanguage, FontId, Layer } from '@/core/template';
import { CARD_BORDER, cardSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';
import { CardGradient } from '@/ui/card-gradient';
import { renderSheetScroll, Sheet } from '@/ui/sheet';
import { LoadingView } from '@/ui/state-views';
import { Text } from '@/ui/text';

import { CHOICE_TITLES, ChoiceList } from './choice-list';
import { layerText } from './editor-data';
import { disposeLater } from './paragraph-arena';
import { stockImages, type StockPhotos, withStockPicture } from './stock-photos';
import { SheetFrame } from './sheet-frame';
import type { LayerContext } from './template-scene';
import {
  GALLERY_DOTS_HEIGHT,
  GALLERY_HINT_HEIGHT,
  GALLERY_GAP,
  GALLERY_PADDING,
  type GalleryPage,
  type GalleryWidget,
  type GalleryBuild,
  type GallerySection,
  startGalleryBuild,
  hintBottom,
} from './widget-gallery';

/** How a picture added from the gallery looks: its frame, and an instant photo's caption. */
export type PictureLook = Pick<
  Extract<Layer, { kind: 'image' }>,
  'frame' | 'caption' | 'mount' | 'cover'
>;

interface LayerSheetProps {
  readonly visible: boolean;
  readonly catalog: readonly CatalogSection[];
  /** The design's language: its verses, quotes and phrases are listed in it. */
  readonly language: DesignLanguage;
  /** Format and font of the design: each widget is drawn as it will be added. */
  readonly format: CanvasFormat;
  readonly font: FontId;
  readonly layerContext: LayerContext;
  /** The stock photos its tiles of pictures show, once decoded. */
  readonly stock: StockPhotos | null;
  /** Adds a widget; free text and pictures go through `onAddText` and `onAddImage` instead. */
  readonly onAdd: (item: Exclude<NewLayer, { kind: 'text' | 'image' }>) => void;
  /** Starts typing a new free text, straight on the canvas, once the sheet has closed. */
  readonly onAddText: () => void;
  /**
   * Opens the photo library for a picture in `frame`, or an instant photo with `caption`, once
   * the sheet has closed.
   */
  readonly onAddImage: (look: PictureLook) => void;
  readonly onClose: () => void;
}

type Block = Extract<NewLayer, { kind: 'activityBlock' }>['block'];
type SummaryBlock = Extract<NewLayer, { kind: 'summaryBlock' }>['block'];

/**
 * Widgets whose words are chosen from a list: a Bible verse, a quote, or a chat message's phrase
 * (or one of the user's), as the version tapped (a dark or a light message), of an activity or of
 * a period.
 */
export type Choice =
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
export function choiceOf(item: CatalogItem): Choice | null {
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
export function chosenLayer(
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
export function galleryDataKey(data: LayerContext['data']): string {
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

/** How long a step of laying out a gallery keeps the JavaScript thread, in milliseconds. */
const STEP_MS = 8;
/** How long after the editor opens its gallery starts to be laid out: once it has settled. */
const LAY_OUT_AHEAD_AFTER_MS = 600;

/**
 * The gallery's sections while `open`, laid out once for each `key` (what it draws), a little at a
 * time so that the screen keeps responding, section by section the first time; and nothing while
 * closed. A gallery holds hundreds of native paragraphs: the one replaced, or the one shown when it
 * closes, is freed once the screen stops drawing it (see `disposeLater`), so opening it again and
 * again doesn't pile them up.
 */
export function useGallery(
  open: boolean,
  key: string,
  start: () => GalleryBuild,
): readonly GallerySection[] {
  const [sections, setSections] = useState<readonly GallerySection[]>([]);
  /** The gallery the screen shows, which is freed only once another replaces it or it closes. */
  const shown = useRef<GalleryBuild | null>(null);
  const wanted = open ? key : null;
  // Closing lets go of it in this same render: nothing may draw it once it is being freed.
  const [wantedBefore, setWantedBefore] = useState(wanted);
  if (wanted !== wantedBefore) {
    setWantedBefore(wanted);
    if (wanted === null) {
      setSections([]);
    }
  }
  useEffect(() => {
    if (wanted === null) {
      return undefined;
    }
    const build = start();
    const previous = shown.current;
    let timer: ReturnType<typeof setTimeout>;
    const stepOn = () => {
      const { sections: built, grew, done } = build.step(STEP_MS);
      // The first time, section by section as they are ready. A change of look stays on the gallery
      // shown until it can go whole: a list that grows again would lose its place.
      if (done ? previous !== null || grew : grew && previous === null) {
        setSections(built);
        shown.current = build;
        if (done && previous !== null) {
          disposeLater(previous.dispose);
        }
      }
      if (!done) {
        timer = setTimeout(stepOn, 0);
      }
    };
    timer = setTimeout(stepOn, 0);
    return () => {
      clearTimeout(timer);
      if (shown.current !== build) {
        disposeLater(build.dispose);
      }
    };
    // The key says what it lays out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  // Closed, or gone: nothing draws it anymore.
  useEffect(() => {
    if (wanted !== null) {
      return undefined;
    }
    const closed = shown.current;
    shown.current = null;
    if (closed !== null) {
      disposeLater(closed.dispose);
    }
    return undefined;
  }, [wanted]);
  useEffect(
    () => () => {
      const last = shown.current;
      shown.current = null;
      if (last !== null) {
        disposeLater(last.dispose);
      }
    },
    [],
  );
  return sections;
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
  stock,
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
  // Free text and pictures start as the sheet closes: it is ours, not a native modal, so the
  // keyboard and the photo library can come over it at once.
  const afterClosing = (start: () => void) => {
    close();
    start();
  };
  // The list is memoized: what it calls reads the latest props through these, so that the editor's
  // renders, which make new handlers and a new context each time, don't draw it again.
  const latest = useRef({ layerContext, onAdd, onAddText, onAddImage, afterClosing });
  useEffect(() => {
    latest.current = { layerContext, onAdd, onAddText, onAddImage, afterClosing };
  });
  const label = useCallback(
    (page: GalleryPage) => pageLabel(page, latest.current.layerContext, (key) => t(key)),
    [t],
  );
  const onPress = useCallback((page: GalleryPage) => {
    const { item } = page;
    const now = latest.current;
    const choice = choiceOf(item);
    if (choice !== null) {
      setChoosing(choice);
    } else if (item.kind === 'text') {
      now.afterClosing(now.onAddText);
    } else if (item.kind === 'image') {
      now.afterClosing(() => now.onAddImage(item));
    } else {
      now.onAdd(item);
    }
  }, []);
  const textSample = t('gallery.textSample');
  // Laid out ahead of time, a little at a time, and kept while the editor is open: so that "+" shows
  // it at once, and every time.
  const [ahead, setAhead] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setAhead(true), LAY_OUT_AHEAD_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  const sections = useGallery(
    visible || ahead,
    [
      galleryDataKey(layerContext.data),
      catalog.map((section) => section.widgets.map((widget) => widget.key).join(',')).join(';'),
      format,
      font,
      layerContext.textContext.unit,
      layerContext.textContext.locale,
      // The stock photos, once decoded.
      stock === null ? '' : 'stock',
      window.width,
      textSample,
    ].join('|'),
    () =>
      startGalleryBuild(
        catalog,
        format,
        font,
        {
          ...layerContext,
          images: stock === null ? new Map() : stockImages(stock),
          restyle: withStockPicture,
        },
        window.width,
        textSample,
      ),
  );
  // The gallery stays under a verse's or a quote's list, so that going back shows it at once.
  const content = (
    <View style={{ flex: 1 }}>
      <SheetFrame title={t('editor.addLayer')} closeLabel={t('editor.close')} onClose={close}>
        <WidgetGalleryList sections={sections} label={label} onPress={onPress} />
      </SheetFrame>
      {choosing !== null ? (
        <View style={StyleSheet.absoluteFill}>
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
        </View>
      ) : null}
    </View>
  );
  return (
    <Sheet
      visible={visible}
      onClose={close}
      // Android's back leaves a list for the gallery first.
      onBack={() => (choosing === null ? close() : setChoosing(null))}
      // Kept with its tiles while the editor is open: opening it again shows it at once, where it
      // was, and closing it doesn't destroy each tile's canvas (ADR 015).
      keepMounted
    >
      {content}
    </Sheet>
  );
}

/**
 * The gallery's sections as a list of rows of tiles, a tile scrolling sideways through its
 * variants. A tap does `onPress` with the variant shown, and a long press `onLongPress`, which a
 * screen reader offers as an action named `longPressLabel`. `header` goes on top, scrolling with
 * the list, which starts `topInset` points down so that it can pass under a screen's header.
 */
export const WidgetGalleryList = memo(function WidgetGalleryList({
  sections,
  label,
  onPress,
  onLongPress,
  longPressLabel,
  header,
  topInset = 0,
}: {
  readonly sections: readonly GallerySection[];
  /** What a screen reader says for a page (see `pageLabel`). */
  readonly label: (page: GalleryPage) => string;
  readonly onPress: (page: GalleryPage) => void;
  readonly onLongPress?: (page: GalleryPage) => void;
  readonly longPressLabel?: string;
  readonly header?: ReactElement;
  readonly topInset?: number;
}) {
  const { t } = useTranslation();
  return (
    <SectionList
      // In a sheet, scrolled to its top, pulling down drags the sheet.
      renderScrollComponent={renderSheetScroll}
      ListHeaderComponent={header}
      sections={sections.map((section) => ({ id: section.id, data: section.rows }))}
      keyExtractor={(row) => row.widgets.map((widget) => widget.key).join(' ')}
      stickySectionHeadersEnabled={false}
      // As many rows as fill the screen, then a few at a time: each tile is a canvas to create.
      initialNumToRender={3}
      maxToRenderPerBatch={1}
      // Rows three screens away are let go, each tile being a canvas of its own. Nearer ones stay:
      // on Android, taking a canvas off the screen destroys its surface, and it had to draw again
      // each time it came back, so that tiles vanished and came back one by one.
      windowSize={3}
      removeClippedSubviews={false}
      ListEmptyComponent={<LoadingView />}
      contentContainerStyle={{
        paddingHorizontal: GALLERY_PADDING,
        paddingTop: topInset,
        paddingBottom: 32,
      }}
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
              label={label}
              hint={
                choiceOf(widget.pages[0].item) === null && widget.pages[0].item.kind !== 'image'
                  ? undefined
                  : t('gallery.choose')
              }
              onPress={onPress}
              onLongPress={onLongPress}
              longPressLabel={longPressLabel}
            />
          ))}
        </View>
      )}
    />
  );
});

/**
 * What a screen reader says for a page: the widget's name and, for a text, what it shows ("Date,
 * 14 Oct"); for the other widgets, their variant ("Route, Dashed", "Splits, Pace"). It translates
 * with a function of the keys alone: i18next's own `t`, inferring every key built here against
 * all the app's texts, grows too deep for the compiler.
 */
export function pageLabel(
  { item, prepared }: GalleryPage,
  context: LayerContext,
  t: (key: ParseKeys) => string,
): string {
  const shown = layerText(prepared.layer, context.data, context.textContext)?.value ?? '';
  const flag = (on: boolean | undefined, label: string) => (on === true ? label : '');
  const words = (kind: PhraseKind, id: string) =>
    phraseWords(
      context.phrases ?? BUILT_IN_PHRASES,
      kind,
      id,
      phraseLanguage(context.textContext.locale),
    );
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
        if (item.mount !== undefined) {
          return [t(`templates.ready.${item.mount}`)];
        }
        return item.caption === undefined
          ? [t('widgets.image'), t(`style.frames.${item.frame}`)]
          : [
              t('widgets.instant'),
              t(`gallery.captions.${item.caption}`),
              t(`style.frames.${item.frame}`),
            ];
      case 'activityBlock': {
        const { block } = item;
        const name: string = t(`widgets.blocks.${block.design}`);
        if (block.design === 'verse') {
          return [name, words('verse', block.verse).source];
        }
        if (block.design === 'quote') {
          return [name, words('quote', block.quote).source];
        }
        if (block.design === 'chat') {
          return [
            name,
            t(`gallery.blockLayouts.${block.layout}`),
            typeof block.phrase === 'string' ? words('chat', block.phrase).text : block.phrase.own,
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
          return [name, words('verse', block.verse).source];
        }
        if (block.design === 'quote') {
          return [name, words('quote', block.quote).source];
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

/** The page of a pager `width` wide mostly on screen at `offset`, within its `count` pages. */
function pageAt(offset: number, width: number, count: number): number {
  'worklet';
  return Math.min(count - 1, Math.max(0, Math.round(offset / width)));
}

/**
 * A widget's tile: its variants side by side, one page each, scrolled sideways, with a dot per
 * page under them. A tap adds the variant on the page; a widget chosen from a list says so with
 * its `hint` at the bottom.
 */
const WidgetTile = memo(function WidgetTile({
  widget,
  width,
  height,
  label,
  hint,
  onPress,
  onLongPress,
  longPressLabel,
}: {
  readonly widget: GalleryWidget;
  readonly width: number;
  readonly height: number;
  readonly label: (page: GalleryPage) => string;
  readonly hint?: string;
  readonly onPress: (page: GalleryPage) => void;
  readonly onLongPress?: (page: GalleryPage) => void;
  readonly longPressLabel?: string;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(0);
  /** Whether the pages beside the one shown are drawn: since the finger first touches it. */
  const [swiping, setSwiping] = useState(false);
  /** The page under a finger, dimmed while pressed. */
  const [pressed, setPressed] = useState<number | null>(null);
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
  // Where the pager is, read on the UI thread: the pages are drawn on the card's own canvas, and
  // follow the finger there, frame by frame, without a render.
  const offset = useSharedValue(0);
  const shownOnUI = useSharedValue(0);
  const count = widget.pages.length;
  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      scheduleOnRN(setSwiping, true);
    },
    onScroll: (event) => {
      offset.set(event.contentOffset.x);
      const page = pageAt(event.contentOffset.x, pageWidth, count);
      if (page !== shownOnUI.get()) {
        shownOnUI.set(page);
        scheduleOnRN(setShown, page);
      }
    },
  });
  const pagesAt = useDerivedValue(() => [{ translateX: -offset.get() }]);
  return (
    <View
      style={{
        ...cardSurface(14),
        width,
        height,
      }}
    >
      {/* One canvas for the card and its pages: each canvas costs the UI thread a texture to
          create and a first draw, about 12 ms on a modest phone, and a screenful of tiles with a
          canvas for the card and one more for its page held it for 300 ms and more on opening. */}
      <CardGradient width={width} height={height} radius={14}>
        <Group clip={{ x: 0, y: 0, width: pageWidth, height: pageHeight }}>
          <Group transform={pagesAt}>
            {widget.pages.map((page, i) =>
              // The page shown and, once swiping, those beside it: a gallery has over a hundred.
              Math.abs(i - shown) <= (swiping ? 1 : 0) ? (
                <PageDrawing
                  key={page.key}
                  page={page}
                  x={i * pageWidth}
                  width={pageWidth}
                  height={canvasHeight}
                  dimmed={pressed === i}
                />
              ) : null,
            )}
          </Group>
        </Group>
      </CardGradient>
      <Animated.ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={several}
        // The canvas follows the finger, not only the end of the swipe.
        scrollEventThrottle={16}
        onScroll={onScroll}
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
            onPressIn={() => setPressed(i)}
            onPressOut={() => setPressed(null)}
            onLongPress={onLongPress === undefined ? undefined : () => onLongPress(page)}
            accessibilityActions={
              longPressLabel === undefined ? undefined : [{ name: 'save', label: longPressLabel }]
            }
            onAccessibilityAction={onLongPress === undefined ? undefined : () => onLongPress(page)}
            style={{ width: pageWidth, height: pageHeight }}
          />
        ))}
      </Animated.ScrollView>
      {hint !== undefined ? (
        <View
          pointerEvents="none"
          // Over the dots, when there are some.
          style={{
            position: 'absolute',
            bottom: hintBottom(several),
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
});

/** How much a pressed page dims, as the app's buttons do. */
const PRESSED_OPACITY = 0.6;

/** A variant drawn centered in its page, which starts `x` points along the pager, at its tile's scale. */
function PageDrawing({
  page,
  x,
  width,
  height,
  dimmed,
}: {
  readonly page: GalleryPage;
  readonly x: number;
  readonly width: number;
  readonly height: number;
  readonly dimmed: boolean;
}) {
  const { layer, content } = page.prepared;
  const opacity = layer.opacity * (dimmed ? PRESSED_OPACITY : 1);
  return (
    <Group
      transform={[{ translateX: x + width / 2 }, { translateY: height / 2 }, { scale: page.scale }]}
      layer={opacity < 1 ? <Paint opacity={opacity} /> : undefined}
    >
      {content}
    </Group>
  );
}
