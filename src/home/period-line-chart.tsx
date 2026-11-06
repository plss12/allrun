import { Circle, Group, Line, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { type LayoutChangeEvent, PixelRatio, View } from 'react-native';

import { lineChartPoints, peakIndex } from '@/core/line-chart';
import { Text } from '@/ui/text';

/** Width of the column of values on the left. */
export const AXIS_WIDTH = 46;
/** Room above the chart for the peak's value, and under it for the day or month labels. */
const TOP = 20;
const BOTTOM = 18;
/** Room at both ends, so the first and last dots aren't cut. */
const SIDE = 5;
const LINE = '#FFFFFF';
const GRID = 'rgba(255, 255, 255, 0.14)';
const LABEL = 'rgba(255, 255, 255, 0.6)';
const TEXT_SIZE = 11;

/** What both halves of a chart need: where each value goes, and its highest one. */
function chartGeometry(values: readonly number[], width: number, height: number) {
  const plotWidth = width - AXIS_WIDTH - 2 * SIDE;
  const plotHeight = height - TOP - BOTTOM;
  const points = lineChartPoints(values, plotWidth, plotHeight).map(({ x, y }) => ({
    x: x + SIDE,
    y: y + TOP,
  }));
  const peak = peakIndex(values);
  return { plotWidth, plotHeight, points, peak, max: peak === null ? 0 : values[peak] };
}

/** The chart's line through `points`, and the area under it down to the bottom of the plot. */
function chartPaths(
  points: readonly { readonly x: number; readonly y: number }[],
  plotHeight: number,
) {
  const line = Skia.PathBuilder.Make();
  points.forEach((point, i) => {
    if (i === 0) {
      line.moveTo(point.x, point.y);
    } else {
      line.lineTo(point.x, point.y);
    }
  });
  const area = Skia.PathBuilder.Make();
  if (points.length > 0) {
    area.moveTo(points[0].x, TOP + plotHeight);
    points.forEach((point) => area.lineTo(point.x, point.y));
    area.lineTo(points[points.length - 1].x, TOP + plotHeight);
    area.close();
  }
  return { line: line.detach(), area: area.detach() };
}

interface ChartProps {
  /** One value per day, week or month of the period. */
  readonly values: readonly number[];
  /** One label per value, `''` for those left unlabelled. */
  readonly labels: readonly string[];
  /** Width and height of the whole chart, the column of values included. */
  readonly width: number;
  readonly height: number;
}

/**
 * A period's chart as a line, in the style of the redesign (ADR 009): a dot per day or month
 * joined by a line over a fading area, a light grid, the values on the left (zero, half and the
 * highest) and the highest one written over its dot.
 *
 * It comes in two halves. This one is the drawing, for the Skia canvas of the card it is in (see
 * `PeriodCard`): a canvas of its own per chart cost the UI thread a surface to create and a first
 * draw each, and the Summaries tab opened with a frame of half a second. `x` and `y` are where the
 * chart's top left corner, column of values included, falls on that canvas. The other half,
 * `PeriodChartLabels`, writes its texts where this one leaves room for them.
 */
export function PeriodChartDrawing({
  values,
  labels,
  width,
  height,
  x,
  y,
  opacity = 1,
}: ChartProps & { readonly x: number; readonly y: number; readonly opacity?: number }) {
  const geometry = useMemo(() => chartGeometry(values, width, height), [values, width, height]);
  const { plotWidth, plotHeight, points, peak } = geometry;
  const paths = useMemo(() => chartPaths(geometry.points, geometry.plotHeight), [geometry]);
  // Big dots for a week or a year; a month's 30 days get small ones.
  const radius = values.length > 14 ? 2 : 3;
  return (
    // On whole pixels, as a canvas of its own was: its lines stay as sharp.
    <Group
      transform={[
        { translateX: PixelRatio.roundToNearestPixel(x + AXIS_WIDTH) },
        { translateY: PixelRatio.roundToNearestPixel(y) },
      ]}
      opacity={opacity}
    >
      {[0, 0.5, 1].map((share) => (
        <Line
          key={share}
          p1={vec(SIDE, TOP + plotHeight * share)}
          p2={vec(SIDE + plotWidth, TOP + plotHeight * share)}
          color={GRID}
          strokeWidth={1}
        />
      ))}
      {points.map((point, i) =>
        labels[i] === '' ? null : (
          <Line
            key={i}
            p1={vec(point.x, TOP)}
            p2={vec(point.x, TOP + plotHeight)}
            color={GRID}
            strokeWidth={1}
          />
        ),
      )}
      <Path path={paths.area}>
        <LinearGradient
          start={vec(0, TOP)}
          end={vec(0, TOP + plotHeight)}
          colors={['rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0.02)']}
        />
      </Path>
      <Path
        path={paths.line}
        style="stroke"
        strokeWidth={2}
        strokeJoin="round"
        strokeCap="round"
        color={LINE}
      />
      {points.map((point, i) => (
        <Circle
          key={i}
          cx={point.x}
          cy={point.y}
          r={i === peak ? radius + 2 : radius}
          color={LINE}
        />
      ))}
    </Group>
  );
}

/**
 * The texts of a period's chart (see `PeriodChartDrawing`): the values on the left, the day or
 * month labels under it and the highest value over its dot, in a view as big as the chart, which
 * says with `onLayout` where the drawing goes.
 */
export function PeriodChartLabels({
  values,
  labels,
  valueText,
  width,
  height,
  onLayout,
}: ChartProps & {
  /** A value written for the axis and the peak ("61 km"). */
  readonly valueText: (value: number) => string;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { plotWidth, plotHeight, points, peak, max } = chartGeometry(values, width, height);
  const ticks = [max, max / 2, 0];
  return (
    <View onLayout={onLayout} style={{ width, height, flexDirection: 'row' }}>
      <View style={{ width: AXIS_WIDTH, height }}>
        {ticks.map((tick, i) => (
          <Text
            key={i}
            numberOfLines={1}
            style={{
              position: 'absolute',
              top: TOP + (plotHeight * i) / 2 - TEXT_SIZE / 2 - 2,
              left: 0,
              right: 4,
              color: LABEL,
              fontSize: TEXT_SIZE,
              fontVariant: ['tabular-nums'],
            }}
          >
            {valueText(tick)}
          </Text>
        ))}
      </View>
      <View style={{ flex: 1, height }}>
        {points.map((point, i) =>
          labels[i] === '' ? null : (
            <Text
              key={i}
              style={{
                position: 'absolute',
                top: TOP + plotHeight + 3,
                left: point.x - 20,
                width: 40,
                textAlign: 'center',
                color: LABEL,
                fontSize: TEXT_SIZE,
              }}
            >
              {labels[i]}
            </Text>
          ),
        )}
        {peak === null ? null : (
          <Text
            numberOfLines={1}
            style={{
              position: 'absolute',
              top: points[peak].y - TEXT_SIZE - 7,
              // Centered over its dot, but never past the chart's ends.
              left: Math.min(Math.max(points[peak].x - 40, 0), plotWidth + 2 * SIDE - 80),
              width: 80,
              textAlign: 'center',
              color: LINE,
              fontSize: TEXT_SIZE,
              fontWeight: '700',
            }}
          >
            {valueText(max)}
          </Text>
        )}
      </View>
    </View>
  );
}
