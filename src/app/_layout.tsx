import '@/i18n';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ActivitySourceProvider } from '@/data/activity-source';
import { TemplateStoreProvider } from '@/data/user-templates';
import { BrandMark } from '@/editor/brand/brand-art';
import { colors } from '@/theme/colors';

export default function RootLayout() {
  const { t } = useTranslation();
  // Headers follow the system's light or dark mode, like the semantic colors of the screens;
  // a fixed light theme left white headers over dark screens and white text on light ones.
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
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
              <Stack.Screen
                name="index"
                options={{
                  title: t('home.title'),
                  headerLargeTitle: true,
                  headerLeft: () => <BrandMark height={22} />,
                }}
              />
              <Stack.Screen name="summary" options={{ title: t('summary.title') }} />
              {/* The editor opens in its photo step; the screen titles each step itself. */}
              <Stack.Screen name="editor" options={{ title: t('editor.photoStep') }} />
            </Stack>
          </TemplateStoreProvider>
        </ActivitySourceProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
