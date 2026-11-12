import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { completeStravaLink } from '@/data/strava';
import { colors } from '@/theme/colors';
import { Spinner } from '@/ui/spinner';

/**
 * Where Strava's sign-in comes back to on Android, which hands it to the app as a link too, not
 * only to the browser session (ADR 020). The session's own flow shows the result; this only
 * finishes it if the link came first, and goes back to where the user was.
 */
export default function StravaCallback() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<Record<string, string>>();
  const query = new URLSearchParams(params).toString();
  useEffect(() => {
    void completeStravaLink(`strava-callback?${query}`).finally(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    });
  }, [query]);
  return (
    <View
      accessible
      accessibilityLabel={t('strava.connecting')}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.systemBackground,
      }}
    >
      <Spinner />
    </View>
  );
}
