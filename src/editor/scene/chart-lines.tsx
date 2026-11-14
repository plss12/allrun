import {
  Circle,
  Group,
  Line,
  LinearGradient,
  Paint,
  Path,
  RoundedRect,
  Skia,
  type SkParagraph,
} from '@shopify/react-native-skia';
import type { ReactElement } from 'react';

import { lineLevel, type LineScale, type LineSeries } from '@/core/activity-charts';
import { castsShadow } from '@/core/layer-style';
import type { Activity } from '@/core/activity';
import { type HeartRateZones, zoneEdges } from '@/core/heart-rate-zones';
import type { Point } from '@/core/route-projection';
import type { ActivityChartSeries } from '@/core/template';

import { type ActivityData, heartRateZonesOf } from '../editor-data';
import { DropShadow } from '../scene-text';
import { ParagraphPicture } from '../paragraph-picture';
import {
  AREA_OPACITY,
  CHART_HEIGHT,
  CHART_WIDTH,
  DashedLine,
  LINE_FLOOR,
  LINE_WIDTH,
  widthOf,
  withAlpha,
} from './chart-frame';

/**
 * Colors of a chart's zones, lowest first, as sports apps paint them, from the iOS palette the app
 * uses: five (a heart rate's) grey, blue, green, orange and red; six (a pace's) with a yellow
 * before the orange; seven (a ride's power) with a purple after the red. Zones past them take the
 * last color. Time O(z).
 */
export function zoneColors(count: number): string[] {
  const palette =
    count <= 5
      ? ['#A1A1A6', '#3D8BFD', '#34C759', '#FF9F0A', '#FF453A']
      : count === 6
        ? ['#A1A1A6', '#3D8BFD', '#34C759', '#FFD60A', '#FF9F0A', '#FF453A']
        : ['#A1A1A6', '#3D8BFD', '#34C759', '#FFD60A', '#FF9F0A', '#FF453A', '#BF5AF2'];
  return Array.from({ length: count }, (_, i) => palette[Math.min(i, palette.length - 1)]);
}

/**
 * The zones a chart of `series` can show, with the time spent in each: Strava's own for the
 * activity (a subscriber's), or a heart rate's counted on its stream in the athlete's zones
 * (`heartRateZonesOf`). `null` when the activity hasn't them (no heart rate, no zones from
 * Strava). Time O(n · z) for a heart rate of n samples counted.
 */
export function chartZones(
  series: ActivityChartSeries,
  data: ActivityData,
): {
  readonly measure: 'heartRate' | 'pace' | 'power';
  readonly zones: HeartRateZones;
  readonly seconds: readonly number[];
} | null {
  switch (series) {
    case 'heartRate': {
      const distribution = heartRateZonesOf(data);
      return distribution === null
        ? null
        : { measure: 'heartRate', zones: distribution.zones, seconds: distribution.seconds };
    }
    case 'pace':
    case 'power': {
      const distribution = data.detail?.zones?.[series] ?? null;
      return distribution === null
        ? null
        : { measure: series, zones: distribution.zones, seconds: distribution.seconds };
    }
    default:
      return null;
  }
}

/**
 * A line over an area that fades out downwards, the shape of an activity's elevation, pace, heart
 * rate or power along the way, between the lowest and the highest values (with some room below
 * the lowest, so the area keeps some body), on its `scale` (see `lineLevel`). Optionally, a dashed
 * line at the `average`, and the line colored by heart rate `zones`.
 */
export function LineBody({
  series,
  scale,
  color,
  average,
  zones,
}: {
  readonly series: LineSeries;
  readonly scale: LineScale;
  readonly color: string;
  /** Where the dashed average line goes, in the series' units; `null` for none. */
  readonly average: number | null;
  /** The zones, to paint each stretch of the line in its zone's color. */
  readonly zones: { readonly zones: HeartRateZones; readonly colors: readonly string[] } | null;
}) {
  const yOf = (value: number) =>
    CHART_HEIGHT - lineLevel(value, series, scale, LINE_FLOOR) * CHART_HEIGHT;
  const points = series.points.map((point) => ({ x: point.x * CHART_WIDTH, y: yOf(point.y) }));
  const pathOf = (stretch: readonly Point[]) => {
    const builder = Skia.PathBuilder.Make();
    stretch.forEach((point, i) =>
      i === 0 ? builder.moveTo(point.x, point.y) : builder.lineTo(point.x, point.y),
    );
    return builder;
  };
  const area = pathOf(points);
  area.lineTo(points[points.length - 1].x, CHART_HEIGHT);
  area.lineTo(points[0].x, CHART_HEIGHT);
  area.close();
  const top = Math.min(...points.map((point) => point.y));
  // The activity's own average may fall outside the line's range: it stays within the chart.
  const averageY = average === null ? null : Math.min(CHART_HEIGHT, Math.max(0, yOf(average)));
  const stroke = {
    style: 'stroke',
    strokeWidth: LINE_WIDTH,
    strokeCap: 'round',
    strokeJoin: 'round',
  } as const;
  const line = pathOf(points).detach();
  const bands = zones === null ? null : zoneBands(zones.zones, yOf, CHART_HEIGHT, LINE_WIDTH);
  return (
    <Group>
      <Path path={area.detach()}>
        <LinearGradient
          start={{ x: 0, y: top }}
          end={{ x: 0, y: CHART_HEIGHT }}
          colors={[withAlpha(color, AREA_OPACITY), withAlpha(color, 0)]}
        />
      </Path>
      <Group
        layer={
          castsShadow(color) || zones !== null ? (
            <Paint>
              <DropShadow />
            </Paint>
          ) : undefined
        }
      >
        {zones === null || bands === null ? (
          <Path path={line} color={color} {...stroke} />
        ) : (
          // The line once per zone, each cut to its zone's band of the chart: every bit of it in
          // the color of the zone it is in (the owner's choice, 2026-11-14).
          bands.map((band) => (
            <Group
              key={band.zone}
              clip={{
                x: -LINE_WIDTH,
                y: band.top,
                width: CHART_WIDTH + 2 * LINE_WIDTH,
                height: band.bottom - band.top,
              }}
            >
              <Path path={line} color={zones.colors[band.zone]} {...stroke} />
            </Group>
          ))
        )}
      </Group>
      {averageY === null ? null : <DashedLine y={averageY} color={color} />}
    </Group>
  );
}

/**
 * Each zone's band of a chart `height` tall, top to bottom, where its stretch of the line is
 * drawn in its color: between the heights (`yOf`, the line's own placing) of the edges it has
 * with the zones under and over it (`zoneEdges`), the lowest zone down past the bottom and the
 * highest up past the top by the line's `stroke`, so the whole stroke is in some band. Only the
 * bands that reach the chart, as zone indices into `zones`. Time and space O(z) for z zones.
 */
export function zoneBands(
  zones: HeartRateZones,
  yOf: (value: number) => number,
  height: number,
  stroke: number,
): { readonly zone: number; readonly top: number; readonly bottom: number }[] {
  const edges = zoneEdges(zones).map(yOf);
  const low = height + stroke;
  const high = -stroke;
  return zones
    .map((_, zone) => {
      // A value higher up has a smaller y: a zone's top is its upper edge.
      const under = zone === 0 ? low : edges[zone - 1];
      const over = zone === zones.length - 1 ? high : edges[zone];
      return {
        zone,
        top: Math.max(high, Math.min(under, over)),
        bottom: Math.min(low, Math.max(under, over)),
      };
    })
    .filter((band) => band.bottom > band.top);
}

/** Sizes of the texts of the zones table, its rows, its bars and the room around it. */
export const ZONE_TEXT_SIZE = 32;
export const ZONE_RANGE_SIZE = 26;
export const ZONE_ROW_HEIGHT = 48;
const ZONE_BAR = 10;
const ZONE_GAP = 24;
export const ZONE_TABLE_GAP = 30;

/** One zone of the table: its time and its texts, laid out. */
interface ZoneRow {
  readonly seconds: number;
  /** Its bar's color, the zone's. */
  readonly color: string;
  /** "Z1"… in the zone's color. */
  readonly name: SkParagraph;
  readonly time: SkParagraph;
  /** What it spans: "<112", "112–130", "168+" beats a minute; a pace's "5:22–6:24". */
  readonly range: SkParagraph;
}

/**
 * The time spent in each heart rate zone, a row per zone: its name in its color, a bar as long as
 * its share of the most time spent in one zone (over a faint track), the time and the range of
 * the zone, both right-aligned so their digits line up.
 */
export function ZonesTable({
  rows,
  color,
}: {
  readonly rows: readonly ZoneRow[];
  readonly color: string;
}) {
  const widthOf = (paragraph: SkParagraph) => Math.ceil(paragraph.getLongestLine()) + 1;
  const nameWidth = Math.max(...rows.map((row) => widthOf(row.name)));
  const timeWidth = Math.max(...rows.map((row) => widthOf(row.time)));
  const rangeWidth = Math.max(...rows.map((row) => widthOf(row.range)));
  const trackStart = nameWidth + ZONE_GAP;
  const rangeRight = CHART_WIDTH;
  const timeRight = rangeRight - rangeWidth - ZONE_GAP;
  const trackWidth = timeRight - timeWidth - ZONE_GAP - trackStart;
  const most = Math.max(...rows.map((row) => row.seconds));
  const middleOf = (i: number) => i * ZONE_ROW_HEIGHT + ZONE_ROW_HEIGHT / 2;
  const at = (paragraph: SkParagraph, x: number, i: number) => (
    <ParagraphPicture
      paragraph={paragraph}
      x={x}
      y={middleOf(i) - paragraph.getHeight() / 2}
      width={widthOf(paragraph)}
    />
  );
  return (
    <Group>
      {rows.map((row, i) => (
        <Group key={i}>
          {at(row.name, 0, i)}
          <RoundedRect
            x={trackStart}
            y={middleOf(i) - ZONE_BAR / 2}
            width={trackWidth}
            height={ZONE_BAR}
            r={ZONE_BAR / 2}
            color={withAlpha(color, 0.2)}
          />
          {most > 0 && row.seconds > 0 ? (
            <RoundedRect
              x={trackStart}
              y={middleOf(i) - ZONE_BAR / 2}
              width={Math.max(ZONE_BAR, (trackWidth * row.seconds) / most)}
              height={ZONE_BAR}
              r={ZONE_BAR / 2}
              color={row.color}
            />
          ) : null}
          {at(row.time, timeRight - widthOf(row.time), i)}
          <Group layer={<Paint opacity={0.7} />}>
            {at(row.range, rangeRight - widthOf(row.range), i)}
          </Group>
        </Group>
      ))}
    </Group>
  );
}

/**
 * The average an activity's line chart marks: the activity's own (its average pace, heart rate or
 * power, as its data widgets write it) when it has one, or else the line's.
 */
export function lineAverage(
  series: ActivityChartSeries,
  activity: Activity,
  ofLine: number,
): number {
  const own =
    series === 'pace'
      ? activity.averageSpeed
      : series === 'heartRate'
        ? activity.averageHeartRate
        : series === 'power'
          ? activity.averagePowerWatts
          : series === 'cadence'
            ? activity.averageCadence
            : null;
  return own !== null && own > 0 ? own : ofLine;
}

/** How opaque the values of a line's scale are, and its grid. */
export const SCALE_OPACITY = 0.65;
const GRID_OPACITY = 0.3;
const GRID_WIDTH = 2;
/** The highest point's value is this much bigger than the scale's. */
export const PEAK_TEXT_GAIN = 1.2;
/** Room between the scale's values and the grid, and between texts and the dots. */
const SCALE_GAP = 18;
/** Radius of a line's dots, few or many (a month of days), and of the highest one's halo. */
const DOT = { few: 9, many: 5, halo: 2.4 } as const;
/** Most points drawn with big dots. */
const FEW_POINTS = 16;

/** A chart's body laid out: what it draws from its top-left corner, and how tall it is. */
interface PreparedBody {
  readonly height: number;
  readonly content: ReactElement;
}

/**
 * A period's bars as a line (as the summaries of the home screen draw it): a dot per bar joined
 * over an area that fades out downwards, on a grid with its scale on the left (the highest
 * value, its half and zero) and a line at each marked bar; the highest dot with a halo and its
 * value over it, and the axis labels under the line. It spans {@link CHART_WIDTH}; the scale's
 * width depends on its values. Time O(n) for n bars.
 */
export function preparePeriodLine({
  values,
  color,
  labels,
  marks,
  ticks,
  peak,
}: {
  readonly values: readonly number[];
  readonly color: string;
  /** One paragraph per bar (`null` for unlabelled bars), or `null` for no axis labels. */
  readonly labels: readonly (SkParagraph | null)[] | null;
  /** The bars with a line of the grid across them. */
  readonly marks: readonly boolean[];
  /** The scale's values: the highest, its half and zero, top to bottom. */
  readonly ticks: readonly SkParagraph[];
  /** The highest value, over its dot; `null` when every bar is empty. */
  readonly peak: SkParagraph | null;
}): PreparedBody {
  const radius = values.length <= FEW_POINTS ? DOT.few : DOT.many;
  const halo = radius * DOT.halo;
  const gridLeft = Math.max(...ticks.map(widthOf)) + SCALE_GAP;
  const left = gridLeft + radius;
  const right = CHART_WIDTH - halo;
  const top = (peak === null ? 0 : peak.getHeight() + SCALE_GAP) + halo;
  const bottom = top + CHART_HEIGHT;
  const max = Math.max(...values);
  const best = max > 0 ? values.indexOf(max) : -1;
  const points = values.map((value, i) => ({
    x: values.length > 1 ? left + (i * (right - left)) / (values.length - 1) : (left + right) / 2,
    y: bottom - (max > 0 ? (value / max) * CHART_HEIGHT : 0),
  }));
  const labelsTop = bottom + radius + SCALE_GAP / 2;
  const labelsHeight = Math.max(0, ...(labels ?? []).map((label) => label?.getHeight() ?? 0));
  const height = labels === null ? bottom + radius : labelsTop + labelsHeight;
  const linePath = Skia.PathBuilder.Make();
  points.forEach(({ x, y }, i) => (i === 0 ? linePath.moveTo(x, y) : linePath.lineTo(x, y)));
  const area = Skia.PathBuilder.Make();
  area.moveTo(points[0].x, bottom);
  points.forEach(({ x, y }) => area.lineTo(x, y));
  area.lineTo(points[points.length - 1].x, bottom);
  area.close();
  const grid = withAlpha(color, GRID_OPACITY);
  const peakAt = best < 0 ? null : points[best];
  const content = (
    <Group>
      {ticks.map((tick, i) => {
        const y = top + (i * CHART_HEIGHT) / (ticks.length - 1);
        return (
          <Group key={`tick-${i}`}>
            <Line
              p1={{ x: gridLeft, y }}
              p2={{ x: CHART_WIDTH, y }}
              color={grid}
              strokeWidth={GRID_WIDTH}
            />
            <ParagraphPicture
              paragraph={tick}
              x={gridLeft - SCALE_GAP - widthOf(tick)}
              y={y - tick.getHeight() / 2}
              width={widthOf(tick)}
            />
          </Group>
        );
      })}
      {points.map(({ x }, i) =>
        marks[i] ? (
          <Line
            key={`mark-${i}`}
            p1={{ x, y: top }}
            p2={{ x, y: bottom }}
            color={grid}
            strokeWidth={GRID_WIDTH}
          />
        ) : null,
      )}
      <Path path={area.detach()}>
        <LinearGradient
          start={{ x: 0, y: top }}
          end={{ x: 0, y: bottom }}
          colors={[withAlpha(color, AREA_OPACITY), withAlpha(color, 0)]}
        />
      </Path>
      {/* One shadow for the line and its dots, drawn as a layer. */}
      <Group
        layer={
          castsShadow(color) ? (
            <Paint>
              <DropShadow />
            </Paint>
          ) : undefined
        }
      >
        <Path
          path={linePath.detach()}
          style="stroke"
          strokeWidth={LINE_WIDTH}
          strokeJoin="round"
          strokeCap="round"
          color={color}
        />
        {points.map(({ x, y }, i) => (
          <Circle key={`dot-${i}`} cx={x} cy={y} r={radius} color={color} />
        ))}
      </Group>
      {peakAt === null ? null : (
        <Circle cx={peakAt.x} cy={peakAt.y} r={halo} color={withAlpha(color, GRID_OPACITY)} />
      )}
      {peak === null || peakAt === null ? null : (
        <ParagraphPicture
          paragraph={peak}
          // Centered over its dot, but never past the chart's ends.
          x={Math.min(Math.max(peakAt.x - widthOf(peak) / 2, 0), CHART_WIDTH - widthOf(peak))}
          y={peakAt.y - halo - SCALE_GAP / 2 - peak.getHeight()}
          width={widthOf(peak)}
        />
      )}
      {labels?.map((label, i) => {
        if (label === null) {
          return null;
        }
        const width = widthOf(label);
        return (
          <ParagraphPicture
            key={`label-${i}`}
            paragraph={label}
            x={points[i].x - width / 2}
            y={labelsTop}
            width={width}
          />
        );
      })}
    </Group>
  );
  return { height, content };
}
