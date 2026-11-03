import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Activity } from '@/core/activity';
import type { PeriodKind } from '@/core/periods';
import { familiesOf } from '@/core/summary';
import { useActivitySource } from '@/data/activity-source';
import { BrandMark } from '@/editor/brand/brand-art';
import { KeptMounted, RoundButton } from '@/editor/round-button';
import { ActivityCard } from '@/home/activity-card';
import { PeriodCard } from '@/home/period-card';
import { type SportFilter, SportFilterMenu } from '@/home/sport-filter-menu';
import { colors } from '@/theme/colors';
import { useDisplaySettings } from '@/ui/settings';
import { EmptyView, ErrorView, LoadingView } from '@/ui/state-views';
import { todayLocal } from '@/ui/today';
import { GlassTabs, TOP_BAR_HEIGHT, TopBar, useTopBarRoom, useTopBarTop } from '@/ui/top-bar';
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
 */
export default function Home() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('activities');
  const [summariesDue, setSummariesDue] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSummariesDue(true), SUMMARIES_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <KeptMounted hidden={tab !== 'activities'} style={StyleSheet.absoluteFill}>
        <Activities active={tab === 'activities'} />
      </KeptMounted>
      {summariesDue || tab === 'summaries' ? (
        <KeptMounted hidden={tab !== 'summaries'} style={StyleSheet.absoluteFill}>
          <Summaries />
        </KeptMounted>
      ) : null}
      <TopBar left={<BrandMark height={22} />}>
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
  const recent = useAsync(() => source.listRecent(RECENT_LIMIT), 'recent');
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
          <RoundButton
            icon={
              shown === 'all'
                ? { ios: 'line.3.horizontal.decrease.circle', android: 'filter_list' }
                : { ios: 'line.3.horizontal.decrease.circle.fill', android: 'filter_list' }
            }
            label={t('home.filter')}
            size={TOP_BAR_HEIGHT}
            onPress={() => setFilterOpen(true)}
          />
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
      contentContainerStyle={{
        ...room.contentContainerStyle,
        paddingHorizontal: PADDING,
        gap: GAP,
        flexGrow: 1,
      }}
      ListHeaderComponent={
        <Text style={{ color: colors.secondaryLabel, fontSize: 13, paddingBottom: 4 }}>
          {t('home.sampleData')}
        </Text>
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
