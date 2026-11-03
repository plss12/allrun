import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { editorParamsSchema } from '@/editor/editor-params';
import { KeptMounted, RoundButton } from '@/editor/round-button';
import type { EditorRequest } from '@/editor/editor-params';
import { StickerGallery, useStickerData } from '@/editor/sticker-gallery';
import { PhotoBrowser } from '@/photos/photo-browser';
import { colors } from '@/theme/colors';
import { logError } from '@/ui/log';
import { EmptyView, ErrorView } from '@/ui/state-views';
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
  return <Selection params={params.data} raw={raw} />;
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
  const [stickersOpened, setStickersOpened] = useState(false);
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
      {tab === 'designs' ? (
        <View style={{ flex: 1, paddingTop: topInset }}>
          {top}
          <EmptyView message={t('editor.comingSoon')} />
        </View>
      ) : null}
      <TopBar
        left={
          <RoundButton
            icon={{ ios: 'chevron.left', android: 'arrow_back' }}
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
          }}
          width={260}
        />
      </TopBar>
    </View>
  );
}
