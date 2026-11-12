import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { exchangeCode } from '@/data/auth';
import { colors } from '@/theme/colors';
import { logError } from '@/ui/log';
import { Spinner } from '@/ui/spinner';

/**
 * Where the links of sign-in come back to (ADR 019): an email's confirmation or reset, or
 * Google's sign-in on Android. It trades the code for a session and goes on to the app, whose
 * guards then show the right screen; without a code, back to signing in.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const { code, error_description: problem } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  useEffect(() => {
    if (typeof code !== 'string' || code === '') {
      if (typeof problem === 'string') {
        logError('A sign-in link came back with an error', new Error(problem));
      }
      router.replace('/');
      return;
    }
    void exchangeCode(code).finally(() => router.replace('/'));
  }, [code, problem]);
  return (
    <View
      accessible
      accessibilityLabel={t('account.signingIn')}
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
