import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Text, View } from 'react-native';

import type { Activity } from '@/core/activity';
import type { LocalDate } from '@/core/dates';
import { cardMetrics, metricValue, toDisplayMetric } from '@/core/metrics';
import { decodePolyline } from '@/core/polyline';
import { DEFAULT_PRIVACY_TRIM_METERS, trimRouteEnds } from '@/core/route-privacy';
import { type Box, largestFit, projectRoutes, routeSpan } from '@/core/route-projection';
import type { DistanceUnit } from '@/core/units';
import { colors } from '@/theme/colors';
import { formatMetric, formatRelativeDay } from '@/ui/format';

import { SPORT_SYMBOLS } from './sport-symbols';

/** Room around the route inside its box, so its line never touches the card's edge. */
const ROUTE_INSET = 6;
const PADDING = 16;
/** Room the day takes at the top, kept clear of the route. */
const HEADER = 32;
/** Cards are wider than tall, so two and a half fit on a screen. */
const ASPECT = 3 / 4;
/** Monospaced digits, as AURA writes its data: columns of numbers line up. */
const DATA_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' });
const DATA_SIZE = 14;
const DATA_LINE = 19;
/**
 * Width of a character of the data, as a share of its size: monospaced fonts (Menlo, Droid Sans
 * Mono) all measure about 0.6, so the data's corner is known before it is laid out.
 */
const CHAR_WIDTH = 0.61;
/** Room kept between the data and the route. */
const DATA_GAP = 12;

/**
 * An activity in the gallery, as wide as the screen: its day and sport on top, its route (trimmed
 * at both ends, as in the images) or, without one, its sport's icon, filling the card, and its
 * three main data over it at the bottom left, where a map will lie under them (ADR 009).
 */
export function ActivityCard({
  activity,
  width,
  today,
  unit,
  locale,
}: {
  readonly activity: Activity;
  readonly width: number;
  readonly today: LocalDate;
  readonly unit: DistanceUnit;
  readonly locale: string;
}) {
  const { t } = useTranslation();
  const height = Math.round(width * ASPECT);
  const routeWidth = width - 2 * PADDING;
  const routeHeight = height - HEADER - 2 * PADDING;
  const day = formatRelativeDay(activity.localDate, today, locale, {
    today: t('home.today'),
    yesterday: t('home.yesterday'),
  });
  const data = cardMetrics(activity).flatMap((metric) => {
    const value = metricValue(activity, metric);
    if (value === null) {
      return [];
    }
    const { value: text, unit: unitLabel } = formatMetric(
      toDisplayMetric(metric, value, { unit, sportFamily: activity.sportFamily }),
      locale,
    );
    return [unitLabel === null ? text : `${text} ${t(`metricUnits.${unitLabel}`)}`];
  });
  const dataWidth = Math.max(...data.map((text) => text.length)) * DATA_SIZE * CHAR_WIDTH;
  const dataHeight = data.length * DATA_LINE;
  const route = useMemo(
    () => routePath(activity.routePolyline, freeAreas(width, height, dataWidth, dataHeight)),
    [activity.routePolyline, width, height, dataWidth, dataHeight],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[day, t(`modalities.${activity.sportModality}`), ...data].join(', ')}
      onPress={() =>
        router.push({ pathname: '/editor', params: { mode: 'activity', activityId: activity.id } })
      }
      style={({ pressed }) => ({
        width,
        height,
        borderRadius: 20,
        borderCurve: 'continuous',
        backgroundColor: colors.secondarySystemBackground,
        overflow: 'hidden',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {route === null ? (
        <View
          style={{
            position: 'absolute',
            top: PADDING + HEADER,
            left: PADDING,
            width: routeWidth,
            height: routeHeight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SymbolView
            name={SPORT_SYMBOLS[activity.sportFamily]}
            size={routeHeight * 0.45}
            tintColor={colors.tertiaryLabel}
          />
        </View>
      ) : (
        <Canvas style={{ position: 'absolute', width, height }}>
          <Path
            path={route}
            style="stroke"
            strokeWidth={2.5}
            strokeCap="round"
            strokeJoin="round"
            color="#FFFFFF"
          />
        </Canvas>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: PADDING }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, color: colors.label, fontSize: 22, fontWeight: '600' }}
        >
          {day}
        </Text>
        <SymbolView
          name={SPORT_SYMBOLS[activity.sportFamily]}
          size={20}
          tintColor={colors.secondaryLabel}
        />
      </View>
      <View style={{ position: 'absolute', left: PADDING, bottom: PADDING }}>
        {data.map((text, i) => (
          <Text
            key={text}
            numberOfLines={1}
            style={{
              color: i === 0 ? colors.label : colors.secondaryLabel,
              fontFamily: DATA_FONT,
              fontSize: DATA_SIZE,
              lineHeight: DATA_LINE,
            }}
          >
            {text}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

/**
 * Where a card's route may go: the data take the bottom left corner, so the route goes above
 * them (where wide routes come out biggest) or beside them (tall ones), never across them.
 */
function freeAreas(width: number, height: number, dataWidth: number, dataHeight: number): Box[] {
  const top = PADDING + HEADER;
  const routeWidth = width - 2 * PADDING;
  const routeHeight = height - HEADER - 2 * PADDING;
  return [
    { x: PADDING, y: top, width: routeWidth, height: routeHeight - dataHeight - DATA_GAP },
    {
      x: PADDING + dataWidth + DATA_GAP,
      y: top,
      width: routeWidth - dataWidth - DATA_GAP,
      height: routeHeight,
    },
  ];
}

/**
 * The route as a Skia path, fitted into whichever free area of the card holds it biggest, or
 * `null` without one.
 */
function routePath(polyline: string | null, free: readonly Box[]) {
  if (polyline === null) {
    return null;
  }
  const points = trimRouteEnds(decodePolyline(polyline), DEFAULT_PRIVACY_TRIM_METERS);
  if (points.length < 2) {
    return null;
  }
  const box = largestFit(routeSpan([points]), free);
  const [projected] = projectRoutes(
    [points],
    box.width - 2 * ROUTE_INSET,
    box.height - 2 * ROUTE_INSET,
  );
  const builder = Skia.PathBuilder.Make();
  projected.forEach(({ x, y }, i) => {
    const at = { x: x + box.x + ROUTE_INSET, y: y + box.y + ROUTE_INSET };
    if (i === 0) {
      builder.moveTo(at.x, at.y);
    } else {
      builder.lineTo(at.x, at.y);
    }
  });
  return builder.detach();
}
