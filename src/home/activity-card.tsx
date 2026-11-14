import { Group, Path, Picture, Skia } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, useWindowDimensions, View } from 'react-native';

import type { Activity } from '@/core/activity';
import { sportIcon } from '@/core/activity-block';
import type { LocalDate } from '@/core/dates';
import { cardMetrics, metricValue, toDisplayMetric } from '@/core/metrics';
import { formatPlace, startOf } from '@/core/place';
import type { LatLng } from '@/core/geo';
import { frameViewport, toPixels, type Viewport } from '@/core/map-tiles';
import { decodePolyline } from '@/core/polyline';
import type { DistanceUnit } from '@/core/units';
import { lookUpPlace } from '@/data/place-lookup';
import { CARD_BORDER, cardSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';
import { CardGradient } from '@/ui/card-gradient';
import { formatMetric, formatRelativeDay } from '@/ui/format';
import { SportGlyph } from '@/ui/sport-glyph';
import { INTERFACE_FACES, MAX_FONT_SCALE, Text } from '@/ui/text';
import { useAsync } from '@/ui/use-async';
import { useMapPicture } from '@/ui/use-map-picture';

const PADDING = 16;
const RADIUS = 20;
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
 * the same room, as Share Aura), all over its map (ADR 021) once it has loaded, the route
 * projected with the map's viewport so that both line up. The place's and the
 * data's rows are kept on every card, so that all are as tall and nothing moves when the place
 * comes. A tap goes on to choose what to make with it, or does what `onPress` says (the editor
 * choosing another activity). It shows only what the list gives, asking nothing more: Strava's
 * lists have no calories, so a workout's card says its time and average heart rate (the owner's
 * choice: a request a card, from the app's Strava quota, doesn't scale).
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
  // The canvas lies inside the card's edge.
  const canvasWidth = width - 2 * CARD_BORDER;
  const canvasHeight = height - 2 * CARD_BORDER;
  const viewport = useMemo(
    () => routeViewport(activity.routePolyline, squareTop, side, canvasWidth, canvasHeight),
    [activity.routePolyline, squareTop, side, canvasWidth, canvasHeight],
  );
  const route = useMemo(
    () => (viewport === null ? null : routePath(viewport.points, viewport.viewport)),
    [viewport],
  );
  const map = useMapPicture(viewport?.viewport ?? null);
  const corners = useMemo(
    () =>
      Skia.RRectXY(
        Skia.XYWHRect(0, 0, canvasWidth, canvasHeight),
        RADIUS - CARD_BORDER,
        RADIUS - CARD_BORDER,
      ),
    [canvasWidth, canvasHeight],
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
        ...cardSurface(RADIUS),
        width,
        height,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <CardGradient width={width} height={height} radius={RADIUS}>
        {map === null ? null : (
          <Group clip={corners}>
            <Picture picture={map} />
          </Group>
        )}
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
          {/* The day's color: a lighter gray got lost over the map. */}
          <SportGlyph icon={sportIcon(activity)} size={GLYPH_SIZE} color={colors.label} />
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
 * The route's points and the viewport of the card's canvas that fits them whole and centered in
 * the square `side` wide at (PADDING, `squareTop`), with {@link ROUTE_INSET} of room inside it:
 * the map's, so that the route and the map line up. `null` without a route.
 */
function routeViewport(
  polyline: string | null,
  squareTop: number,
  side: number,
  width: number,
  height: number,
): { readonly points: readonly LatLng[]; readonly viewport: Viewport } | null {
  if (polyline === null) {
    return null;
  }
  const points = decodePolyline(polyline);
  if (points.length < 2) {
    return null;
  }
  const inner = side - 2 * ROUTE_INSET;
  const frame = {
    x: PADDING + ROUTE_INSET,
    y: squareTop + ROUTE_INSET,
    width: inner,
    height: inner,
  };
  return { points, viewport: frameViewport(points, frame, width, height) };
}

/** The route as a Skia path in the viewport's drawing. */
function routePath(points: readonly LatLng[], viewport: Viewport) {
  const builder = Skia.PathBuilder.Make();
  points.forEach((point, i) => {
    const { x, y } = toPixels(point, viewport);
    if (i === 0) {
      builder.moveTo(x, y);
    } else {
      builder.lineTo(x, y);
    }
  });
  return builder.detach();
}
