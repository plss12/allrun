import '@/i18n';

import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ActivitySourceProvider } from '@/data/activity-source';
import { BrandMark } from '@/editor/brand/brand-art';

export default function RootLayout() {
  const { t } = useTranslation();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ActivitySourceProvider>
        <Stack>
          <Stack.Screen
            name="index"
            options={{
              title: t('home.title'),
              headerLargeTitle: true,
              headerLeft: () => <BrandMark height={22} />,
            }}
          />
          <Stack.Screen name="summary" options={{ title: t('summary.title') }} />
          <Stack.Screen name="editor" options={{ title: t('editor.title') }} />
        </Stack>
      </ActivitySourceProvider>
    </GestureHandlerRootView>
  );
}
