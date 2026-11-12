import '@/i18n';

import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ActivitySourceProvider } from '@/data/activity-source';
import { startAuth, useAuth } from '@/data/auth';
import { followDesigns, forgetDesigns } from '@/data/design-sync';
import { followProfile } from '@/data/profile';
import { TemplateStoreProvider } from '@/data/user-templates';
import { syncPhrases } from '@/data/phrases';
import { loadEditorFonts } from '@/editor/fonts';
import { ShaderWarmup } from '@/editor/shader-warmup';
import { loadStockPhotos } from '@/editor/stock-photos';
import { colors } from '@/theme/colors';
import { LaunchScreen } from '@/ui/launch-screen';
import { logError } from '@/ui/log';
import { loadInterfaceFonts } from '@/ui/text';

// The app is always dark (ADR 009): routes, charts and photos stand out on it. `app.json` asks for
// it in native builds; this also applies it in Expo Go, for what the system draws (alerts, keyboard,
// the date picker).
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

/**
 * Shortest time our launch screen stays once it is on screen: its name fades in under the monogram
 * and is read before it goes. In a build the fonts are ready in half a second, and it went before
 * the name showed (the user's decision: it is always seen whole).
 */
const MIN_LAUNCH_SHOWN_MS = 1000;

/**
 * When the GPU's programs are made under the launch screen (see `ShaderWarmup`): once its name has
 * faded in, which a busy UI thread would make stutter.
 */
const WARMUP_AFTER_MS = 600;

export default function RootLayout() {
  const { t } = useTranslation();
  // Our launch screen stays until the editor's fonts are loaded, so no screen waits for them later
  // (opening an activity used to), and at least `MIN_LAUNCH_SHOWN_MS`; the app loads under it
  // meanwhile.
  const [fontsSettled, setFontsSettled] = useState(false);
  const [shownLongEnough, setShownLongEnough] = useState(false);
  const [warming, setWarming] = useState(false);
  const warmupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // An account is required (ADR 019): which screens show waits for the stored session to be read.
  const auth = useAuth();
  useEffect(() => startAuth(), []);
  const signedIn = auth.status === 'signedIn';
  const recovering = auth.status === 'signedIn' && auth.recovering;
  // The profile and the designs follow the account: its own once signed in, synced; forgotten on
  // the phone once signed out, as another person may sign in next (ADR 019).
  const accountId = auth.status === 'signedIn' ? auth.userId : null;
  const authKnown = auth.status !== 'loading';
  const lastAccount = useRef<string | null>(null);
  useEffect(() => {
    if (!authKnown) {
      return;
    }
    followProfile(accountId);
    followDesigns(accountId);
    if (lastAccount.current !== null && accountId === null) {
      forgetDesigns().catch((error: unknown) =>
        logError('Could not clear the designs on signing out', error),
      );
    }
    lastAccount.current = accountId;
  }, [authKnown, accountId]);
  const launching = !(fontsSettled && shownLongEnough && auth.status !== 'loading');
  // Ready, it still fades out before it goes (see `LaunchScreen`).
  const [launchGone, setLaunchGone] = useState(false);
  const onLaunchGone = useCallback(() => setLaunchGone(true), []);
  const shownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLaunchShown = () => {
    if (shownTimer.current !== null) {
      return;
    }
    SplashScreen.hide();
    shownTimer.current = setTimeout(() => setShownLongEnough(true), MIN_LAUNCH_SHOWN_MS);
    warmupTimer.current = setTimeout(() => setWarming(true), WARMUP_AFTER_MS);
  };
  useEffect(
    () => () => {
      if (shownTimer.current !== null) {
        clearTimeout(shownTimer.current);
      }
      if (warmupTimer.current !== null) {
        clearTimeout(warmupTimer.current);
      }
    },
    [],
  );
  // The screens mount once their text has its faces, under the launch screen: laid out with the
  // system's font, they would jump when Inter came. A failure leaves the system's.
  const [facesLoaded, setFacesLoaded] = useState(false);
  useEffect(() => {
    loadInterfaceFonts()
      .catch((error: unknown) => logError('Could not load the interface fonts', error))
      .finally(() => setFacesLoaded(true));
  }, []);
  useEffect(() => {
    const timeout = setTimeout(() => setFontsSettled(true), MAX_LAUNCH_WAIT_MS);
    loadEditorFonts()
      .catch((error: unknown) => logError('Could not load the editor fonts at launch', error))
      .finally(() => {
        clearTimeout(timeout);
        setFontsSettled(true);
      });
    return () => clearTimeout(timeout);
  }, []);
  // In the background: the app uses the copy on the phone meanwhile.
  useEffect(() => {
    void syncPhrases();
  }, []);
  // From the start, without holding the launch screen for them: a gallery shows its tiles anyway.
  useEffect(() => {
    loadStockPhotos().catch((error: unknown) =>
      logError('Could not decode the stock photos ahead of time', error),
    );
  }, []);
  return (
    <ThemeProvider value={DarkTheme}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ActivitySourceProvider>
          <TemplateStoreProvider>
            {facesLoaded || !launching ? (
              <Stack
                screenOptions={{
                  contentStyle: { backgroundColor: colors.systemBackground },
                  // Each screen has its own bar on top (see `ui/top-bar.tsx`).
                  headerShown: false,
                }}
              >
                <Stack.Protected guard={signedIn && !recovering}>
                  <Stack.Screen name="index" options={{ title: t('home.title') }} />
                  <Stack.Screen name="select" options={{ title: '' }} />
                  {/* The editor is full screen, with its own floating controls (ADR 009); it
                      rises as a modal and closes with its own button, which asks before losing
                      edits. */}
                  <Stack.Screen name="editor" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="profile" />
                </Stack.Protected>
                <Stack.Protected guard={!signedIn}>
                  <Stack.Screen name="sign-in" />
                </Stack.Protected>
                {/* Signed in by a reset link: a new password before anything else. */}
                <Stack.Protected guard={recovering}>
                  <Stack.Screen name="new-password" />
                </Stack.Protected>
                <Stack.Screen name="auth-callback" />
              </Stack>
            ) : null}
          </TemplateStoreProvider>
        </ActivitySourceProvider>
        {launching && warming ? <ShaderWarmup /> : null}
        {launchGone ? null : (
          <LaunchScreen leaving={!launching} onShown={onLaunchShown} onGone={onLaunchGone} />
        )}
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
