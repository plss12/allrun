import '@/i18n';

import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ActivitySourceProvider } from '@/data/activity-source';
import { TemplateStoreProvider } from '@/data/user-templates';
import { BrandMark } from '@/editor/brand/brand-art';
import { loadEditorFonts } from '@/editor/fonts';
import { colors } from '@/theme/colors';
import { logError } from '@/ui/log';

// The app is always dark (ADR 009): routes, charts and photos stand out on it. `app.json` asks for
// it in native builds; this also applies it in Expo Go, so semantic colors resolve to dark.
Appearance.setColorScheme('dark');

// The launch screen, with AllRun's logo, stays until the editor's fonts are loaded, so no screen
// waits for them later (opening an activity used to). Kept from here, as early as possible: inside
// a component it could already be gone.
SplashScreen.preventAutoHideAsync().catch((error: unknown) =>
  logError('Could not keep the launch screen', error),
);
SplashScreen.setOptions({ duration: 300, fade: true });

/**
 * Longest the launch screen waits for the fonts: past it, the app shows and the editor waits for
 * them instead, rather than the logo staying while a load is stuck.
 */
const MAX_LAUNCH_WAIT_MS = 8000;

export default function RootLayout() {
  const { t } = useTranslation();
  useEffect(() => {
    let waiting = true;
    const show = () => {
      if (waiting) {
        waiting = false;
        SplashScreen.hide();
      }
    };
    const timeout = setTimeout(show, MAX_LAUNCH_WAIT_MS);
    loadEditorFonts()
      .catch((error: unknown) => logError('Could not load the editor fonts at launch', error))
      .finally(() => {
        clearTimeout(timeout);
        show();
      });
    return () => clearTimeout(timeout);
  }, []);
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
