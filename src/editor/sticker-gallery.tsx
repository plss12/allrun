import * as Haptics from 'expo-haptics';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ReactNode, useDeferredValue, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Modal, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_FONT } from '@/core/default-layout';
import { exportEncoding, exportFileName } from '@/core/export';
import { stickerCatalog } from '@/core/layer-catalog';
import { type StickerLook, withStickerLook } from '@/core/layer-style';
import { startOf } from '@/core/place';
import { useActivitySource } from '@/data/activity-source';
import { lookUpPlace, type PlaceLookup, UNKNOWN_PLACE } from '@/data/place-lookup';
import { usePhrases } from '@/data/phrases';
import { colors } from '@/theme/colors';
import { logError } from '@/ui/log';
import { useDisplaySettings } from '@/ui/settings';
import { ErrorView, LoadingView } from '@/ui/state-views';
import { toLocalTimestamp } from '@/ui/today';
import { useAsync } from '@/ui/use-async';

import { CHOICE_TITLES, ChoiceList } from './choice-list';
import { ColorMenu } from './color-menu';
import { Dock } from './dock';
import type { EditorData } from './editor-data';
import type { EditorRequest } from './editor-params';
import { copyImage, saveToPhotos } from './export-actions';
import { encodeBase64, writeImage } from './export-image';
import { useEditorFonts } from './fonts';
import {
  type Choice,
  choiceOf,
  chosenLayer,
  galleryDataKey,
  useGallery,
  WidgetGalleryList,
} from './layer-sheet';
import { catalogFor, loadEditorData } from './load-editor-data';
import { Notice, useNotice } from './notice';
import { disposeLater, inParagraphArena } from './paragraph-arena';
import { SheetFrame } from './sheet-frame';
import { FLOATING_INK, RoundButton } from './round-button';
import { renderSticker } from './sticker-image';
import { FontRow } from './style-panel';
import { Swatch } from './widget-column';
import type { GalleryContext } from './widget-gallery';
import { buildGallery, prepareItem } from './widget-gallery';

const STICKER_ENCODING = exportEncoding(false);
const NO_LOOK: StickerLook = { font: null, color: null };
/** The design a sticker is laid out for: the tallest canvas, so none is cramped. */
const STICKER_FORMAT = 'story';

/** A small line of how to use the stickers, with its icon. */
function HowTo({ icon, text }: { readonly icon: SymbolViewProps['name']; readonly text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <SymbolView name={icon} size={14} tintColor={colors.secondaryLabel} />
      <Text numberOfLines={1} style={{ color: colors.secondaryLabel, fontSize: 12 }}>
        {text}
      </Text>
    </View>
  );
}

/** Longest the stickers wait for the name of the place before being laid out without it. */
const MAX_PLACE_WAIT_MS = 800;

/** What the stickers are made of, with the name of the place once it is known. */
export interface StickerData {
  readonly data: ReturnType<typeof useAsync<EditorData>>;
  readonly place: PlaceLookup;
  /** Whether to lay them out already: the place is known, or it took too long. */
  readonly ready: boolean;
}

/**
 * Loads what the stickers are made of as the selection screen opens, so that their tab finds it
 * ready, also on coming back to it. Laying them out takes a moment, and the name of the place would
 * have them laid out again a moment later.
 */
export function useStickerData(params: EditorRequest): StickerData {
  const source = useActivitySource();
  const data = useAsync(() => loadEditorData(source, params), JSON.stringify(params));
  // Its place, named without asking for anything: if that needs a permission, it isn't offered.
  const activity = data.status === 'success' && data.data.mode === 'activity' ? data.data : null;
  const lookup = useAsync(
    () =>
      activity === null
        ? Promise.resolve(UNKNOWN_PLACE)
        : lookUpPlace(startOf(activity.activity), false),
    activity?.activity.id ?? 'none',
  );
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), MAX_PLACE_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  return {
    data,
    place: lookup.status === 'success' ? lookup.data : UNKNOWN_PLACE,
    ready: data.status === 'success' && (waited || lookup.status !== 'loading'),
  };
}

/**
 * The Stickers tab (ADR 009): the widgets drawn with the user's data, ready to paste over anything.
 * A tap copies one and a long press saves it, as a PNG cut to the widget; a widget chosen from a
 * list asks which words first. On top, the font and color of all of them, in a panel at the bottom
 * as in the editor, with the gallery changing behind it, and a button back to how each one was;
 * replicas of apps keep their own look.
 */
export function StickerGallery({
  stickerData: { data, place, ready },
  top,
  topInset,
}: {
  readonly stickerData: StickerData;
  /** Goes over the gallery, scrolling with it. */
  readonly top: ReactNode;
  /** How far down the gallery starts, so that it can pass under the screen's header. */
  readonly topInset: number;
}) {
  const { t } = useTranslation();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { unit, locale } = useDisplaySettings();
  const fonts = useEditorFonts();
  const phrases = usePhrases();
  const notice = useNotice();
  const [look, setLook] = useState<StickerLook>(NO_LOOK);
  // A tap answers at once, in the panel; the gallery, a moment's work, follows in its own render.
  const drawnLook = useDeferredValue(look);
  const [panel, setPanel] = useState<'font' | 'color' | null>(null);
  const [choosing, setChoosing] = useState<Choice | null>(null);

  const loaded = ready && data.status === 'success' ? data.data : null;
  const shown =
    loaded?.mode === 'activity' && place.status === 'known'
      ? { ...loaded, place: place.place }
      : loaded;
  const context: GalleryContext | null =
    shown === null || fonts === null
      ? null
      : {
          data: shown,
          fonts,
          textContext: {
            unit,
            locale,
            durationUnits: {
              hours: t('durationUnits.hours'),
              minutes: t('durationUnits.minutes'),
              seconds: t('durationUnits.seconds'),
            },
            unitLabel: (metricUnit) => t(`metricUnits.${metricUnit}`),
          },
          translate: (key, values) => t(key, values),
          phrases,
          restyle: (layer) => withStickerLook(layer, drawnLook),
        };
  const textSample = t('gallery.textSample');
  const catalog =
    shown === null ? [] : stickerCatalog(catalogFor(shown, unit, place.status === 'known'));
  const sections = useGallery(
    context !== null,
    context === null
      ? ''
      : [
          galleryDataKey(context.data),
          catalog.map((section) => section.widgets.map((widget) => widget.key).join(',')).join(';'),
          drawnLook.font,
          drawnLook.color,
          unit,
          locale,
          window.width,
        ].join('|'),
    () => {
      if (context === null) {
        throw new Error('The stickers are only laid out with their data');
      }
      return buildGallery(catalog, STICKER_FORMAT, DEFAULT_FONT, context, window.width, textSample);
    },
  );

  /** The sticker of `item`, freed once `act` is done with it. */
  const withSticker = async (
    item: Parameters<typeof prepareItem>[0],
    act: (image: Awaited<ReturnType<typeof renderSticker>>) => Promise<void>,
  ) => {
    if (context === null) {
      return;
    }
    const { value: prepared, dispose } = inParagraphArena(() =>
      prepareItem(item, STICKER_FORMAT, DEFAULT_FONT, context, textSample),
    );
    try {
      if (prepared === null) {
        throw new Error(`Nothing to draw for the sticker ${item.kind}`);
      }
      const image = await renderSticker(prepared);
      try {
        await act(image);
      } finally {
        image.dispose();
      }
    } catch (error) {
      logError('Could not make the sticker', error);
      notice.show(t('export.actionError'));
    } finally {
      disposeLater(dispose);
    }
  };

  const copy = (item: Parameters<typeof prepareItem>[0]) =>
    withSticker(item, async (image) => {
      await copyImage(encodeBase64(image, STICKER_ENCODING));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notice.show(t('stickers.copied'));
    });

  const save = (item: Parameters<typeof prepareItem>[0]) =>
    withSticker(item, async (image) => {
      const name = exportFileName(STICKER_ENCODING, toLocalTimestamp(new Date()));
      const saved = await saveToPhotos(writeImage(image, STICKER_ENCODING, name));
      if (saved === 'saved') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        notice.show(t('stickers.saved'));
        return;
      }
      Alert.alert(t('export.noPermissionTitle'), t('export.noPermissionMessage'), [
        { text: t('editor.cancel'), style: 'cancel' },
        {
          text: t('export.openSettings'),
          onPress: () => {
            Linking.openSettings().catch((error: unknown) => {
              logError('Could not open the settings', error);
            });
          },
        },
      ]);
    });

  if (data.status === 'error') {
    return (
      <View style={{ flex: 1, paddingTop: topInset }}>
        {top}
        <ErrorView message={t('editor.error')} onRetry={data.retry} />
      </View>
    );
  }
  if (context === null) {
    return (
      <View style={{ flex: 1, paddingTop: topInset }}>
        {top}
        <LoadingView />
      </View>
    );
  }
  const header = (
    <>
      {top}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingTop: 8,
        }}
      >
        {/* The color first, as in the column of a selected widget. */}
        <RoundButton
          label={t('stickers.color')}
          selected={panel === 'color'}
          onPress={() => setPanel(panel === 'color' ? null : 'color')}
        >
          <Swatch color={look.color ?? FLOATING_INK} />
        </RoundButton>
        <RoundButton
          label={t('stickers.font')}
          selected={panel === 'font'}
          onPress={() => setPanel(panel === 'font' ? null : 'font')}
        >
          <Text
            maxFontSizeMultiplier={1.2}
            style={{ color: FLOATING_INK, fontSize: 17, fontWeight: '700' }}
          >
            Aa
          </Text>
        </RoundButton>
        <RoundButton
          icon={{ ios: 'arrow.counterclockwise', android: 'restart_alt' }}
          label={t('stickers.reset')}
          disabled={look === NO_LOOK}
          onPress={() => {
            setLook(NO_LOOK);
            setPanel(null);
          }}
        />
        <View style={{ flex: 1, alignItems: 'flex-end', gap: 4 }}>
          <HowTo icon={{ ios: 'doc.on.doc', android: 'content_copy' }} text={t('stickers.tap')} />
          <HowTo
            icon={{ ios: 'square.and.arrow.down', android: 'download' }}
            text={t('stickers.longPress')}
          />
        </View>
      </View>
    </>
  );
  return (
    <View style={{ flex: 1 }}>
      <WidgetGalleryList
        header={header}
        topInset={topInset}
        sections={sections}
        layerContext={context}
        longPressLabel={t('stickers.longPress')}
        onPress={({ item }) => {
          const choice = choiceOf(item);
          if (choice === null) {
            void copy(item);
          } else {
            setChoosing(choice);
          }
        }}
        onLongPress={({ item }) => void save(item)}
      />
      <Notice message={notice.message} />
      {panel === null ? null : (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 12 }}>
          <Dock onDone={() => setPanel(null)}>
            {panel === 'font' ? (
              <FontRow font={look.font} onPick={(font) => setLook({ ...look, font })} />
            ) : (
              <ColorMenu color={look.color} onColor={(color) => setLook({ ...look, color })} />
            )}
          </Dock>
        </View>
      )}
      <Modal
        visible={choosing !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        allowSwipeDismissal
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setChoosing(null)}
      >
        {choosing === null ? null : (
          <SheetFrame
            title={t(CHOICE_TITLES[choosing.block.design])}
            closeLabel={t('editor.close')}
            onClose={() => setChoosing(null)}
          >
            <ChoiceList
              words={choosing.block}
              language={locale === 'es' ? 'es' : 'en'}
              onChoose={(block) => {
                setChoosing(null);
                void copy(chosenLayer(choosing.kind, block));
              }}
            />
          </SheetFrame>
        )}
      </Modal>
    </View>
  );
}
