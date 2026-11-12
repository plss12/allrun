import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AccountButton } from '@/account/account-parts';
import { type ConnectResult, connectStrava, retryStrava, useStrava } from '@/data/strava';
import { colors } from '@/theme/colors';
import { ErrorView, LoadingView } from '@/ui/state-views';
import { Text } from '@/ui/text';
import { useTopBarRoom } from '@/ui/top-bar';

/** As wide as the sign-in form's buttons, at most. */
const BUTTON_WIDTH = 440;

/** What a result of connecting says, when it says anything. */
const PROBLEMS = {
  missingActivityScope: 'strava.missingActivityScope',
  unconfigured: 'strava.unconfigured',
  failed: 'strava.failed',
} as const satisfies Partial<Record<ConnectResult, string>>;

/**
 * What the home shows where its activities go until Strava is connected (ADR 020): a line and
 * the button to connect it, in Track Red as signing in, centered under the bar, which stays as always (the owner's choice: no page
 * of its own for it).
 */
export function ConnectStravaView() {
  const { t } = useTranslation();
  const top = useTopBarRoom();
  const strava = useStrava();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<keyof typeof PROBLEMS | null>(null);

  const connect = async () => {
    setBusy(true);
    setProblem(null);
    const result = await connectStrava();
    setBusy(false);
    if (result !== 'connected' && result !== 'cancelled') {
      setProblem(result);
    }
  };

  return (
    <View style={{ flex: 1, paddingTop: top }}>
      {strava.status === 'reading' || strava.status === 'checking' ? (
        <LoadingView />
      ) : strava.status === 'failed' ? (
        <ErrorView message={t('strava.checkFailed')} onRetry={retryStrava} />
      ) : (
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}
        >
          <Text style={{ color: colors.secondaryLabel, fontSize: 17, textAlign: 'center' }}>
            {t('strava.connectMessage')}
          </Text>
          <View style={{ width: '100%', maxWidth: BUTTON_WIDTH }}>
            <AccountButton
              kind="primary"
              label={t('strava.connect')}
              onPress={() => void connect()}
              busy={busy}
            />
          </View>
          {problem === null ? null : (
            <Text
              accessibilityRole="alert"
              style={{ color: colors.error, fontSize: 15, textAlign: 'center' }}
            >
              {t(PROBLEMS[problem])}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
