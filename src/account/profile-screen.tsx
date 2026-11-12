import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ROUTE_PRIVACY_CHOICES,
  type RoutePrivacyChoice,
  SUGGESTED_PRIVACY_TRIM_METERS,
} from '@/core/route-privacy';
import { deleteAccount, signOut, useAuth } from '@/data/auth';
import { sendBeforeLeaving } from '@/data/design-sync';
import { changeProfile, useProfile } from '@/data/profile';
import { disconnectStrava, useStrava } from '@/data/strava';
import { RoundButton } from '@/editor/round-button';
import { smallCardSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';
import { Spinner } from '@/ui/spinner';
import { Text } from '@/ui/text';
import { Toggle } from '@/ui/toggle';

import { AccountButton, AccountLink } from './account-parts';
import { GlassTabs, TOP_BAR_HEIGHT, TopBar, useTopBarRoom } from '@/ui/top-bar';

/** The screen's side margins, as the home's. */
const PADDING = 16;
/** Inside a card. */
const CARD_PADDING = 16;

/** A distance as the profile offers it: "200 m", "1 km". */
function distanceLabel(meters: RoutePrivacyChoice): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

/**
 * The profile (ADR 019), from the button on the home's top bar: the account (its email, signing
 * out, deleting it), the Strava connected (ADR 020), hiding the start and end of routes, and
 * update emails. Every change shows at
 * once and is kept with the account; one it couldn't keep goes back, and says so.
 */
export function ProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const top = useTopBarRoom();
  const { width } = useWindowDimensions();
  const auth = useAuth();
  const profile = useProfile();
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const strava = useStrava();
  const [disconnecting, setDisconnecting] = useState(false);
  const email = auth.status === 'signedIn' ? auth.email : null;
  const hiding = profile.routePrivacyMeters !== 0;

  const change = async (next: Parameters<typeof changeProfile>[0]) => {
    setFailed(false);
    setFailed(!(await changeProfile(next)));
  };
  const leave = () =>
    void signOut().then((result) => {
      if (!result.ok) {
        setLeaving(false);
        Alert.alert(t(`account.errors.${result.problem}`));
      }
    });
  // The designs not sent yet would go with the phone's copy: it says so before.
  const signOutSent = async () => {
    setLeaving(true);
    if (await sendBeforeLeaving()) {
      leave();
      return;
    }
    Alert.alert(t('account.profile.unsentTitle'), t('account.profile.unsentMessage'), [
      { text: t('account.profile.cancel'), style: 'cancel', onPress: () => setLeaving(false) },
      { text: t('account.profile.signOutAnyway'), style: 'destructive', onPress: leave },
    ]);
  };
  const askSignOut = () =>
    Alert.alert(t('account.profile.signOutTitle'), t('account.profile.signOutMessage'), [
      { text: t('account.profile.cancel'), style: 'cancel' },
      { text: t('account.profile.signOut'), onPress: () => void signOutSent() },
    ]);
  const askDisconnect = () =>
    Alert.alert(t('strava.disconnectTitle'), t('strava.disconnectMessage'), [
      { text: t('account.profile.cancel'), style: 'cancel' },
      {
        text: t('strava.disconnect'),
        style: 'destructive',
        onPress: () => {
          setDisconnecting(true);
          void disconnectStrava().then((done) => {
            setDisconnecting(false);
            if (!done) {
              Alert.alert(t('strava.disconnectFailed'));
            }
          });
        },
      },
    ]);
  const askDelete = () =>
    Alert.alert(t('account.profile.deleteTitle'), t('account.profile.deleteMessage'), [
      { text: t('account.profile.cancel'), style: 'cancel' },
      {
        text: t('account.profile.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          setLeaving(true);
          void deleteAccount().then((result) => {
            if (!result.ok) {
              setLeaving(false);
              Alert.alert(t('account.profile.deleteFailed'));
            }
          });
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.systemBackground }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: top + 8,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: PADDING,
          gap: 8,
        }}
      >
        <Section title={t('account.profile.accountSection')}>
          <Row>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.secondaryLabel, fontSize: 13 }}>
                {t('account.profile.signedInAs')}
              </Text>
              <Text numberOfLines={1} style={{ color: colors.label, fontSize: 17 }}>
                {email ?? '—'}
              </Text>
            </View>
          </Row>
        </Section>

        {strava.status === 'connected' ? (
          <Section title={t('strava.section')}>
            <Row>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.secondaryLabel, fontSize: 13 }}>
                  {t('strava.connectedAs')}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.label, fontSize: 17 }}>
                  {strava.athleteName === '' ? '—' : strava.athleteName}
                </Text>
              </View>
              {disconnecting ? (
                <Spinner />
              ) : (
                <AccountLink label={t('strava.disconnect')} onPress={askDisconnect} />
              )}
            </Row>
          </Section>
        ) : null}

        <Section title={t('account.profile.privacySection')}>
          <Row>
            <Text style={{ flex: 1, color: colors.label, fontSize: 17 }}>
              {t('account.profile.hideRouteEnds')}
            </Text>
            <Toggle
              // Read as one line: on screen it is split in two even halves.
              label={t('account.profile.hideRouteEnds').replace('\n', ' ')}
              value={hiding}
              onChange={(on) =>
                void change({ routePrivacyMeters: on ? SUGGESTED_PRIVACY_TRIM_METERS : 0 })
              }
            />
          </Row>
          {hiding ? (
            <View style={{ paddingHorizontal: CARD_PADDING, paddingBottom: CARD_PADDING }}>
              <GlassTabs
                values={ROUTE_PRIVACY_CHOICES.map(distanceLabel)}
                selectedIndex={ROUTE_PRIVACY_CHOICES.indexOf(
                  profile.routePrivacyMeters as RoutePrivacyChoice,
                )}
                onChange={(index) =>
                  void change({ routePrivacyMeters: ROUTE_PRIVACY_CHOICES[index] })
                }
                width={width - 2 * PADDING - 2 * CARD_PADDING}
              />
            </View>
          ) : null}
        </Section>

        <Section title={t('account.profile.emailsSection')}>
          <Row>
            <Text style={{ flex: 1, color: colors.label, fontSize: 17 }}>
              {t('account.profile.updateEmails')}
            </Text>
            <Toggle
              label={t('account.profile.updateEmails')}
              value={profile.updateEmails}
              onChange={(on) => void change({ updateEmails: on })}
            />
          </Row>
        </Section>

        {failed ? (
          <Text
            accessibilityRole="alert"
            style={{ color: colors.error, fontSize: 15, textAlign: 'center' }}
          >
            {t('account.profile.changeFailed')}
          </Text>
        ) : null}

        {/* At the end, signing out as a Track Red button, as signing in is, and deleting as a
            danger red one (the owner's choices). */}
        <View style={{ marginTop: 24 }}>
          <AccountButton
            kind="primary"
            label={t('account.profile.signOut')}
            onPress={askSignOut}
            disabled={leaving}
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <AccountButton
            kind="danger"
            label={t('account.profile.deleteAccount')}
            onPress={askDelete}
            disabled={leaving}
          />
        </View>
      </ScrollView>
      <TopBar
        left={
          <RoundButton
            icon="back"
            label={t('editor.back')}
            size={TOP_BAR_HEIGHT}
            onPress={() => router.back()}
          />
        }
      >
        <Text
          accessibilityRole="header"
          style={{ color: colors.label, fontSize: 17, fontWeight: '700' }}
        >
          {t('account.profile.title')}
        </Text>
      </TopBar>
    </View>
  );
}

/** A group of rows on a card, with a title over it. */
function Section({ title, children }: { readonly title?: string; readonly children: ReactNode }) {
  return (
    <View style={{ gap: 8, marginTop: 16 }}>
      {title === undefined ? null : (
        <Text
          accessibilityRole="header"
          style={{
            color: colors.secondaryLabel,
            fontSize: 13,
            fontWeight: '600',
            paddingHorizontal: CARD_PADDING,
          }}
        >
          {title.toLocaleUpperCase()}
        </Text>
      )}
      <View style={smallCardSurface(14)}>{children}</View>
    </View>
  );
}

/** A row of a card: what it says, and a control at its end. */
function Row({ children }: { readonly children: ReactNode }) {
  return (
    <View
      style={{
        minHeight: 56,
        paddingHorizontal: CARD_PADDING,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {children}
    </View>
  );
}
