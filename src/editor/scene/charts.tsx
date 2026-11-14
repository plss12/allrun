import { Group } from '@shopify/react-native-skia';
import type { ReactElement } from 'react';

import { activityChartSeries, splitRows } from '@/core/activity-charts';
import type { Layer } from '@/core/template';
import { formatDuration } from '@/core/units';
import { formatBucketLabels } from '@/ui/format';

import {
  activityChartHeader,
  chartBuckets,
  periodChartHeader,
  periodTotalsHeader,
  roundedChartValue,
  speedMeasure,
  splitRowTexts,
  zoneRangeTexts,
} from '../editor-data';
import type { LayerContext, PreparedLayer } from '../template-scene';
import {
  BarsBody,
  barsHeight,
  COLUMN_NAME_SIZE,
  fitBarTexts,
  MAX_SPLIT_ROWS,
  ROW_TEXT_SIZE,
  rowsHeight,
  SplitRows,
} from './chart-bars';
import {
  AXIS_LABEL_SIZE,
  CHART_HEIGHT,
  CHART_WIDTH,
  ChartFrame,
  framedHeight,
  prepareCaption,
  prepareHeader,
  prepareTitledHeader,
} from './chart-frame';
import {
  chartZones,
  lineAverage,
  LineBody,
  PEAK_TEXT_GAIN,
  preparePeriodLine,
  SCALE_OPACITY,
  ZONE_RANGE_SIZE,
  ZONE_ROW_HEIGHT,
  ZONE_TABLE_GAP,
  ZONE_TEXT_SIZE,
  zoneColors,
  ZonesTable,
} from './chart-lines';
import { buildParagraph, LABEL_STYLE, NO_WRAP_WIDTH } from './paragraphs';

/** A period's chart: its bars or its line, under its header or its caption. */
export function prepareSummaryChart(
  layer: Extract<Layer, { kind: 'summaryChart' }>,
  context: LayerContext,
): PreparedLayer | null {
  const { data, fonts, textContext, translate } = context;
  if (data.mode !== 'summary') {
    return null;
  }
  const { size, buckets } = chartBuckets(layer, data);
  if (buckets.length === 0) {
    return null;
  }
  const values = buckets.map((bucket) =>
    layer.value === 'distance' ? bucket.distanceMeters : bucket.movingTimeSeconds,
  );
  // Axis labels are already initials and numbers: capitals only apply to the header.
  const chartText = {
    ...LABEL_STYLE,
    color: layer.color,
    font: layer.font,
    bold: layer.bold,
    italic: layer.italic,
  };
  const labels = layer.axisLabels
    ? formatBucketLabels(buckets, size, textContext.locale).map((label) =>
        label === ''
          ? null
          : buildParagraph(fonts, chartText, {
              label: null,
              value: label,
              unit: null,
              valueSize: AXIS_LABEL_SIZE,
            }),
      )
    : null;
  const headerStyle = { ...chartText, uppercase: layer.uppercase, align: layer.align };
  // Without its data, the chart says what it shows.
  const header =
    (layer.header ?? true)
      ? layer.totals !== undefined
        ? prepareTitledHeader(
            periodTotalsHeader(data, layer.value, layer.totals, textContext, translate),
            fonts,
            headerStyle,
            translate,
          )
        : prepareHeader(
            periodChartHeader(layer.value, size, values, textContext),
            fonts,
            headerStyle,
            translate,
          )
      : prepareCaption(
          translate(`chartCaptions.${layer.value}.${size}`, { unit: textContext.unit }),
          fonts,
          headerStyle,
        );
  const line = (text: string, size: number, opacity = 1) =>
    buildParagraph(
      fonts,
      chartText,
      { label: null, value: text, unit: null, valueSize: size },
      NO_WRAP_WIDTH,
      opacity,
    );
  if (layer.look === 'line') {
    const max = Math.max(...values);
    const withUnit = (value: number) => roundedChartValue(layer.value, value, textContext, true);
    const body = preparePeriodLine({
      values,
      color: layer.color,
      labels,
      // Lines at the labelled bars, also when the labels aren't written.
      marks: formatBucketLabels(buckets, size, textContext.locale).map((label) => label !== ''),
      ticks: [max, max / 2, 0].map((tick) => line(withUnit(tick), AXIS_LABEL_SIZE, SCALE_OPACITY)),
      peak: max > 0 ? line(withUnit(max), AXIS_LABEL_SIZE * PEAK_TEXT_GAIN) : null,
    });
    return {
      layer,
      width: CHART_WIDTH,
      height: framedHeight(header, body.height),
      content: (
        <ChartFrame header={header} align={layer.align} bodyHeight={body.height}>
          {body.content}
        </ChartFrame>
      ),
    };
  }
  const texts =
    layer.barValues === true
      ? fitBarTexts(
          values.map((value) => roundedChartValue(layer.value, value, textContext, false)),
          (text, size) => line(text, size),
        )
      : null;
  const bodyHeight = barsHeight(labels !== null, texts?.band ?? 0);
  return {
    layer,
    width: CHART_WIDTH,
    height: framedHeight(header, bodyHeight),
    content: (
      <ChartFrame header={header} align={layer.align} bodyHeight={bodyHeight}>
        <BarsBody
          values={values}
          color={layer.color}
          labels={labels}
          averageLine={layer.averageLine ?? false}
          texts={texts}
        />
      </ChartFrame>
    ),
  };
}

/** An activity's chart: its splits, or its line and its zones, under its header or its caption. */
export function prepareActivityChart(
  layer: Extract<Layer, { kind: 'activityChart' }>,
  context: LayerContext,
): PreparedLayer | null {
  const { data, fonts, textContext, translate } = context;
  if (data.mode !== 'activity' || data.detail === null) {
    return null;
  }
  const series = activityChartSeries(data.detail, layer.series, textContext.unit);
  if (series === null) {
    return null;
  }
  // Numbers have no capitals: they only apply to the header and the names of columns.
  const chartText = {
    ...LABEL_STYLE,
    color: layer.color,
    font: layer.font,
    bold: layer.bold,
    italic: layer.italic,
  };
  const paragraph = (value: string, uppercase: boolean, size: number) =>
    buildParagraph(
      fonts,
      { ...chartText, uppercase },
      { label: null, value, unit: null, valueSize: size },
    );
  const headerStyle = { ...chartText, uppercase: layer.uppercase, align: layer.align };
  // Splits that write each pace need no header: their paces and column names say it all.
  // Without its two data, any other chart says what it shows.
  const header =
    series.kind === 'bars' && (layer.splitPace ?? true)
      ? null
      : (layer.header ?? true)
        ? prepareHeader(
            activityChartHeader(layer.series, data.activity, series, textContext),
            fonts,
            headerStyle,
            translate,
          )
        : prepareCaption(
            translate(`chartCaptions.activity.${layer.series}`, { unit: textContext.unit }),
            fonts,
            headerStyle,
          );
  const frame = (bodyHeight: number, body: ReactElement): PreparedLayer => ({
    layer,
    width: CHART_WIDTH,
    height: framedHeight(header, bodyHeight),
    content: (
      <ChartFrame header={header} align={layer.align} bodyHeight={bodyHeight}>
        {body}
      </ChartFrame>
    ),
  });
  // How fast the activity went is written as its sport does: pace, pace per 100 or speed.
  const speed = speedMeasure(data.activity.sportFamily);
  if (series.kind === 'bars') {
    // Splits read against each other: they have no average line (templates that ask for one
    // draw without it).
    const showPace = layer.splitPace ?? true;
    const showElevation = layer.splitElevation === true;
    const showHeartRate = layer.splitHeartRate === true;
    const rows = splitRows(series.splits, MAX_SPLIT_ROWS).map((row) => {
      const texts = splitRowTexts(row, speed, textContext);
      const text = (value: string) => paragraph(value, false, ROW_TEXT_SIZE);
      return {
        speed: row.speed,
        number: text(texts.number),
        value: showPace ? text(texts.value) : null,
        elevation: showElevation ? text(texts.elevation) : null,
        heartRate: showHeartRate ? text(texts.heartRate) : null,
      };
    });
    const name = (text: string) => paragraph(text, layer.uppercase, COLUMN_NAME_SIZE);
    return frame(
      rowsHeight(rows.length),
      <SplitRows
        rows={rows}
        columns={{
          number: name(textContext.unitLabel(textContext.unit)),
          value: showPace ? name(translate(`metrics.${speed}`)) : null,
          elevation: showElevation ? name(translate('splitHeaders.elevation')) : null,
          heartRate: showHeartRate ? name(translate('splitHeaders.heartRate')) : null,
        }}
        // As the pace line: a pace by its pace, a speed (a ride's) as it is.
        scale={speed === 'speed' ? 'linear' : 'pace'}
        color={layer.color}
      />,
    );
  }
  const zones = layer.zones === undefined ? null : chartZones(layer.series, data);
  const colors = zones === null ? [] : zoneColors(zones.zones.length);
  const ranges = zones === null ? [] : zoneRangeTexts(zones.measure, zones.zones, textContext);
  const table =
    zones === null || layer.zones === 'line'
      ? null
      : zones.seconds.map((seconds, i) => ({
          seconds,
          color: colors[i],
          // Each zone's name in its color.
          name: buildParagraph(
            fonts,
            { ...chartText, color: colors[i] },
            { label: null, value: `Z${i + 1}`, unit: null, valueSize: ZONE_TEXT_SIZE },
          ),
          time: paragraph(formatDuration(seconds), false, ZONE_TEXT_SIZE),
          range: paragraph(ranges[i], false, ZONE_RANGE_SIZE),
        }));
  const line = zones === null || layer.zones !== 'table';
  const lineHeight = line ? CHART_HEIGHT : 0;
  const tableTop = line && table !== null ? lineHeight + ZONE_TABLE_GAP : lineHeight;
  return frame(
    table === null ? lineHeight : tableTop + table.length * ZONE_ROW_HEIGHT,
    <Group>
      {line ? (
        <LineBody
          series={series}
          // A pace by its pace, as Strava draws it; a speed (a ride's) as it is.
          scale={layer.series === 'pace' && speed !== 'speed' ? 'pace' : 'linear'}
          color={layer.color}
          average={
            layer.averageLine === true
              ? lineAverage(layer.series, data.activity, series.average)
              : null
          }
          zones={zones === null ? null : { zones: zones.zones, colors }}
        />
      ) : null}
      {table === null ? null : (
        <Group transform={[{ translateY: tableTop }]}>
          <ZonesTable rows={table} color={layer.color} />
        </Group>
      )}
    </Group>,
  );
}
