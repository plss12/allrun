import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type AuthResult,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  useAuth,
} from '@/data/auth';
import { colors } from '@/theme/colors';
import { Text } from '@/ui/text';

import { AccountButton, AccountDivider, AccountField, AccountLink } from './account-parts';
import { AppleMark, GoogleMark } from './provider-logos';

/** What the form does: sign in, make an account, or send a link for a new password. */
type Mode = 'signIn' | 'signUp' | 'reset';

/** What the screen says under the form: a problem, or that an email is on its way. */
type Message = { readonly kind: 'error' | 'info'; readonly text: string } | null;

/** The widest the form grows on a big screen: fields any wider read badly. */
const FORM_WIDTH = 420;

/** The providers' marks next to their names. */
const MARK_SIZE = 22;

/**
 * The first screen without an account (ADR 019), as the owner chose it: the title, the email and
 * the password, the button that signs in, then Google and Apple with their marks, and the one that
 * makes an account, in Track Red as well. Signing up and a forgotten password use the same screen.
 * Once signed in, the app's screens take its place by themselves (see the root layout's guards).
 */
export function SignInScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'form' | 'google' | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const unconfigured = useAuth().status === 'unconfigured';

  const show = (result: AuthResult, done: Message = null) => {
    setMessage(result.ok ? done : { kind: 'error', text: t(`account.errors.${result.problem}`) });
  };
  const run = async (which: 'form' | 'google', action: () => Promise<void>) => {
    setBusy(which);
    setMessage(null);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };
  const submit = () =>
    run('form', async () => {
      if (mode === 'signIn') {
        show(await signInWithEmail(email, password));
      } else if (mode === 'signUp') {
        show(await signUpWithEmail(email, password), {
          kind: 'info',
          text: t('account.checkEmail', { email: email.trim() }),
        });
      } else {
        show(await sendPasswordReset(email), {
          kind: 'info',
          text: t('account.resetSent', { email: email.trim() }),
        });
      }
    });
  const google = () => run('google', async () => show(await signInWithGoogle()));
  const switchTo = (next: Mode) => {
    setMode(next);
    setMessage(null);
  };

  const title =
    mode === 'signIn'
      ? t('account.signInTitle')
      : mode === 'signUp'
        ? t('account.signUpTitle')
        : t('account.resetTitle');
  const action =
    mode === 'signIn'
      ? t('account.signIn')
      : mode === 'signUp'
        ? t('account.signUp')
        : t('account.sendLink');
  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1, backgroundColor: colors.systemBackground }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
      >
        <View style={{ width: '100%', maxWidth: FORM_WIDTH, alignSelf: 'center', gap: 20 }}>
          <Text
            accessibilityRole="header"
            style={{ color: colors.label, fontSize: 34, fontWeight: '700', marginBottom: 12 }}
          >
            {title}
          </Text>
          <AccountField
            label={t('account.email')}
            value={email}
            onChangeText={setEmail}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            returnKeyType={mode === 'reset' ? 'send' : 'next'}
            onSubmitEditing={mode === 'reset' ? () => void submit() : undefined}
            editable={busy === null}
          />
          {mode === 'reset' ? null : (
            <AccountField
              label={t('account.password')}
              placeholder={mode === 'signUp' ? t('account.passwordHint') : undefined}
              secret
              value={password}
              onChangeText={setPassword}
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              editable={busy === null}
            />
          )}
          {mode === 'signIn' ? (
            <AccountLink
              label={t('account.forgot')}
              onPress={() => switchTo('reset')}
              align="start"
            />
          ) : null}
          <AccountButton
            kind="primary"
            label={action}
            onPress={() => void submit()}
            busy={busy === 'form'}
            disabled={busy === 'google'}
          />
          {unconfigured ? (
            <Text style={{ color: colors.error, fontSize: 15, textAlign: 'center' }}>
              {t('account.unconfigured')}
            </Text>
          ) : null}
          {message === null ? null : (
            <Text
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={{
                color: message.kind === 'error' ? colors.error : colors.secondaryLabel,
                fontSize: 15,
                textAlign: 'center',
              }}
            >
              {message.text}
            </Text>
          )}
          {mode === 'reset' ? (
            <AccountLink label={t('account.back')} onPress={() => switchTo('signIn')} />
          ) : (
            <>
              <AccountDivider label={t('account.or')} />
              <AccountButton
                kind="outlined"
                label={t('account.continueGoogle')}
                mark={<GoogleMark size={MARK_SIZE} />}
                onPress={() => void google()}
                busy={busy === 'google'}
                disabled={busy === 'form'}
              />
              {/* Set up when the Apple account is paid (ADR 019): until then it says so. */}
              <AccountButton
                kind="outlined"
                label={t('account.continueApple')}
                mark={<AppleMark size={MARK_SIZE} color={colors.label} />}
                onPress={() => setMessage({ kind: 'info', text: t('account.comingSoon') })}
                disabled={busy !== null}
              />
              {mode === 'signIn' ? (
                <AccountButton
                  kind="primary"
                  label={t('account.register')}
                  onPress={() => switchTo('signUp')}
                  disabled={busy !== null}
                />
              ) : (
                <AccountLink label={t('account.toSignIn')} onPress={() => switchTo('signIn')} />
              )}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
