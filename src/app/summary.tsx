import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { DateRange } from '@/core/dates';
import { type PeriodKind, periodContaining, shiftPeriod } from '@/core/periods';
import type { SportFamily } from '@/core/sports';
import { summarize } from '@/core/summary';
import { summaryMetricValue, toDisplaySummaryMetric } from '@/core/summary-metrics';
import type { SummaryMetricId } from '@/core/template';
import { useActivitySource } from '@/data/activity-source';
import { colors } from '@/theme/colors';
import { formatMetric, formatPeriodName } from '@/ui/format';
import { useDisplaySettings } from '@/ui/settings';
import { ErrorView, LoadingView } from '@/ui/state-views';
import { todayLocal } from '@/ui/today';
import { useAsync } from '@/ui/use-async';

type CalendarKind = Exclude<PeriodKind, 'custom'>;

const KINDS: readonly CalendarKind[] = ['week', 'month', 'year'];
const FAMILIES: readonly SportFamily[] = ['run', 'ride', 'walk', 'swim', 'other'];
const PREVIEW_METRICS: readonly SummaryMetricId[] = [
  'totalDistance',
  'totalMovingTime',
  'totalElevationGain',
];

export default function Summary() {
  const { t } = useTranslation();
  const { unit, locale } = useDisplaySettings();
  const source = useActivitySource();
  const today = todayLocal();

  const [kind, setKind] = useState<CalendarKind>('month');
  const [range, setRange] = useState<DateRange>(() => periodContaining('month', today));
  // Empty means every sport.
  const [families, setFamilies] = useState<readonly SportFamily[]>([]);

  const activities = useAsync(() => source.listInRange(range), `${range.start}/${range.end}`);
  const isCurrentOrFuture = range.end >= today;

  const selectKind = (next: CalendarKind) => {
    setKind(next);
    setRange(periodContaining(next, today));
  };
  const toggleFamily = (family: SportFamily) =>
    setFamilies((current) =>
      current.includes(family) ? current.filter((f) => f !== family) : [...current, family],
    );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 20 }}
    >
      <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="tablist">
        {KINDS.map((option) => (
          <Chip
            key={option}
            label={t(`summary.${option}`)}
            selected={kind === option}
            role="tab"
            onPress={() => selectKind(option)}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <StepButton
          label="‹"
          accessibilityLabel={t('summary.previous')}
          onPress={() => setRange(shiftPeriod(kind, range, -1))}
        />
        <Text
          style={{
            flex: 1,
            textAlign: 'center',
            color: colors.label,
            fontSize: 20,
            fontWeight: '700',
          }}
        >
          {formatPeriodName(kind, range, locale)}
        </Text>
        <StepButton
          label="›"
          accessibilityLabel={t('summary.next')}
          disabled={isCurrentOrFuture}
          onPress={() => setRange(shiftPeriod(kind, range, 1))}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.secondaryLabel, fontSize: 13, fontWeight: '600' }}>
          {t('summary.sports').toLocaleUpperCase()}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip
            label={t('summary.allSports')}
            selected={families.length === 0}
            onPress={() => setFamilies([])}
          />
          {FAMILIES.map((family) => (
            <Chip
              key={family}
              label={t(`families.${family}`)}
              selected={families.includes(family)}
              onPress={() => toggleFamily(family)}
            />
          ))}
        </View>
      </View>

      {activities.status === 'loading' ? (
        <LoadingView />
      ) : activities.status === 'error' ? (
        <ErrorView
          message={t('summary.error')}
          error={activities.error}
          onRetry={activities.retry}
        />
      ) : (
        (() => {
          const summary = summarize(
            activities.data,
            range,
            families.length === 0 ? {} : { families },
          );
          return (
            <View style={{ gap: 16 }}>
              <View
                style={{
                  backgroundColor: colors.secondarySystemBackground,
                  borderRadius: 16,
                  borderCurve: 'continuous',
                  padding: 16,
                  gap: 12,
                }}
              >
                <Text style={{ color: colors.secondaryLabel, fontSize: 15 }}>
                  {summary.activityCount === 0
                    ? t('summary.empty')
                    : t('summary.activities', { count: summary.activityCount })}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {PREVIEW_METRICS.map((metric) => {
                    const value = summaryMetricValue(summary, metric);
                    const formatted =
                      value === null
                        ? null
                        : formatMetric(toDisplaySummaryMetric(metric, value, unit), locale);
                    return (
                      <View key={metric} style={{ gap: 2 }}>
                        <Text style={{ color: colors.secondaryLabel, fontSize: 13 }}>
                          {t(`summaryMetrics.${metric}`)}
                        </Text>
                        <Text
                          selectable
                          style={{
                            color: colors.label,
                            fontSize: 22,
                            fontWeight: '700',
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {formatted === null ? '—' : formatted.value}
                          {formatted?.unit ? (
                            <Text style={{ fontSize: 15, fontWeight: '400' }}>
                              {` ${formatted.unit}`}
                            </Text>
                          ) : null}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={summary.activityCount === 0}
                onPress={() =>
                  router.push({
                    pathname: '/editor',
                    params: {
                      mode: 'summary',
                      kind,
                      start: range.start,
                      end: range.end,
                      families: families.join(','),
                    },
                  })
                }
                style={({ pressed }) => ({
                  backgroundColor: colors.tint,
                  borderRadius: 14,
                  borderCurve: 'continuous',
                  padding: 16,
                  alignItems: 'center',
                  opacity: summary.activityCount === 0 ? 0.4 : pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ color: colors.onTint, fontSize: 17, fontWeight: '700' }}>
                  {t('summary.createImage')}
                </Text>
              </Pressable>
            </View>
          );
        })()
      )}
    </ScrollView>
  );
}

function Chip({
  label,
  selected,
  onPress,
  role = 'button',
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly role?: 'button' | 'tab';
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: selected ? colors.tint : colors.secondarySystemBackground,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{ color: selected ? colors.onTint : colors.label, fontSize: 15, fontWeight: '600' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StepButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
}: {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.secondarySystemBackground,
        opacity: disabled ? 0.3 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: colors.label, fontSize: 26, fontWeight: '600', marginTop: -2 }}>
        {label}
      </Text>
    </Pressable>
  );
}
