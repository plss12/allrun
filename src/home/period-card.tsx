import { Group } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, PixelRatio, Pressable, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Spinner } from '@/ui/spinner';
import type { Activity } from '@/core/activity';
import type { DateRange, LocalDate } from '@/core/dates';
import type { SportFamily } from '@/core/sports';
import {
  bucketForPeriod,
  customRangeLimits,
  type PeriodKind,
  periodContaining,
  setCustomRangeDate,
  shiftPeriod,
  startCustomRange,
} from '@/core/periods';
import {
  type BucketSize,
  bucketize,
  type PeriodSummary,
  type SummaryBucket,
  summarize,
  type SummaryPage,
  summaryPages,
} from '@/core/summary';
import {
  defaultSummaryMetrics,
  summaryHasDistance,
  summaryMetricValue,
  toDisplaySummaryMetric,
} from '@/core/summary-metrics';
import type { DistanceUnit } from '@/core/units';
import { useActivitySource } from '@/data/activity-source';
import { CARD_BORDER, cardSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';
import { CardGradient } from '@/ui/card-gradient';
import { AppIcon, type UiIconName } from '@/ui/app-icon';
import { DateRangeField } from '@/ui/date-range-field';
import { formatBucketLabels, formatChartValue, formatMetric, formatPeriodName } from '@/ui/format';
import { SportGlyph } from '@/ui/sport-glyph';
import { ErrorView } from '@/ui/state-views';
import { Text } from '@/ui/text';
import { useAsync } from '@/ui/use-async';

import { PeriodChartDrawing, PeriodChartLabels } from './period-line-chart';

/** Height of a page, the same while loading, on error or empty, so the list never jumps. */
const PAGE_HEIGHT = 262;
const CHART_HEIGHT = 140;
const PADDING = 16;
/**
 * The most characters of a total, unit included, that fit a third of the card at 22 pt on a screen
 * of 360 pt ("287:36 h", 89 of its 90 pt); longer ones, rare, go at 18 pt.
 */
const MAX_FULL_SIZE_TOTAL = 8;

/** A period and its sports, as a page of a period's card offers it. */
export interface PeriodChoice {
  readonly kind: PeriodKind;
  readonly range: DateRange;
  /** The sports summed up; empty for all of them. */
  readonly families: readonly SportFamily[];
}

/** Goes on to choose what to make with a period and its sports, named by `line`. */
function openSelection({ kind, range, families }: PeriodChoice, line: string): void {
  router.push({
    pathname: '/select',
    params: {
      mode: 'summary',
      kind,
      start: range.start,
      end: range.end,
      families: families.join(','),
      line,
    },
  });
}

/** A page of a period's card: one sport (or all), what it sums up and what its chart draws. */
interface PeriodPage {
  readonly sport: SummaryPage;
  readonly summary: PeriodSummary;
  readonly buckets: readonly SummaryBucket[];
  readonly size: BucketSize;
  readonly values: readonly number[];
  readonly labels: readonly string[];
  readonly valueText: (value: number) => string;
}

/** The pages of `kind`'s card over `range`, from its activities. */
function periodPages(
  kind: PeriodKind,
  range: DateRange,
  activities: readonly Activity[],
  unit: DistanceUnit,
  locale: string,
): readonly PeriodPage[] {
  const size = bucketForPeriod(kind, range);
  return summaryPages(activities, range).map((sport): PeriodPage => {
    const filter = sport === 'all' ? {} : { families: [sport] };
    const summary = summarize(activities, range, filter);
    const buckets = bucketize(activities, range, size, filter);
    const quantity = summaryHasDistance(summary) ? 'distance' : 'time';
    return {
      sport,
      summary,
      buckets,
      size,
      values: buckets.map((bucket) =>
        quantity === 'distance' ? bucket.distanceMeters : bucket.movingTimeSeconds,
      ),
      labels: formatBucketLabels(buckets, size, locale),
      valueText: (value) => formatChartValue(value, quantity, unit, locale),
    };
  });
}

/** The page under the pager at `offset`, of `count` pages `width` wide. */
function pageAt(offset: number, width: number, count: number): number {
  'worklet';
  return Math.min(count - 1, Math.max(0, Math.round(offset / width)));
}

/**
 * A period's summary on the home screen: this week, month or year (stepping back with the
 * arrows) or a custom range, scrolling sideways through all sports and then each one done in
 * it. A page goes on to choose what to make with that period and sport, or does what `onChoose`
 * says (the editor choosing another period).
 *
 * One Skia canvas for the card: its gradient and its pages' charts, which follow the pager on the
 * UI thread through a shared value, as a gallery's tiles do (ADR 014). A canvas per chart, on top
 * of the card's, cost a surface and a first draw each, and the Summaries tab, a dozen of them at
 * once, opened with a frame of half a second on a modest phone. The texts stay views, in the pages.
 */
export function PeriodCard({
  kind,
  width,
  today,
  unit,
  locale,
  onChoose = (choice) => openSelection(choice, formatPeriodName(choice.kind, choice.range, locale)),
}: {
  readonly kind: PeriodKind;
  readonly width: number;
  readonly today: LocalDate;
  readonly unit: DistanceUnit;
  readonly locale: string;
  readonly onChoose?: (choice: PeriodChoice) => void;
}) {
  const { t } = useTranslation();
  const source = useActivitySource();
  const [range, setRange] = useState<DateRange>(() =>
    kind === 'custom'
      ? startCustomRange(periodContaining('month', today), today)
      : periodContaining(kind, today),
  );
  const activities = useAsync(() => source.listInRange(range), `${range.start}/${range.end}`);
  const pages = useMemo(
    () =>
      activities.status === 'success'
        ? periodPages(kind, range, activities.data, unit, locale)
        : null,
    // `activities` is a new object on each render; its data only changes with the range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, range, activities.status === 'success' ? activities.data : null, unit, locale],
  );
  const [page, setPage] = useState(0);
  /** Whether the pages beside the one shown are drawn: since the finger first swipes. */
  const [swiping, setSwiping] = useState(false);
  /** The page under a finger, dimmed while pressed. */
  const [pressed, setPressed] = useState<number | null>(null);
  /** Where the pager is, read on the UI thread, for the charts to follow it frame by frame. */
  const offset = useSharedValue(0);
  const rangeKey = `${range.start}/${range.end}`;
  // A new period starts again on its first page.
  const changeRange = (next: DateRange) => {
    setRange(next);
    setPage(0);
    setSwiping(false);
    setPressed(null);
    offset.set(0);
  };
  const step = (direction: -1 | 1) => changeRange(shiftPeriod(kind, range, direction));
  const isCurrent = range.end >= today;
  const [height, setHeight] = useState(0);
  /** How far down the card the pages start, edge included, once laid out. */
  const [pagesTop, setPagesTop] = useState<number | null>(null);
  /** Where each page's chart is in it, by period and sport, once laid out. */
  const [chartAt, setChartAt] = useState<
    Readonly<Record<string, { readonly x: number; readonly y: number }>>
  >({});
  // Pages as wide as the inside of the card's edge, which is what the pager pages by.
  const pageWidth = width - 2 * CARD_BORDER;
  const chartWidth = pageWidth - 2 * PADDING;
  // On whole pixels, as the pager scrolls its pages and places them: the charts stay as sharp, and
  // in step with their texts.
  const pagesAt = useDerivedValue(() => [
    { translateX: -Math.round(offset.get() * PIXEL_RATIO) / PIXEL_RATIO },
  ]);

  return (
    <View
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={{ ...cardSurface(20), width }}
    >
      {height === 0 ? null : (
        <CardGradient width={width} height={height} radius={20}>
          {pages === null || pagesTop === null ? null : (
            // The canvas starts inside the card's edge, as the pages do.
            <Group
              clip={{ x: 0, y: pagesTop - CARD_BORDER, width: pageWidth, height: PAGE_HEIGHT }}
            >
              <Group transform={pagesAt}>
                {pages.map((one, i) => {
                  const at = chartAt[`${rangeKey}/${one.sport}`];
                  // The page shown and, once swiping, those beside it.
                  return at === undefined || Math.abs(i - page) > (swiping ? 1 : 0) ? null : (
                    <PeriodChartDrawing
                      key={one.sport}
                      values={one.values}
                      labels={one.labels}
                      width={chartWidth}
                      height={CHART_HEIGHT}
                      x={PixelRatio.roundToNearestPixel(i * pageWidth) + at.x}
                      y={pagesTop - CARD_BORDER + at.y}
                      opacity={pressed === i ? PRESSED_OPACITY : 1}
                    />
                  );
                })}
              </Group>
            </Group>
          )}
        </CardGradient>
      )}
      {kind === 'custom' ? (
        <View style={{ padding: PADDING, paddingBottom: 0, gap: 12 }}>
          {/* Centered, as the other periods' names between their arrows. */}
          <Text
            style={{ color: colors.label, fontSize: 17, fontWeight: '700', textAlign: 'center' }}
          >
            {t('home.periods.custom')}
          </Text>
          <DateRangeField
            range={range}
            limits={customRangeLimits(range, today)}
            labels={{ start: t('summary.from'), end: t('summary.to') }}
            locale={locale}
            onChange={(end, date) => changeRange(setCustomRangeDate(range, end, date, today))}
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
            icon="chevronLeft"
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
            icon="chevronRight"
            accessibilityLabel={t('summary.next')}
            disabled={isCurrent}
            onPress={() => step(1)}
          />
        </View>
      )}
      {activities.status === 'loading' ? (
        <View style={{ height: PAGE_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner accessibilityLabel={t('common.loading')} />
        </View>
      ) : activities.status === 'error' ? (
        <View style={{ height: PAGE_HEIGHT }}>
          <ErrorView message={t('summary.error')} onRetry={activities.retry} />
        </View>
      ) : pages === null ? null : (
        <Pages
          kind={kind}
          range={range}
          pages={pages}
          width={pageWidth}
          page={page}
          onPage={setPage}
          onSwipe={() => setSwiping(true)}
          onPressed={setPressed}
          offset={offset}
          onLayout={(event) => setPagesTop(event.nativeEvent.layout.y)}
          onChartLayout={(sport, event) => {
            const { x, y } = event.nativeEvent.layout;
            const key = `${rangeKey}/${sport}`;
            setChartAt((known) =>
              known[key]?.x === x && known[key]?.y === y ? known : { ...known, [key]: { x, y } },
            );
          }}
          unit={unit}
          locale={locale}
          onChoose={onChoose}
        />
      )}
    </View>
  );
}

/** Device pixels in a point. */
const PIXEL_RATIO = PixelRatio.get();

/** How a page looks while a finger presses it, its chart too. */
const PRESSED_OPACITY = 0.7;

function Pages({
  kind,
  range,
  pages,
  width,
  page,
  onPage,
  onSwipe,
  onPressed,
  offset,
  onLayout,
  onChartLayout,
  unit,
  locale,
  onChoose,
}: {
  readonly kind: PeriodKind;
  readonly range: DateRange;
  readonly pages: readonly PeriodPage[];
  readonly width: number;
  readonly page: number;
  readonly onPage: (page: number) => void;
  readonly onSwipe: () => void;
  readonly onPressed: (page: number | null) => void;
  readonly offset: SharedValue<number>;
  readonly onLayout: (event: LayoutChangeEvent) => void;
  readonly onChartLayout: (sport: SummaryPage, event: LayoutChangeEvent) => void;
  readonly unit: DistanceUnit;
  readonly locale: string;
  readonly onChoose: (choice: PeriodChoice) => void;
}) {
  const count = pages.length;
  const shownOnUI = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      scheduleOnRN(onSwipe);
    },
    // The dot and the chart follow the finger, not only the end of the swipe.
    onScroll: (event) => {
      offset.set(event.contentOffset.x);
      const shown = pageAt(event.contentOffset.x, width, count);
      if (shown !== shownOnUI.get()) {
        shownOnUI.set(shown);
        scheduleOnRN(onPage, shown);
      }
    },
  });
  return (
    <View onLayout={onLayout}>
      <Animated.FlatList
        // A new period lays its pages out again from the first.
        key={`${range.start}/${range.end}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={pages}
        keyExtractor={(item) => item.sport}
        // Its views only: the charts are on the card's canvas.
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        windowSize={3}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        scrollEventThrottle={16}
        onScroll={onScroll}
        renderItem={({ item, index }) => (
          <SportPage
            kind={kind}
            range={range}
            page={item}
            width={width}
            unit={unit}
            locale={locale}
            onChoose={onChoose}
            onPressIn={() => onPressed(index)}
            onPressOut={() => onPressed(null)}
            onChartLayout={(event) => onChartLayout(item.sport, event)}
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
              key={item.sport}
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

/** One sport (or all) of the period: its name, its totals and its chart's texts. */
function SportPage({
  kind,
  range,
  page,
  width,
  unit,
  locale,
  onChoose,
  onPressIn,
  onPressOut,
  onChartLayout,
}: {
  readonly kind: PeriodKind;
  readonly range: DateRange;
  readonly page: PeriodPage;
  readonly width: number;
  readonly unit: DistanceUnit;
  readonly locale: string;
  readonly onChoose: (choice: PeriodChoice) => void;
  readonly onPressIn: () => void;
  readonly onPressOut: () => void;
  readonly onChartLayout: (event: LayoutChangeEvent) => void;
}) {
  const { t } = useTranslation();
  const { sport, summary } = page;
  const empty = summary.activityCount === 0;
  const name = t(sport === 'all' ? 'summary.allSports' : `families.${sport}`);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      disabled={empty}
      onPress={() => onChoose({ kind, range, families: sport === 'all' ? [] : [sport] })}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => ({
        width,
        height: PAGE_HEIGHT,
        padding: PADDING,
        gap: 12,
        opacity: pressed ? PRESSED_OPACITY : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <SportGlyph icon={sport} size={14} color={colors.secondaryLabel} />
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
              const unitName = formatted?.unit ? ` ${t(`metricUnits.${formatted.unit}`)}` : '';
              const length = (formatted?.value.length ?? 0) + unitName.length;
              return (
                <View key={metric} style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.secondaryLabel, fontSize: 12 }}>
                    {t(`summaryMetrics.${metric}`).toLocaleUpperCase(locale)}
                  </Text>
                  <Text
                    selectable
                    numberOfLines={1}
                    maxFontSizeMultiplier={1}
                    style={{
                      color: colors.label,
                      fontSize: length > MAX_FULL_SIZE_TOTAL ? 18 : 22,
                      fontWeight: '700',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {formatted === null ? '—' : formatted.value}
                    {unitName === '' ? null : (
                      <Text style={{ fontSize: 14, fontWeight: '500' }}>{unitName}</Text>
                    )}
                  </Text>
                </View>
              );
            })}
          </View>
          <PeriodChartLabels
            values={page.values}
            labels={page.labels}
            valueText={page.valueText}
            width={width - 2 * PADDING}
            height={CHART_HEIGHT}
            onLayout={onChartLayout}
          />
        </>
      )}
    </Pressable>
  );
}

/** An arrow alone, in a touch target as big as the circle it had (decision of the user). */
function StepButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
}: {
  readonly icon: UiIconName;
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
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : pressed ? 0.7 : 1,
      })}
    >
      <AppIcon name={icon} size={32} color={colors.label} />
    </Pressable>
  );
}
