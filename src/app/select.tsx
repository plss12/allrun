import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';
import { z } from 'zod';

import { editorParamsSchema } from '@/editor/editor-params';
import { StickerGallery } from '@/editor/sticker-gallery';
import { PhotoBrowser } from '@/photos/photo-browser';
import { colors } from '@/theme/colors';
import { logError } from '@/ui/log';
import { EmptyView, ErrorView } from '@/ui/state-views';

const TABS = ['photo', 'designs', 'stickers'] as const;
type Tab = (typeof TABS)[number];

/** What this screen adds to the editor's params: the line that says what is being shared. */
const lineSchema = z.object({ line: z.string().optional() });

/**
 * What to make with the activity or period chosen (ADR 009): a photo of the user's, a design or a
 * sticker. A photo opens the editor with it and an empty design, and the first cell, without one.
 */
export default function Select() {
  const { t } = useTranslation();
  const raw = useLocalSearchParams();
  const headerHeight = useHeaderHeight();
  const params = editorParamsSchema.safeParse(raw);
  const paramsError = params.success ? null : z.prettifyError(params.error);
  useEffect(() => {
    if (paramsError !== null) {
      logError('Invalid selection route params', paramsError);
    }
  }, [paramsError]);
  const [tab, setTab] = useState<Tab>('photo');
  if (!params.success) {
    return <ErrorView message={t('editor.error')} />;
  }
  const { line: rawLine, ...editorParams } = raw;
  const line = lineSchema.safeParse({ line: rawLine }).data?.line;
  const openEditor = (photo?: string) =>
    router.push({
      pathname: '/editor',
      params: { ...editorParams, ...(photo === undefined ? {} : { photo }) },
    });
  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <SegmentedControl
              values={TABS.map((option) => t(`select.tabs.${option}`))}
              selectedIndex={TABS.indexOf(tab)}
              onChange={(event) => setTab(TABS[event.nativeEvent.selectedSegmentIndex])}
              style={{ width: 260 }}
            />
          ),
        }}
      />
      {/* iOS draws a screen under its translucent header; lists make room by themselves, but this
          screen has its tabs on top, fixed. */}
      <View style={{ flex: 1, paddingTop: Platform.OS === 'ios' ? headerHeight : 0 }}>
        {line === undefined || line === '' ? null : (
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
        )}
        {tab === 'photo' ? (
          <PhotoBrowser onPick={openEditor} onNoPhoto={() => openEditor()} />
        ) : tab === 'stickers' ? (
          <StickerGallery params={params.data} />
        ) : (
          <EmptyView message={t('editor.comingSoon')} />
        )}
      </View>
    </>
  );
}
