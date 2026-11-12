import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, View } from 'react-native';

import { setNewPassword } from '@/data/auth';
import { colors } from '@/theme/colors';
import { Text } from '@/ui/text';

import { AccountButton, AccountField } from './account-parts';

/**
 * After a reset link signed the user in (ADR 019): a new password, which they set before anything
 * else. Once set, the app's screens take its place by themselves (see the root layout's guards).
 */
export function NewPasswordScreen() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await setNewPassword(password);
      if (!result.ok) {
        setError(t(`account.errors.${result.problem}`));
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{
        flex: 1,
        backgroundColor: colors.systemBackground,
        justifyContent: 'center',
        paddingHorizontal: 24,
      }}
    >
      <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', gap: 14 }}>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.label,
            fontSize: 28,
            fontWeight: '700',
            textAlign: 'center',
            marginBottom: 18,
          }}
        >
          {t('account.newPasswordTitle')}
        </Text>
        <AccountField
          label={t('account.newPassword')}
          placeholder={t('account.passwordHint')}
          secret
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          editable={!busy}
        />
        <AccountButton
          kind="primary"
          label={t('account.save')}
          onPress={() => void save()}
          busy={busy}
        />
        {error === null ? null : (
          <Text
            accessibilityRole="alert"
            style={{ color: colors.error, fontSize: 15, textAlign: 'center' }}
          >
            {error}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
