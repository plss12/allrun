import '@/i18n';

import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ActivitySourceProvider } from '@/data/activity-source';
import { TemplateStoreProvider } from '@/data/user-templates';
import { BrandMark } from '@/editor/brand/brand-art';
import { colors } from '@/theme/colors';

// The app is always dark (ADR 009): routes, charts and photos stand out on it. `app.json` asks for
// it in native builds; this also applies it in Expo Go, so semantic colors resolve to dark.
Appearance.setColorScheme('dark');

export default function RootLayout() {
  const { t } = useTranslation();
  return (
    <ThemeProvider value={DarkTheme}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ActivitySourceProvider>
          <TemplateStoreProvider>
            {/* Back buttons are just the arrow: the previous screen's title adds nothing. */}
            <Stack
              screenOptions={{
                contentStyle: { backgroundColor: colors.systemBackground },
                headerBackButtonDisplayMode: 'minimal',
              }}
            >
              {/* Home titles itself with its Activities and Summaries tabs. */}
              <Stack.Screen
                name="index"
                options={{
                  title: t('home.title'),
                  headerLeft: () => <BrandMark height={22} />,
                }}
              />
              {/* The editor opens in its photo step; the screen titles each step itself. */}
              <Stack.Screen name="editor" options={{ title: t('editor.photoStep') }} />
            </Stack>
          </TemplateStoreProvider>
        </ActivitySourceProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
