import '@/i18n';

import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ActivitySourceProvider } from '@/data/activity-source';
import { TemplateStoreProvider } from '@/data/user-templates';
import { BrandMark } from '@/editor/brand/brand-art';
import { loadEditorFonts } from '@/editor/fonts';
import { colors } from '@/theme/colors';
import { LaunchScreen } from '@/ui/launch-screen';
import { logError } from '@/ui/log';

// The app is always dark (ADR 009): routes, charts and photos stand out on it. `app.json` asks for
// it in native builds; this also applies it in Expo Go, so semantic colors resolve to dark.
Appearance.setColorScheme('dark');

// The native launch screen stays until ours is on screen, which looks the same (see
// `LaunchScreen`). Kept from here, as early as possible: inside a component it could be gone.
SplashScreen.preventAutoHideAsync().catch((error: unknown) =>
  logError('Could not keep the launch screen', error),
);
SplashScreen.setOptions({ duration: 200, fade: true });

/**
 * Longest our launch screen waits for the editor's fonts: past it, the app shows and the editor
 * waits for them instead, rather than the logo staying while a load is stuck.
 */
const MAX_LAUNCH_WAIT_MS = 8000;

export default function RootLayout() {
  const { t } = useTranslation();
  // Our launch screen stays until the editor's fonts are loaded, so no screen waits for them later
  // (opening an activity used to); the app loads under it meanwhile.
  const [launching, setLaunching] = useState(true);
  useEffect(() => {
    const timeout = setTimeout(() => setLaunching(false), MAX_LAUNCH_WAIT_MS);
    loadEditorFonts()
      .catch((error: unknown) => logError('Could not load the editor fonts at launch', error))
      .finally(() => {
        clearTimeout(timeout);
        setLaunching(false);
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
              {/* The editor is full screen, with its own floating controls (ADR 009); it rises
                  as a modal and closes with its own button, which asks before losing edits. */}
              <Stack.Screen
                name="editor"
                options={{ headerShown: false, presentation: 'fullScreenModal' }}
              />
            </Stack>
          </TemplateStoreProvider>
        </ActivitySourceProvider>
        {launching ? <LaunchScreen onShown={() => SplashScreen.hide()} /> : null}
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
