import { Path, Skia } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, useWindowDimensions, View } from 'react-native';

import type { Activity } from '@/core/activity';
import { sportIcon } from '@/core/activity-block';
import type { LocalDate } from '@/core/dates';
import { cardMetrics, metricValue, toDisplayMetric } from '@/core/metrics';
import { formatPlace, startOf } from '@/core/place';
import { decodePolyline } from '@/core/polyline';
import { projectRoutes } from '@/core/route-projection';
import type { DistanceUnit } from '@/core/units';
import { useActivitySource, useActivitySourceKey } from '@/data/activity-source';
import { lookUpPlace } from '@/data/place-lookup';
import { cardSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';
import { CardGradient } from '@/ui/card-gradient';
import { formatMetric, formatRelativeDay } from '@/ui/format';
import { SportGlyph } from '@/ui/sport-glyph';
import { INTERFACE_FACES, MAX_FONT_SCALE, Text } from '@/ui/text';
import { useAsync } from '@/ui/use-async';

const PADDING = 16;
/** Room around the route inside its square, so its line never touches the square's edge. */
const ROUTE_INSET = 6;
/** The day's size and letter, and the place's letter under it. */
const DAY_SIZE = 28;
const DAY_WEIGHT = '600';
/** Inter's own line (1.21 em): the day's and the place's rows are that tall, at the text size. */
const DAY_LINE = DAY_SIZE * 1.21;
/** The sport's icon, top right. */
const GLYPH_SIZE = 24;
/** Monospaced digits, as AURA writes its data: columns of numbers line up. */
const DATA_FONT = INTERFACE_FACES.mono;
const DATA_SIZE = 17;
const DATA_LINE = 23;
/** The data's lines: room for the most a card has (`cardMetrics`), so that every card is alike. */
const DATA_LINES = 3;
/** The place's size, under the day: smaller than it, as big as a datum reads. */
const PLACE_SIZE = 16;
const PLACE_LINE = PLACE_SIZE * 1.21;
const PLACE_GAP = 2;
/** Room between the header, the route's square and the data. */
const SECTION_GAP = 12;

/**
 * Where everything goes on a card `width` wide, with the phone's text `scale` (the rows grow with
 * it, up to the app's cap): the header (the day, and the place under it), then the route's square,
 * as wide as the card inside its padding, then the data. Every card is as tall, so that every
 * route takes the same room (the owner's choice, as Share Aura does).
 */
function cardLayout(width: number, scale: number) {
  const side = width - 2 * PADDING;
  const dayLine = Math.ceil(DAY_LINE * scale);
  const placeLine = Math.ceil(PLACE_LINE * scale);
  const squareTop = PADDING + dayLine + PLACE_GAP + placeLine + SECTION_GAP;
  const dataTop = squareTop + side + SECTION_GAP;
  const height = dataTop + Math.ceil(DATA_LINES * DATA_LINE * scale) + PADDING;
  return { side, dayLine, placeLine, squareTop, dataTop, height };
}

/**
 * An activity in the gallery, as wide as the screen: its day and sport on top, with where it
 * started under the day ("Andújar, Jaén"; in a row of its own, never cut beside a long day), its
 * route (trimmed at both ends, as in the images) fitted in a square of its own, or, without one,
 * its sport's icon there, and its three main data under it (the owner's choices: every route in
 * the same room, as Share Aura; a map will lie under the card, ADR 021). The place's and the
 * data's rows are kept on every card, so that all are as tall and nothing moves when the place
 * comes. A tap goes on to choose what to make with it, or does what `onPress` says (the editor
 * choosing another activity).
 */
export function ActivityCard({
  activity,
  width,
  today,
  unit,
  locale,
  onPress,
}: {
  readonly activity: Activity;
  readonly width: number;
  readonly today: LocalDate;
  readonly unit: DistanceUnit;
  readonly locale: string;
  readonly onPress?: () => void;
}) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const { side, dayLine, placeLine, squareTop, dataTop, height } = cardLayout(
    width,
    Math.min(fontScale, MAX_FONT_SCALE),
  );
  const day = formatRelativeDay(activity.localDate, today, locale, {
    today: t('home.today'),
    yesterday: t('home.yesterday'),
  });
  // Strava's list has no calories: a card without a distance, which shows them, asks for the
  // activity's detail (kept a week, as when it is opened in the editor). Their row is kept meanwhile.
  const source = useActivitySource();
  const sourceKey = useActivitySourceKey();
  const needsCalories = !(activity.distanceMeters > 0) && activity.calories === null;
  const detailed = useAsync(
    () => (needsCalories ? source.getActivity(activity.id) : Promise.resolve(null)),
    `card-calories|${sourceKey}|${activity.id}|${needsCalories ? 'ask' : 'no'}`,
  );
  const shown =
    detailed.status === 'success' && detailed.data !== null
      ? { ...activity, calories: detailed.data.calories }
      : activity;
  // Until they come, the calories keep their line, empty, so that the data under it don't move.
  const pending = needsCalories && detailed.status === 'loading';
  const data = cardMetrics(pending ? { ...activity, calories: 1 } : shown).flatMap((metric) => {
    if (pending && metric === 'calories') {
      return [''];
    }
    const value = metricValue(shown, metric);
    if (value === null) {
      return [];
    }
    const { value: text, unit: unitLabel } = formatMetric(
      toDisplayMetric(metric, value, { unit, sportFamily: activity.sportFamily }),
      locale,
    );
    return [unitLabel === null ? text : `${text} ${t(`metricUnits.${unitLabel}`)}`];
  });
  // Where it started, named by the phone (kept on it once named): it comes after the card.
  const start = useMemo(() => startOf(activity), [activity]);
  const lookup = useAsync(
    () => lookUpPlace(start, false),
    `place|${start === null ? 'none' : start.join(',')}`,
  );
  const place =
    lookup.status === 'success' && lookup.data.status === 'known'
      ? formatPlace(lookup.data.place, 'cityRegion')
      : null;
  const route = useMemo(
    () => routePath(activity.routePolyline, PADDING, squareTop, side),
    [activity.routePolyline, squareTop, side],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[day, place, t(`modalities.${activity.sportModality}`), ...data]
        .filter((part) => part !== null && part !== '')
        .join(', ')}
      onPress={
        onPress ??
        (() =>
          router.push({
            pathname: '/select',
            params: {
              mode: 'activity',
              activityId: activity.id,
              line: data.filter((text) => text !== '').join(' · '),
            },
          }))
      }
      style={({ pressed }) => ({
        ...cardSurface(20),
        width,
        height,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <CardGradient width={width} height={height} radius={20}>
        {route === null ? null : (
          <Path
            path={route}
            style="stroke"
            strokeWidth={3}
            strokeCap="round"
            strokeJoin="round"
            color="#FFFFFF"
          />
        )}
      </CardGradient>
      {route === null ? (
        <View
          style={{
            position: 'absolute',
            top: squareTop,
            left: PADDING,
            width: side,
            height: side,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SportGlyph icon={sportIcon(activity)} size={side * 0.3} color={colors.tertiaryLabel} />
        </View>
      ) : null}
      <View style={{ padding: PADDING }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: dayLine }}>
          <Text
            numberOfLines={1}
            style={{ flex: 1, color: colors.label, fontSize: DAY_SIZE, fontWeight: DAY_WEIGHT }}
          >
            {day}
          </Text>
          <SportGlyph icon={sportIcon(activity)} size={GLYPH_SIZE} color={colors.secondaryLabel} />
        </View>
        <Text
          numberOfLines={1}
          style={{
            height: placeLine,
            marginTop: PLACE_GAP,
            color: colors.secondaryLabel,
            fontSize: PLACE_SIZE,
            fontWeight: DAY_WEIGHT,
          }}
        >
          {place ?? ''}
        </Text>
      </View>
      <View style={{ position: 'absolute', left: PADDING, top: dataTop }}>
        {data.map((text, i) => (
          <Text
            key={text === '' ? 'pending' : text}
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
 * The route as a Skia path, fitted whole and centered in the square `side` wide at (`left`,
 * `top`), with {@link ROUTE_INSET} of room inside it; `null` without one.
 */
function routePath(polyline: string | null, left: number, top: number, side: number) {
  if (polyline === null) {
    return null;
  }
  const points = decodePolyline(polyline);
  if (points.length < 2) {
    return null;
  }
  const inner = side - 2 * ROUTE_INSET;
  const [projected] = projectRoutes([points], inner, inner);
  const builder = Skia.PathBuilder.Make();
  projected.forEach(({ x, y }, i) => {
    const at = { x: left + ROUTE_INSET + x, y: top + ROUTE_INSET + y };
    if (i === 0) {
      builder.moveTo(at.x, at.y);
    } else {
      builder.lineTo(at.x, at.y);
    }
  });
  return builder.detach();
}
