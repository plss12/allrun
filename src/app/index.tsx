import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Activity } from '@/core/activity';
import type { PeriodKind } from '@/core/periods';
import { familiesOf } from '@/core/summary';
import { useActivitySource, useActivitySourceKey, usesStrava } from '@/data/activity-source';
import { useStrava } from '@/data/strava';
import { FLOATING_INK, KeptMounted } from '@/editor/round-button';
import { ActivityCard } from '@/home/activity-card';
import { ConnectStravaView } from '@/home/connect-strava-view';
import { ProfileAvatar } from '@/home/profile-avatar';
import { PeriodCard } from '@/home/period-card';
import { type SportFilter, SportFilterMenu } from '@/home/sport-filter-menu';
import { colors } from '@/theme/colors';
import { useCollectOnReturn } from '@/ui/collect-garbage';
import { useDisplaySettings } from '@/ui/settings';
import { AppIcon } from '@/ui/app-icon';
import { SportGlyph } from '@/ui/sport-glyph';
import { EmptyView, ErrorView, LoadingView } from '@/ui/state-views';
import { Text } from '@/ui/text';
import { todayLocal } from '@/ui/today';
import { GlassButton, GlassTabs, TopBar, useTopBarRoom, useTopBarTop } from '@/ui/top-bar';
import { useAsync } from '@/ui/use-async';

const RECENT_LIMIT = 50;
const TABS = ['activities', 'summaries'] as const;
const PERIODS: readonly PeriodKind[] = ['week', 'month', 'year', 'custom'];
const PADDING = 16;
const GAP = 12;
/** How long after the activities show the summaries start loading, out of sight. */
const SUMMARIES_AFTER_MS = 600;

type Tab = (typeof TABS)[number];

/**
 * Where a list of this screen starts and ends, as it scrolls under the bar on top, whose glass
 * takes on what passes beneath it.
 */
function useListRoom() {
  const top = useTopBarRoom();
  const insets = useSafeAreaInsets();
  return {
    scrollIndicatorInsets: { top },
    contentContainerStyle: { paddingTop: top + PADDING, paddingBottom: insets.bottom + PADDING },
  } as const;
}

/**
 * Home: the activities as a gallery, or the summaries of each period (ADR 009). Both stay mounted,
 * so changing tabs loads nothing again and each keeps where it was; the summaries, the heavier ones,
 * start loading out of sight soon after the activities show, or at once if they are asked for.
 * Until Strava is connected, Strava's button takes their place, under the same bar (ADR 020).
 */
export default function Home() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('activities');
  const [summariesDue, setSummariesDue] = useState(false);
  // Back from the selection or the editor, what they left goes (see useCollectOnReturn).
  useCollectOnReturn();
  const strava = useStrava();
  const connected = !usesStrava() || strava.status === 'connected';
  useEffect(() => {
    const timer = setTimeout(() => setSummariesDue(true), SUMMARIES_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      {connected ? (
        <>
          <KeptMounted hidden={tab !== 'activities'} style={StyleSheet.absoluteFill}>
            <Activities active={tab === 'activities'} />
          </KeptMounted>
          {summariesDue || tab === 'summaries' ? (
            <KeptMounted hidden={tab !== 'summaries'} style={StyleSheet.absoluteFill}>
              <Summaries />
            </KeptMounted>
          ) : null}
        </>
      ) : (
        <View style={StyleSheet.absoluteFill}>
          <ConnectStravaView />
        </View>
      )}
      <TopBar
        left={
          // The athlete's photo opens the profile (the owner's choice: the logo there wasn't
          // read as the way to it).
          <GlassButton label={t('account.profile.open')} onPress={() => router.push('/profile')}>
            <ProfileAvatar />
          </GlassButton>
        }
      >
        <GlassTabs
          values={TABS.map((option) => t(`home.tabs.${option}`))}
          selectedIndex={TABS.indexOf(tab)}
          onChange={(index) => setTab(TABS[index])}
          width={230}
        />
      </TopBar>
    </>
  );
}

function Activities({ active }: { readonly active: boolean }) {
  const { t } = useTranslation();
  const source = useActivitySource();
  const sourceKey = useActivitySourceKey();
  const recent = useAsync(() => source.listRecent(RECENT_LIMIT), `recent|${sourceKey}`);
  const [sport, setSport] = useState<SportFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const barTop = useTopBarTop();

  if (recent.status === 'loading') {
    return <LoadingView />;
  }
  if (recent.status === 'error') {
    return <ErrorView message={t('home.error')} onRetry={recent.retry} />;
  }
  const families = familiesOf(recent.data);
  // A sport chosen before the list changed may no longer be there: show them all.
  const shown = sport !== 'all' && families.includes(sport) ? sport : 'all';
  return (
    <>
      <SportFilterMenu
        visible={filterOpen}
        families={families}
        chosen={shown}
        onChoose={setSport}
        onClose={() => setFilterOpen(false)}
      />
      <Gallery
        activities={
          shown === 'all'
            ? recent.data
            : recent.data.filter((activity) => activity.sportFamily === shown)
        }
      />
      {/* Beside the tabs, only with the activities on screen: the summaries have no use for it. */}
      {active ? (
        <View style={{ position: 'absolute', top: barTop, right: 8 }}>
          {/* With a sport chosen, its icon says which one is on. On the glass, as the logo across. */}
          <GlassButton
            label={
              shown === 'all' ? t('home.filter') : `${t('home.filter')}, ${t(`families.${shown}`)}`
            }
            onPress={() => setFilterOpen(true)}
          >
            {shown === 'all' ? (
              <AppIcon name="filter" size={BAR_ICON_SIZE} color={FLOATING_INK} />
            ) : (
              <SportGlyph icon={shown} size={BAR_ICON_SIZE} color={FLOATING_INK} />
            )}
          </GlassButton>
        </View>
      ) : null}
    </>
  );
}

/** The activities, one per row, newest first. */
function Gallery({ activities }: { readonly activities: readonly Activity[] }) {
  const { t } = useTranslation();
  const { unit, locale } = useDisplaySettings();
  const { width } = useWindowDimensions();
  const cardWidth = width - 2 * PADDING;
  const today = todayLocal();
  const room = useListRoom();
  return (
    <FlatList
      scrollIndicatorInsets={room.scrollIndicatorInsets}
      data={activities}
      keyExtractor={(activity) => activity.id}
      // Each card holds a canvas, megabytes of GPU memory: those that fill the screen first, then
      // a couple at a time, and those over two screens away are let go. Nearer ones stay on screen:
      // on Android, a canvas taken off it destroys its surface, and has to draw again on coming back.
      initialNumToRender={3}
      maxToRenderPerBatch={2}
      windowSize={5}
      removeClippedSubviews={false}
      contentContainerStyle={{
        ...room.contentContainerStyle,
        paddingHorizontal: PADDING,
        gap: GAP,
        flexGrow: 1,
      }}
      ListHeaderComponent={
        // Only the synthetic history of a development build says it is.
        usesStrava() ? undefined : (
          <Text style={{ color: colors.secondaryLabel, fontSize: 13, paddingBottom: 4 }}>
            {t('home.sampleData')}
          </Text>
        )
      }
      ListEmptyComponent={<EmptyView message={t('home.empty')} />}
      renderItem={({ item }) => (
        <ActivityCard activity={item} width={cardWidth} today={today} unit={unit} locale={locale} />
      )}
    />
  );
}

/** A card per period: this week, month and year, and a custom range. */
function Summaries() {
  const { unit, locale } = useDisplaySettings();
  const { width } = useWindowDimensions();
  const today = todayLocal();
  const room = useListRoom();
  return (
    <ScrollView
      scrollIndicatorInsets={room.scrollIndicatorInsets}
      contentContainerStyle={{
        ...room.contentContainerStyle,
        paddingHorizontal: PADDING,
        gap: 16,
      }}
    >
      {PERIODS.map((kind) => (
        <PeriodCard
          key={kind}
          kind={kind}
          width={width - 2 * PADDING}
          today={today}
          unit={unit}
          locale={locale}
        />
      ))}
    </ScrollView>
  );
}

/** The filter's icon in its round button. */
const BAR_ICON_SIZE = 24;
