import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';

import type { Activity } from '@/core/activity';
import { toDisplayMetric } from '@/core/metrics';
import { useActivitySource } from '@/data/activity-source';
import { colors } from '@/theme/colors';
import { formatMetric, formatShortDate } from '@/ui/format';
import { useDisplaySettings } from '@/ui/settings';
import { EmptyView, ErrorView, LoadingView } from '@/ui/state-views';
import { useAsync } from '@/ui/use-async';

const RECENT_LIMIT = 50;

export default function Home() {
  const { t } = useTranslation();
  const source = useActivitySource();
  const recent = useAsync(() => source.listRecent(RECENT_LIMIT), 'recent');

  if (recent.status === 'loading') {
    return <LoadingView />;
  }
  if (recent.status === 'error') {
    return <ErrorView message={t('home.error')} onRetry={recent.retry} />;
  }
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      data={recent.data}
      keyExtractor={(activity) => activity.id}
      contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
      ListHeaderComponent={<SummaryCard />}
      ListEmptyComponent={<EmptyView message={t('home.empty')} />}
      renderItem={({ item }) => <ActivityRow activity={item} />}
    />
  );
}

function SummaryCard() {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 8, paddingBottom: 8 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/summary')}
        style={({ pressed }) => ({
          backgroundColor: colors.tint,
          borderRadius: 16,
          borderCurve: 'continuous',
          padding: 16,
          gap: 4,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text style={{ color: colors.onTint, fontSize: 20, fontWeight: '700' }}>
          {t('home.createSummary')}
        </Text>
        <Text style={{ color: colors.onTint, fontSize: 15, opacity: 0.9 }}>
          {t('home.createSummaryHint')}
        </Text>
      </Pressable>
      <Text style={{ color: colors.secondaryLabel, fontSize: 13 }}>{t('home.sampleData')}</Text>
    </View>
  );
}

function ActivityRow({ activity }: { readonly activity: Activity }) {
  const { t } = useTranslation();
  const { unit, locale } = useDisplaySettings();
  const headline = formatMetric(
    activity.distanceMeters > 0
      ? toDisplayMetric('distance', activity.distanceMeters, {
          unit,
          sportFamily: activity.sportFamily,
        })
      : toDisplayMetric('movingTime', activity.movingTimeSeconds, {
          unit,
          sportFamily: activity.sportFamily,
        }),
    locale,
  );
  const subtitle = `${t(`modalities.${activity.sportModality}`)} · ${formatShortDate(
    activity.localDate,
    locale,
  )}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${activity.name}, ${subtitle}, ${headline.value} ${headline.unit ?? ''}`}
      onPress={() =>
        router.push({ pathname: '/editor', params: { mode: 'activity', activityId: activity.id } })
      }
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderCurve: 'continuous',
        backgroundColor: colors.secondarySystemBackground,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: colors.label, fontSize: 17, fontWeight: '600' }}>
          {activity.name}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.secondaryLabel, fontSize: 14 }}>
          {subtitle}
        </Text>
      </View>
      <Text
        style={{
          color: colors.label,
          fontSize: 17,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
        }}
      >
        {headline.value}
        {headline.unit === null ? '' : ` ${headline.unit}`}
      </Text>
    </Pressable>
  );
}
