import { Canvas, Circle, Line, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import { Text, View } from 'react-native';

import { lineChartPoints, peakIndex } from '@/core/line-chart';

/** Width of the column of values on the left. */
const AXIS_WIDTH = 46;
/** Room above the chart for the peak's value, and under it for the day or month labels. */
const TOP = 20;
const BOTTOM = 18;
/** Room at both ends, so the first and last dots aren't cut. */
const SIDE = 5;
const LINE = '#FFFFFF';
const GRID = 'rgba(255, 255, 255, 0.14)';
const LABEL = 'rgba(255, 255, 255, 0.6)';
const TEXT_SIZE = 11;

/**
 * A period's chart as a line, in the style of the redesign (ADR 009): a dot per day or month
 * joined by a line over a fading area, a light grid, the values on the left (zero, half and the
 * highest) and the highest one written over its dot.
 */
export function PeriodLineChart({
  values,
  labels,
  valueText,
  width,
  height,
}: {
  /** One value per day, week or month of the period. */
  readonly values: readonly number[];
  /** One label per value, `''` for those left unlabelled. */
  readonly labels: readonly string[];
  /** A value written for the axis and the peak ("61 km"). */
  readonly valueText: (value: number) => string;
  readonly width: number;
  readonly height: number;
}) {
  const plotWidth = width - AXIS_WIDTH - 2 * SIDE;
  const plotHeight = height - TOP - BOTTOM;
  const points = lineChartPoints(values, plotWidth, plotHeight).map(({ x, y }) => ({
    x: x + SIDE,
    y: y + TOP,
  }));
  const peak = peakIndex(values);
  const max = peak === null ? 0 : values[peak];
  const line = Skia.PathBuilder.Make();
  points.forEach(({ x, y }, i) => {
    if (i === 0) {
      line.moveTo(x, y);
    } else {
      line.lineTo(x, y);
    }
  });
  const area = Skia.PathBuilder.Make();
  if (points.length > 0) {
    area.moveTo(points[0].x, TOP + plotHeight);
    points.forEach(({ x, y }) => area.lineTo(x, y));
    area.lineTo(points[points.length - 1].x, TOP + plotHeight);
    area.close();
  }
  // Big dots for a week or a year; a month's 30 days get small ones.
  const radius = values.length > 14 ? 2 : 3;
  const ticks = [max, max / 2, 0];
  return (
    <View style={{ width, height, flexDirection: 'row' }}>
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
        <Canvas style={{ flex: 1 }}>
          {[0, 0.5, 1].map((share) => (
            <Line
              key={share}
              p1={vec(SIDE, TOP + plotHeight * share)}
              p2={vec(SIDE + plotWidth, TOP + plotHeight * share)}
              color={GRID}
              strokeWidth={1}
            />
          ))}
          {points.map(({ x }, i) =>
            labels[i] === '' ? null : (
              <Line
                key={i}
                p1={vec(x, TOP)}
                p2={vec(x, TOP + plotHeight)}
                color={GRID}
                strokeWidth={1}
              />
            ),
          )}
          <Path path={area.detach()}>
            <LinearGradient
              start={vec(0, TOP)}
              end={vec(0, TOP + plotHeight)}
              colors={['rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0.02)']}
            />
          </Path>
          <Path
            path={line.detach()}
            style="stroke"
            strokeWidth={2}
            strokeJoin="round"
            strokeCap="round"
            color={LINE}
          />
          {points.map(({ x, y }, i) => (
            <Circle key={i} cx={x} cy={y} r={i === peak ? radius + 2 : radius} color={LINE} />
          ))}
        </Canvas>
        {points.map(({ x }, i) =>
          labels[i] === '' ? null : (
            <Text
              key={i}
              style={{
                position: 'absolute',
                top: TOP + plotHeight + 3,
                left: x - 20,
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
