import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import type { Activity } from '@/core/activity';
import type { DateRange, LocalDate } from '@/core/dates';
import {
  bucketForPeriod,
  customRangeLimits,
  type PeriodKind,
  periodContaining,
  setCustomRangeDate,
  shiftPeriod,
  startCustomRange,
} from '@/core/periods';
import { bucketize, summarize, type SummaryPage, summaryPages } from '@/core/summary';
import {
  defaultSummaryMetrics,
  summaryHasDistance,
  summaryMetricValue,
  toDisplaySummaryMetric,
} from '@/core/summary-metrics';
import type { DistanceUnit } from '@/core/units';
import { useActivitySource } from '@/data/activity-source';
import { CARD_BORDER, cardSurface } from '@/theme/card-surface';
import { colors, darkLabelInk } from '@/theme/colors';
import { DateRangeField } from '@/ui/date-range-field';
import { formatBucketLabels, formatChartValue, formatMetric, formatPeriodName } from '@/ui/format';
import { SportGlyph } from '@/ui/sport-glyph';
import { ErrorView } from '@/ui/state-views';
import { useAsync } from '@/ui/use-async';

import { PeriodLineChart } from './period-line-chart';

/** Height of a page, the same while loading, on error or empty, so the list never jumps. */
const PAGE_HEIGHT = 262;
const CHART_HEIGHT = 140;
const PADDING = 16;

/**
 * A period's summary on the home screen: this week, month or year (stepping back with the
 * arrows) or a custom range, scrolling sideways through all sports and then each one done in
 * it. A page opens the editor with that period and sport.
 */
export function PeriodCard({
  kind,
  width,
  today,
  unit,
  locale,
}: {
  readonly kind: PeriodKind;
  readonly width: number;
  readonly today: LocalDate;
  readonly unit: DistanceUnit;
  readonly locale: string;
}) {
  const { t } = useTranslation();
  const source = useActivitySource();
  const [range, setRange] = useState<DateRange>(() =>
    kind === 'custom'
      ? startCustomRange(periodContaining('month', today), today)
      : periodContaining(kind, today),
  );
  const activities = useAsync(() => source.listInRange(range), `${range.start}/${range.end}`);
  const [page, setPage] = useState(0);
  // A new period starts again on its first page.
  const step = (direction: -1 | 1) => {
    setRange(shiftPeriod(kind, range, direction));
    setPage(0);
  };
  const isCurrent = range.end >= today;

  return (
    <View
      style={{
        ...cardSurface(20),
        width,
        overflow: 'hidden',
      }}
    >
      {kind === 'custom' ? (
        <View style={{ padding: PADDING, paddingBottom: 0, gap: 12 }}>
          <Text style={{ color: colors.label, fontSize: 17, fontWeight: '700' }}>
            {t('home.periods.custom')}
          </Text>
          <DateRangeField
            range={range}
            limits={customRangeLimits(range, today)}
            labels={{ start: t('summary.from'), end: t('summary.to') }}
            locale={locale}
            onChange={(end, date) => {
              setRange(setCustomRangeDate(range, end, date, today));
              setPage(0);
            }}
          />
        </View>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            padding: PADDING,
            paddingBottom: 0,
          }}
        >
          <StepButton
            icon={{ ios: 'chevron.left', android: 'chevron_left' }}
            accessibilityLabel={t('summary.previous')}
            onPress={() => step(-1)}
          />
          <View style={{ flex: 1, alignItems: 'center' }}>
            {/* "This week" with its days under it; an earlier period is just its name. */}
            <Text
              numberOfLines={1}
              style={{ color: colors.label, fontSize: 17, fontWeight: '700' }}
            >
              {isCurrent ? t(`home.periods.${kind}`) : formatPeriodName(kind, range, locale)}
            </Text>
            {isCurrent ? (
              <Text numberOfLines={1} style={{ color: colors.secondaryLabel, fontSize: 13 }}>
                {formatPeriodName(kind, range, locale, kind === 'week' ? 'short' : 'full')}
              </Text>
            ) : null}
          </View>
          <StepButton
            icon={{ ios: 'chevron.right', android: 'chevron_right' }}
            accessibilityLabel={t('summary.next')}
            disabled={isCurrent}
            onPress={() => step(1)}
          />
        </View>
      )}
      {activities.status === 'loading' ? (
        <View style={{ height: PAGE_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        </View>
      ) : activities.status === 'error' ? (
        <View style={{ height: PAGE_HEIGHT }}>
          <ErrorView message={t('summary.error')} onRetry={activities.retry} />
        </View>
      ) : (
        <Pages
          kind={kind}
          range={range}
          activities={activities.data}
          // Pages as wide as the inside of the card's edge, which is what the pager pages by.
          width={width - 2 * CARD_BORDER}
          page={page}
          onPage={setPage}
          unit={unit}
          locale={locale}
        />
      )}
    </View>
  );
}

function Pages({
  kind,
  range,
  activities,
  width,
  page,
  onPage,
  unit,
  locale,
}: {
  readonly kind: PeriodKind;
  readonly range: DateRange;
  readonly activities: readonly Activity[];
  readonly width: number;
  readonly page: number;
  readonly onPage: (page: number) => void;
  readonly unit: DistanceUnit;
  readonly locale: string;
}) {
  const pages = summaryPages(activities, range);
  return (
    <View>
      <FlatList
        // A new period lays its pages out again from the first.
        key={`${range.start}/${range.end}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={pages}
        keyExtractor={(item) => item}
        // The dot follows the finger, not only the end of the swipe.
        scrollEventThrottle={16}
        onScroll={(event) =>
          onPage(
            Math.min(
              pages.length - 1,
              Math.max(0, Math.round(event.nativeEvent.contentOffset.x / width)),
            ),
          )
        }
        renderItem={({ item }) => (
          <SportPage
            kind={kind}
            range={range}
            activities={activities}
            sport={item}
            width={width}
            unit={unit}
            locale={locale}
          />
        )}
      />
      {pages.length > 1 ? (
        <View
          style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: 12 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {pages.map((item, i) => (
            <View
              key={item}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === page ? colors.label : colors.separator,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** One sport (or all) of the period: its name, its totals and its chart. */
function SportPage({
  kind,
  range,
  activities,
  sport,
  width,
  unit,
  locale,
}: {
  readonly kind: PeriodKind;
  readonly range: DateRange;
  readonly activities: readonly Activity[];
  readonly sport: SummaryPage;
  readonly width: number;
  readonly unit: DistanceUnit;
  readonly locale: string;
}) {
  const { t } = useTranslation();
  const filter = sport === 'all' ? {} : { families: [sport] };
  const summary = summarize(activities, range, filter);
  const size = bucketForPeriod(kind, range);
  const buckets = bucketize(activities, range, size, filter);
  const quantity = summaryHasDistance(summary) ? 'distance' : 'time';
  const values = buckets.map((bucket) =>
    quantity === 'distance' ? bucket.distanceMeters : bucket.movingTimeSeconds,
  );
  const empty = summary.activityCount === 0;
  const name = t(sport === 'all' ? 'summary.allSports' : `families.${sport}`);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      disabled={empty}
      onPress={() =>
        router.push({
          pathname: '/editor',
          params: {
            mode: 'summary',
            kind,
            start: range.start,
            end: range.end,
            families: sport === 'all' ? '' : sport,
          },
        })
      }
      style={({ pressed }) => ({
        width,
        height: PAGE_HEIGHT,
        padding: PADDING,
        gap: 12,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <SportGlyph icon={sport} size={14} color={darkLabelInk.secondary} />
        <Text style={{ color: colors.secondaryLabel, fontSize: 13, fontWeight: '600' }}>
          {name.toLocaleUpperCase(locale)}
        </Text>
      </View>
      {empty ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text selectable style={{ color: colors.secondaryLabel, fontSize: 15 }}>
            {t('summary.empty')}
          </Text>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {defaultSummaryMetrics(summary).map((metric) => {
              const value = summaryMetricValue(summary, metric);
              const formatted =
                value === null
                  ? null
                  : formatMetric(toDisplaySummaryMetric(metric, value, unit), locale);
              return (
                <View key={metric} style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.secondaryLabel, fontSize: 12 }}>
                    {t(`summaryMetrics.${metric}`).toLocaleUpperCase(locale)}
                  </Text>
                  <Text
                    selectable
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    style={{
                      color: colors.label,
                      fontSize: 22,
                      fontWeight: '700',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {formatted === null ? '—' : formatted.value}
                    {formatted?.unit ? (
                      <Text
                        style={{ fontSize: 14, fontWeight: '500' }}
                      >{` ${t(`metricUnits.${formatted.unit}`)}`}</Text>
                    ) : null}
                  </Text>
                </View>
              );
            })}
          </View>
          <PeriodLineChart
            values={values}
            labels={formatBucketLabels(buckets, size, locale)}
            valueText={(value) => formatChartValue(value, quantity, unit, locale)}
            width={width - 2 * PADDING}
            height={CHART_HEIGHT}
          />
        </>
      )}
    </Pressable>
  );
}

function StepButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
}: {
  readonly icon: SymbolViewProps['name'];
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
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.tertiarySystemBackground,
        opacity: disabled ? 0.3 : pressed ? 0.7 : 1,
      })}
    >
      <SymbolView name={icon} size={15} weight="semibold" tintColor={colors.label} />
    </Pressable>
  );
}
