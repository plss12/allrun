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
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import type { CatalogItem, CatalogSection, NewLayer } from '@/core/layer-catalog';
import {
  type CanvasFormat,
  CHAT_PHRASES,
  type FontId,
  MAX_CHAT_LENGTH,
  QUOTES,
  VERSES,
} from '@/core/template';
import { CARD_BORDER, cardSurface } from '@/theme/card-surface';
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

type Block = Extract<NewLayer, { kind: 'activityBlock' }>['block'];

/**
 * Widgets whose words are chosen from a list: a Bible verse, a quote, or a chat message's phrase
 * (or one of the user's), as the version tapped (a dark or a light message).
 */
type Choice = Extract<Block, { design: 'verse' | 'quote' | 'chat' }>;

/** The list a gallery item is chosen from, if it is. */
const choiceOf = (item: CatalogItem): Choice | null =>
  item.kind === 'activityBlock' &&
  (item.block.design === 'verse' || item.block.design === 'quote' || item.block.design === 'chat')
    ? item.block
    : null;

/** The title of each list to choose from. */
const CHOICE_TITLES = {
  verse: 'gallery.chooseVerse',
  quote: 'gallery.chooseQuote',
  chat: 'gallery.chooseChat',
} as const;

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
  onAdd,
  onAddText,
  onClose,
}: LayerSheetProps) {
  const { t } = useTranslation();
  const window = useWindowDimensions();
  const [choosing, setChoosing] = useState<Choice | null>(null);
  const close = () => {
    setChoosing(null);
    onClose();
  };
  // iOS opens no keyboard while a sheet is on screen: free text starts once it has slid away.
  // Android has no dismiss callback, and no such limit.
  const textPending = useRef(false);
  const addText = () => {
    close();
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
      // Android's back button leaves a list for the gallery first.
      onRequestClose={() => (choosing === null ? close() : setChoosing(null))}
      onDismiss={() => {
        if (textPending.current) {
          textPending.current = false;
          onAddText();
        }
      }}
    >
      {choosing !== null ? (
        <SheetFrame
          title={t(CHOICE_TITLES[choosing.design])}
          closeLabel={t('editor.back')}
          onClose={() => setChoosing(null)}
        >
          <ChoiceList
            choice={choosing}
            onChoose={(block) => {
              setChoosing(null);
              onAdd({ kind: 'activityBlock', block });
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
                    hint={choiceOf(widget.pages[0].item) === null ? undefined : t('gallery.choose')}
                    onPress={(page) => {
                      const choice = choiceOf(page.item);
                      if (choice !== null) {
                        setChoosing(choice);
                      } else if (page.item.kind === 'text') {
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
      )}
    </Modal>
  );
}

/** One entry of a list to choose from: its words, where they come from, and the widget. */
interface ChoiceEntry {
  readonly key: string;
  readonly words: string;
  readonly source: string | null;
  readonly block: Block;
}

/**
 * The verses, quotes or phrases to choose from, each on a card: a verse's or a quote's words in
 * quotation marks, and where they come from or who said them under them; a phrase as it is, after
 * a field to write one's own. A tap adds it.
 */
function ChoiceList({
  choice,
  onChoose,
}: {
  readonly choice: Choice;
  readonly onChoose: (block: Block) => void;
}) {
  const { t } = useTranslation();
  const entries = ((): ChoiceEntry[] => {
    switch (choice.design) {
      case 'verse':
        return VERSES.map((verse) => ({
          key: verse,
          words: t('widgets.quoted', { text: t(`widgets.verses.${verse}.text`) }),
          source: t(`widgets.verses.${verse}.source`),
          block: { design: 'verse', verse },
        }));
      case 'quote':
        return QUOTES.map((quote) => ({
          key: quote,
          words: t('widgets.quoted', { text: t(`widgets.quotes.${quote}.text`) }),
          source: t(`widgets.quotes.${quote}.author`),
          block: { design: 'quote', quote },
        }));
      case 'chat':
        return CHAT_PHRASES.map((phrase) => ({
          key: phrase,
          words: t(`widgets.phrases.${phrase}`),
          source: null,
          block: { ...choice, phrase },
        }));
    }
  })();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: GALLERY_PADDING, gap: GALLERY_GAP, paddingBottom: 32 }}
    >
      {choice.design === 'chat' ? (
        <OwnPhrase onAdd={(own) => onChoose({ ...choice, phrase: { own } })} />
      ) : null}
      {entries.map((entry) => (
        <Pressable
          key={entry.key}
          accessibilityRole="button"
          accessibilityLabel={
            entry.source === null ? entry.words : `${entry.words} ${entry.source}`
          }
          onPress={() => onChoose(entry.block)}
          style={({ pressed }) => ({
            ...cardSurface(14),
            paddingHorizontal: 18,
            paddingVertical: 16,
            gap: 6,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ color: colors.label, fontSize: 17, lineHeight: 23 }}>{entry.words}</Text>
          {entry.source === null ? null : (
            <Text style={{ color: colors.secondaryLabel, fontSize: 15, fontStyle: 'italic' }}>
              {entry.source}
            </Text>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** A card to write one's own phrase, and its button to add it, on once there is something. */
function OwnPhrase({ onAdd }: { readonly onAdd: (phrase: string) => void }) {
  const { t } = useTranslation();
  const [phrase, setPhrase] = useState('');
  const written = phrase.trim();
  const add = () => {
    if (written !== '') {
      onAdd(written);
    }
  };
  return (
    <View
      style={{
        ...cardSurface(14),
        paddingHorizontal: 18,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <TextInput
        value={phrase}
        onChangeText={setPhrase}
        onSubmitEditing={add}
        placeholder={t('gallery.ownPhrase')}
        placeholderTextColor={colors.secondaryLabel}
        accessibilityLabel={t('gallery.ownPhrase')}
        maxLength={MAX_CHAT_LENGTH}
        returnKeyType="done"
        style={{ flex: 1, color: colors.label, fontSize: 17, paddingVertical: 8 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: written === '' }}
        disabled={written === ''}
        onPress={add}
        hitSlop={8}
        style={({ pressed }) => ({ opacity: written === '' ? 0.35 : pressed ? 0.6 : 1 })}
      >
        <Text style={{ color: colors.tint, fontSize: 17, fontWeight: '600' }}>
          {t('gallery.addOwnPhrase')}
        </Text>
      </Pressable>
    </View>
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
        return [
          t(`widgets.summaryBlocks.${block.design}`),
          block.design === 'periodData'
            ? t(`gallery.dataCounts.${(['one', 'two', 'three'] as const)[block.count - 1]}`)
            : block.design === 'periodTable'
              ? t(`widgets.${block.value === 'distance' ? 'distanceChart' : 'timeChart'}`)
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
            <PageCanvas
              page={page}
              width={pageWidth}
              height={
                // The hint goes where the dots would, or over them without taking room: the
                // widget sits as high as in the tiles next to it.
                several || hint !== undefined ? pageHeight - GALLERY_DOTS_HEIGHT : pageHeight
              }
            />
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
