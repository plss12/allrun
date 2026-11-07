import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { INITIAL_FORMAT } from '@/core/editor-document';
import { editorParamsSchema } from '@/editor/editor-params';
import { KeptMounted, RoundButton } from '@/editor/round-button';
import type { EditorRequest } from '@/editor/editor-params';
import type { DesignChoice } from '@/editor/design-choice';
import { DesignGallery } from '@/editor/design-gallery';
import { galleryData } from '@/editor/gallery-place';
import { useEditorFonts } from '@/editor/fonts';
import { useStockPhotos } from '@/editor/stock-photos';
import { StickerGallery, type StickerData, useStickerData } from '@/editor/sticker-gallery';
import { useUserTemplates } from '@/data/user-templates';
import { PhotoBrowser } from '@/photos/photo-browser';
import { colors } from '@/theme/colors';
import { useCollectOnReturn } from '@/ui/collect-garbage';
import { logError } from '@/ui/log';
import { ErrorView, LoadingView } from '@/ui/state-views';
import { useDisplaySettings } from '@/ui/settings';
import { SheetHost } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { GlassTabs, TOP_BAR_HEIGHT, TopBar, useTopBarRoom } from '@/ui/top-bar';

const TABS = ['photo', 'designs', 'stickers'] as const;
type Tab = (typeof TABS)[number];

/** What this screen adds to the editor's params: the line that says what is being shared. */
const lineSchema = z.object({ line: z.string().optional() });

/**
 * What to make with the activity or period chosen (ADR 009): a photo of the user's, a design or a
 * sticker. A photo opens the editor with it and an empty design, and the first cell, without one.
 * The tabs stay mounted once opened, so each list stays where it was.
 */
export default function Select() {
  const { t } = useTranslation();
  const raw = useLocalSearchParams();
  const params = editorParamsSchema.safeParse(raw);
  const paramsError = params.success ? null : z.prettifyError(params.error);
  useEffect(() => {
    if (paramsError !== null) {
      logError('Invalid selection route params', paramsError);
    }
  }, [paramsError]);
  if (!params.success) {
    return <ErrorView message={t('editor.error')} />;
  }
  return (
    <SheetHost>
      <Selection params={params.data} raw={raw} />
    </SheetHost>
  );
}

function Selection({
  params,
  raw,
}: {
  readonly params: EditorRequest;
  /** The route params as they came, to go on to the editor with. */
  readonly raw: ReturnType<typeof useLocalSearchParams>;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('photo');
  // Back from the editor, what it left goes (see useCollectOnReturn).
  useCollectOnReturn();
  const [stickersOpened, setStickersOpened] = useState(false);
  const [designsOpened, setDesignsOpened] = useState(false);
  // The lists scroll under the bar on top, whose glass takes on what passes beneath it.
  const topInset = useTopBarRoom();
  const stickerData = useStickerData(params);
  const { line: rawLine, ...editorParams } = raw;
  const line = lineSchema.safeParse({ line: rawLine }).data?.line;
  const openEditor = (photo?: string) =>
    router.push({
      pathname: '/editor',
      params: { ...editorParams, ...(photo === undefined ? {} : { photo }) },
    });
  const openDesign = (choice: DesignChoice) =>
    router.push({
      pathname: '/editor',
      params: { ...editorParams, design: JSON.stringify(choice) },
    });
  const top =
    line === undefined || line === '' ? null : (
      <Text
        numberOfLines={1}
        style={{
          color: colors.label,
          fontSize: 17,
          fontWeight: '600',
          textAlign: 'center',
          paddingHorizontal: 16,
          paddingTop: 8,
        }}
      >
        {line}
      </Text>
    );
  return (
    <View style={{ flex: 1 }}>
      <KeptMounted hidden={tab !== 'photo'} style={StyleSheet.absoluteFill}>
        <PhotoBrowser
          onPick={openEditor}
          onNoPhoto={() => openEditor()}
          top={top}
          topInset={topInset}
        />
      </KeptMounted>
      {stickersOpened ? (
        <KeptMounted hidden={tab !== 'stickers'} style={StyleSheet.absoluteFill}>
          <StickerGallery stickerData={stickerData} top={top} topInset={topInset} />
        </KeptMounted>
      ) : null}
      {designsOpened ? (
        <KeptMounted hidden={tab !== 'designs'} style={StyleSheet.absoluteFill}>
          <DesignsTab
            stickerData={stickerData}
            top={top}
            topInset={topInset}
            onChoose={openDesign}
          />
        </KeptMounted>
      ) : null}
      <TopBar
        left={
          <RoundButton
            icon="back"
            label={t('editor.back')}
            size={TOP_BAR_HEIGHT}
            onPress={() => router.back()}
          />
        }
      >
        <GlassTabs
          values={TABS.map((option) => t(`select.tabs.${option}`))}
          selectedIndex={TABS.indexOf(tab)}
          onChange={(index) => {
            setTab(TABS[index]);
            if (TABS[index] === 'stickers') {
              setStickersOpened(true);
            }
            if (TABS[index] === 'designs') {
              setDesignsOpened(true);
            }
          }}
          width={260}
        />
      </TopBar>
    </View>
  );
}

/**
 * The Designs tab: the gallery for the data the screen loaded for its stickers, in the format the
 * editor opens in. Choosing one opens the editor with it, its slots empty.
 */
function DesignsTab({
  stickerData: { data, place },
  top,
  topInset,
  onChoose,
}: {
  readonly stickerData: StickerData;
  /** Goes over the gallery, scrolling with it. */
  readonly top: ReactNode;
  readonly topInset: number;
  readonly onChoose: (choice: DesignChoice) => void;
}) {
  const { t } = useTranslation();
  const { unit, locale } = useDisplaySettings();
  const fonts = useEditorFonts();
  const stock = useStockPhotos();
  const userTemplates = useUserTemplates();
  if (data.status === 'error') {
    return <ErrorView message={t('editor.error')} onRetry={data.retry} />;
  }
  if (data.status === 'loading' || fonts === null) {
    return <LoadingView />;
  }
  return (
    <DesignGallery
      context={{
        data: galleryData(data.data, place, {
          city: t('gallery.placeSample.city'),
          region: t('gallery.placeSample.region'),
          country: t('gallery.placeSample.country'),
        }),
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
      }}
      format={INITIAL_FORMAT}
      anyFormat
      stock={stock}
      userTemplates={userTemplates}
      onChoose={onChoose}
      top={top}
      topInset={topInset}
    />
  );
}
