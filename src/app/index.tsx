import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, ScrollView, Text, useWindowDimensions } from 'react-native';

import type { Activity } from '@/core/activity';
import type { PeriodKind } from '@/core/periods';
import { familiesOf } from '@/core/summary';
import { useActivitySource } from '@/data/activity-source';
import { ActivityCard } from '@/home/activity-card';
import { PeriodCard } from '@/home/period-card';
import { type SportFilter, SportFilterMenu } from '@/home/sport-filter-menu';
import { colors } from '@/theme/colors';
import { useDisplaySettings } from '@/ui/settings';
import { EmptyView, ErrorView, LoadingView } from '@/ui/state-views';
import { todayLocal } from '@/ui/today';
import { useAsync } from '@/ui/use-async';

const RECENT_LIMIT = 50;
const TABS = ['activities', 'summaries'] as const;
const PERIODS: readonly PeriodKind[] = ['week', 'month', 'year', 'custom'];
const PADDING = 16;
const GAP = 12;

type Tab = (typeof TABS)[number];

/** Home: the activities as a gallery, or the summaries of each period (ADR 009). */
export default function Home() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('activities');
  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <SegmentedControl
              values={TABS.map((option) => t(`home.tabs.${option}`))}
              selectedIndex={TABS.indexOf(tab)}
              onChange={(event) => setTab(TABS[event.nativeEvent.selectedSegmentIndex])}
              style={{ width: 230 }}
            />
          ),
        }}
      />
      {tab === 'activities' ? <Activities /> : <Summaries />}
    </>
  );
}

function Activities() {
  const { t } = useTranslation();
  const source = useActivitySource();
  const recent = useAsync(() => source.listRecent(RECENT_LIMIT), 'recent');
  const [sport, setSport] = useState<SportFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);

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
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={
            shown === 'all'
              ? 'line.3.horizontal.decrease.circle'
              : 'line.3.horizontal.decrease.circle.fill'
          }
          accessibilityLabel={t('home.filter')}
          onPress={() => setFilterOpen(true)}
        >
          {t('home.filter')}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
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
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      data={activities}
      keyExtractor={(activity) => activity.id}
      contentContainerStyle={{ padding: PADDING, gap: GAP, flexGrow: 1 }}
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
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: PADDING, gap: 16 }}
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
