import { weekRange } from '@/core/dates';
import { defaultActivityTemplate, defaultSummaryTemplate } from '@/core/default-layout';
import type { MetricUnit } from '@/core/metrics';
import { summarize } from '@/core/summary';
import type { Layer } from '@/core/template';
import { en } from '@/i18n/locales/en';
import { makeActivity } from '@/test-utils/make-activity';
import { makeSummary } from '@/test-utils/make-summary';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import {
  activityChartHeader,
  chartBuckets,
  chartValueText,
  type EditorData,
  hasUnit,
  isPaceLayer,
  isTimeLayer,
  layerText,
  periodChartHeader,
  MISSING_VALUE,
  speedMeasure,
  splitRowTexts,
  type SummaryData,
  textRuns,
} from './editor-data';

const context = {
  unit: 'km',
  locale: 'es',
  durationUnits: TEST_DURATION_UNITS,
  unitLabel: testUnitLabel,
} as const;
const activity = makeActivity({ name: 'Rodaje suave', startLocal: '2026-10-14T08:00:00' });
const activityData: EditorData = {
  mode: 'activity',
  activity,
  detail: null,
  place: null,
  zones: null,
};

const layer = (id: string, layers: readonly Layer[]): Layer => {
  const found = layers.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`No layer ${id}`);
  }
  return found;
};

describe('layerText for an activity', () => {
  const { layers } = defaultActivityTemplate(activity);

  it('formats metrics in the user locale and unit', () => {
    expect(layerText(layer('metric-distance', layers), activityData, context)).toEqual({
      label: 'metrics.distance',
      value: '10,00',
      unit: 'km',
    });
    expect(
      layerText(layer('metric-distance', layers), activityData, {
        ...context,
        unit: 'mi',
        locale: 'en',
      }),
    ).toMatchObject({ value: '6.21', unit: 'mi' });
  });

  it('shows the name and the local date, in the format the layer asks for', () => {
    expect(layerText(layer('name', layers), activityData, context)?.value).toBe('Rodaje suave');
    const date = layer('date', layers);
    expect(layerText(date, activityData, context)?.value).toBe('Miércoles, 14 de octubre de 2026');
    expect(
      layerText(
        date.kind === 'info' ? { ...date, dateFormat: 'weekdayTime' } : date,
        activityData,
        context,
      )?.value,
    ).toBe('Miércoles, 8:00');
  });

  it('hides label and unit when the layer says so, and marks missing values', () => {
    const time = layer('metric-movingTime', layers);
    if (time.kind !== 'metric') {
      throw new Error('Expected a metric layer');
    }
    const bare: Layer = { ...time, metric: 'averagePower', showLabel: false };
    expect(layerText(bare, activityData, context)).toEqual({
      label: null,
      value: MISSING_VALUE,
      unit: null,
    });
  });

  it('writes a pace with minute and second marks when the layer asks for it', () => {
    const time = layer('metric-movingTime', layers);
    if (time.kind !== 'metric') {
      throw new Error('Expected a metric layer');
    }
    const pace: Layer = { ...time, metric: 'pace', paceNotation: 'marks' };
    expect(layerText(pace, activityData, context)).toMatchObject({ value: `5'00"`, unit: '/km' });
    expect(layerText({ ...pace, paceNotation: 'colon' }, activityData, context)).toMatchObject({
      value: '5:00',
      unit: 'min/km',
    });
    // Other metrics ignore it.
    expect(layerText({ ...time, paceNotation: 'marks' }, activityData, context)?.value).toBe(
      '50:00',
    );
  });

  it('writes a time in words, to the second, when the layer asks for it', () => {
    const time = layer('metric-movingTime', layers);
    if (time.kind !== 'metric') {
      throw new Error('Expected a metric layer');
    }
    const long = { ...activityData, activity: { ...activity, movingTimeSeconds: 6030 } };
    expect(layerText(time, long, context)?.value).toBe('1:40:30');
    expect(layerText({ ...time, timeNotation: 'units' }, long, context)).toMatchObject({
      value: '1h 40min 30seg',
      unit: null,
    });
    // Other metrics ignore it.
    const distance = layer('metric-distance', layers);
    expect(
      layerText(
        distance.kind === 'metric' ? { ...distance, timeNotation: 'units' } : distance,
        activityData,
        context,
      )?.value,
    ).toBe('10,00');
  });

  it("writes the activity's place in the format the layer asks for, and nothing without one", () => {
    const date = layer('date', layers);
    if (date.kind !== 'info') {
      throw new Error('Expected an info layer');
    }
    const placeLayer = { ...date, field: 'activityPlace' } as const;
    const seville = { city: 'Sevilla', region: 'Andalucía', country: 'España' };
    const known = { ...activityData, place: seville };
    expect(layerText(placeLayer, known, context)?.value).toBe('Sevilla');
    expect(layerText({ ...placeLayer, placeFormat: 'cityCountry' }, known, context)?.value).toBe(
      'Sevilla, España',
    );
    expect(layerText(placeLayer, activityData, context)).toBeNull();
  });

  it('returns nothing for summary layers and non-text layers', () => {
    const summaryLayers = defaultSummaryTemplate(makeSummary()).layers;
    expect(layerText(layer('period', summaryLayers), activityData, context)).toBeNull();
    expect(layerText(layer('logo', layers), activityData, context)).toBeNull();
  });
});

describe('layerText for a summary', () => {
  const range = weekRange('2026-10-14');
  const activities = [makeActivity(), makeActivity({ localDate: '2026-10-16' })];
  const data: EditorData = {
    mode: 'summary',
    kind: 'week',
    summary: summarize(activities, range),
    activities,
    bucketSize: 'day',
  };
  const { layers } = defaultSummaryTemplate(makeSummary());

  it('shows totals and the period name', () => {
    expect(layerText(layer('total-totalDistance', layers), data, context)).toEqual({
      label: 'summaryMetrics.totalDistance',
      value: '20,00',
      unit: 'km',
    });
    expect(layerText(layer('total-activityCount', layers), data, context)?.value).toBe('2');
    const total = layer('total-totalMovingTime', layers);
    if (total.kind !== 'summaryMetric') {
      throw new Error('Expected a summary metric');
    }
    // Two 50-minute runs.
    expect(layerText(total, data, context)).toMatchObject({ value: '1:40', unit: 'h' });
    expect(layerText({ ...total, timeNotation: 'units' }, data, context)).toMatchObject({
      value: '1h 40min',
      unit: null,
    });
    expect(layerText(layer('period', layers), data, context)?.value).toBe('12 oct – 18 oct 2026');
    const period = layer('period', layers);
    expect(
      layerText(
        period.kind === 'info' ? { ...period, periodFormat: 'short' } : period,
        data,
        context,
      )?.value,
    ).toBe('12–18 oct');
  });
});

describe('chartBuckets', () => {
  const range = weekRange('2026-10-14');
  const activities = [makeActivity(), makeActivity({ localDate: '2026-10-16' })];
  const data: SummaryData = {
    mode: 'summary',
    kind: 'week',
    summary: summarize(activities, range),
    activities,
    bucketSize: 'day',
  };
  const found = layer('chart', defaultSummaryTemplate(makeSummary(), 'story').layers);
  if (found.kind !== 'summaryChart') {
    throw new Error('The default summary has no chart');
  }
  const chart = found;

  it("uses the period's own bars for an automatic chart", () => {
    const { size, buckets } = chartBuckets({ ...chart, bucket: 'auto' }, data);
    expect(size).toBe('day');
    expect(buckets).toHaveLength(7);
  });

  it("uses the chart's own bar size when it sets one", () => {
    const { size, buckets } = chartBuckets({ ...chart, bucket: 'week' }, data);
    expect(size).toBe('week');
    expect(buckets).toHaveLength(1);
    expect(buckets[0].distanceMeters).toBe(20_000);
  });
});

describe('textRuns', () => {
  const content = { label: 'Elevation gain', value: '120', unit: 'm', valueSize: 100 };

  it('makes the label, value and unit bold together', () => {
    const runs = textRuns({ bold: true, uppercase: false }, content);
    expect(runs.map((run) => run.bold)).toEqual([true, true, true]);
    expect(textRuns({ bold: false, uppercase: false }, content).some((run) => run.bold)).toBe(
      false,
    );
  });

  it('uppercases the unit too', () => {
    const runs = textRuns({ bold: false, uppercase: true }, content);
    expect(runs.map((run) => run.text)).toEqual(['ELEVATION GAIN\n', '120', ' M']);
  });

  it('sizes the label and unit after the value, and skips the missing ones', () => {
    const runs = textRuns({ bold: false, uppercase: false }, content);
    expect(runs.map((run) => run.fontSize)).toEqual([34, 100, 45]);
    const valueOnly = textRuns(
      { bold: false, uppercase: false },
      { ...content, label: null, unit: null },
    );
    expect(valueOnly).toEqual([{ text: '120', fontSize: 100, bold: false }]);
  });
});

describe('activityChartHeader', () => {
  /** A line whose highest value is `max`; its points don't matter to the header. */
  const line = (max: number, average = max / 2) =>
    ({
      kind: 'line',
      points: [],
      min: 0,
      max,
      average,
      axis: 'distance',
      axisEnd: 10_000,
    }) as const;
  const run = makeActivity({ sportType: 'Run' });

  it("writes an elevation's distance and climb as their data widgets do", () => {
    expect(activityChartHeader('elevation', run, line(30), context)).toEqual([
      { label: 'metrics.distance', value: '10,00', unit: 'km' },
      { label: 'metrics.elevationGain', value: '50', unit: 'm' },
    ]);
  });

  it("writes a pace's average (the activity's own) and fastest, or a ride's speeds", () => {
    expect(activityChartHeader('pace', run, line(4, 3), context)).toEqual([
      { label: 'chartHeaders.averagePace', value: '5:00', unit: 'min/km' },
      { label: 'chartHeaders.fastestPace', value: '4:10', unit: 'min/km' },
    ]);
    const ride = makeActivity({ sportType: 'Ride', averageSpeed: 30 / 3.6 });
    expect(activityChartHeader('pace', ride, line(50 / 3.6), context)).toEqual([
      { label: 'chartHeaders.averageSpeed', value: '30,0', unit: 'km/h' },
      { label: 'chartHeaders.maxSpeed', value: '50,0', unit: 'km/h' },
    ]);
  });

  it("writes a heart rate's average and highest, the chart's when the activity has none", () => {
    expect(activityChartHeader('heartRate', run, line(180), context)).toEqual([
      { label: 'chartHeaders.averageHeartRate', value: '150', unit: 'ppm' },
      { label: 'chartHeaders.maxHeartRate', value: '172', unit: 'ppm' },
    ]);
    const unmeasured = makeActivity({ maxHeartRate: null });
    expect(activityChartHeader('heartRate', unmeasured, line(180), context)[1].value).toBe('180');
  });

  it("writes the splits' average pace and fastest split", () => {
    const split = (averageSpeed: number) => ({
      distanceMeters: 1000,
      movingTimeSeconds: 1000 / averageSpeed,
      elevationDifferenceMeters: 0,
      averageSpeed,
      averageHeartRate: null,
    });
    const bars = {
      kind: 'bars',
      values: [3, 4],
      average: 3.5,
      splits: [split(3), split(4)],
    } as const;
    expect(activityChartHeader('splits', run, bars, context)).toEqual([
      { label: 'chartHeaders.averagePace', value: '5:00', unit: 'min/km' },
      { label: 'chartHeaders.fastestSplit', value: '4:10', unit: 'min/km' },
    ]);
  });
});

describe('periodChartHeader', () => {
  it("writes the period's total and its average per bar, empty bars included", () => {
    const week = [10_000, 0, 5000, 0, 0, 0, 0];
    expect(periodChartHeader('distance', 'week', week, context)).toEqual([
      { label: 'chartHeaders.total', value: '15,00', unit: 'km' },
      { label: 'chartHeaders.averagePer.week', value: '2,14', unit: 'km' },
    ]);
    expect(periodChartHeader('movingTime', 'day', [3600, 7200], context)).toEqual([
      { label: 'chartHeaders.total', value: '3:00', unit: 'h' },
      { label: 'chartHeaders.averagePer.day', value: '1:30', unit: 'h' },
    ]);
  });
});

describe('chart texts', () => {
  it('write a speed as each sport does', () => {
    expect(speedMeasure('run')).toBe('pace');
    expect(speedMeasure('walk')).toBe('pace');
    expect(speedMeasure('swim')).toBe('swimPace');
    expect(speedMeasure('ride')).toBe('speed');
  });

  it('write a highlighted value with its unit', () => {
    expect(chartValueText('elevation', 283.4, context)).toBe('283 m');
    expect(chartValueText('pace', 1000 / 397, context)).toBe('6:37 min/km');
    expect(chartValueText('speed', 30 / 3.6, context)).toBe('30,0 km/h');
    expect(chartValueText('heartRate', 158, context)).toBe('158 ppm');
    expect(chartValueText('power', 221, context)).toBe('221 W');
    expect(chartValueText('periodDistance', 52_300, context)).toBe('52,30 km');
    expect(chartValueText('periodTime', 19_200, context)).toBe('5:20 h');
  });

  it('write units in the app language: beats per minute are "ppm" in Spanish', () => {
    const english = {
      ...context,
      locale: 'en',
      unitLabel: (unit: MetricUnit) => en.metricUnits[unit],
    };
    expect(chartValueText('heartRate', 158, english)).toBe('158 bpm');
    expect(chartValueText('heartRate', 158, context)).toBe('158 ppm');
  });

  it('write a row of splits without units, as a table: number, pace, altitude, heart rate', () => {
    const row = {
      first: 1,
      last: 1,
      speed: 1000 / 450,
      elevationDifference: 110.4,
      heartRate: 151.6,
    };
    expect(splitRowTexts(row, 'pace', context)).toEqual({
      number: '1',
      value: '7:30',
      elevation: '110',
      heartRate: '152',
    });
    expect(
      splitRowTexts(
        { ...row, last: 3, elevationDifference: -72, heartRate: null },
        'speed',
        context,
      ),
    ).toEqual({ number: '1–3', value: '8,0', elevation: '−72', heartRate: '—' });
    // A descent that rounds to nothing has no minus.
    expect(splitRowTexts({ ...row, elevationDifference: -0.2 }, 'pace', context).elevation).toBe(
      '0',
    );
  });
});

describe('isTimeLayer', () => {
  it('is true for the times of an activity and the total time of a period', () => {
    const time = layer('metric-movingTime', defaultActivityTemplate(activity).layers);
    const total = layer('total-totalMovingTime', defaultSummaryTemplate(makeSummary()).layers);
    if (time.kind !== 'metric' || total.kind !== 'summaryMetric') {
      throw new Error('Expected data layers');
    }
    expect(isTimeLayer(time)).toBe(true);
    expect(isTimeLayer({ ...time, metric: 'elapsedTime' })).toBe(true);
    expect(isTimeLayer({ ...time, metric: 'pace' })).toBe(false);
    expect(isTimeLayer(total)).toBe(true);
    expect(isTimeLayer({ ...total, metric: 'totalDistance' })).toBe(false);
  });

  it('leaves no unit to hide once the time is written in words', () => {
    const total = layer('total-totalMovingTime', defaultSummaryTemplate(makeSummary()).layers);
    if (total.kind !== 'summaryMetric') {
      throw new Error('Expected a summary metric');
    }
    expect(hasUnit(total)).toBe(true);
    expect(hasUnit({ ...total, timeNotation: 'units' })).toBe(false);
  });
});

describe('hasUnit', () => {
  const metric = (id: string) => {
    const found = layer(id, defaultActivityTemplate(activity).layers);
    if (found.kind !== 'metric') {
      throw new Error(`${id} is not a metric`);
    }
    return found;
  };

  it('is false for times and counts, which show no unit', () => {
    const distance = metric('metric-distance');
    expect(hasUnit(distance)).toBe(true);
    expect(hasUnit({ ...distance, metric: 'elevationGain' })).toBe(true);
    expect(hasUnit({ ...distance, metric: 'movingTime' })).toBe(false);
    expect(hasUnit({ ...distance, metric: 'elapsedTime' })).toBe(false);
    const total = layer('total-totalDistance', defaultSummaryTemplate(makeSummary()).layers);
    if (total.kind !== 'summaryMetric') {
      throw new Error('Not a summary metric');
    }
    expect(hasUnit(total)).toBe(true);
    expect(hasUnit({ ...total, metric: 'totalMovingTime' })).toBe(true);
    expect(hasUnit({ ...total, metric: 'activityCount' })).toBe(false);
  });
});

describe('isPaceLayer', () => {
  it('is true only for paces, of an activity or of a period', () => {
    const distance = layer('metric-distance', defaultActivityTemplate(activity).layers);
    const total = layer('total-totalDistance', defaultSummaryTemplate(makeSummary()).layers);
    if (distance.kind !== 'metric' || total.kind !== 'summaryMetric') {
      throw new Error('Expected data layers');
    }
    expect(isPaceLayer(distance)).toBe(false);
    expect(isPaceLayer({ ...distance, metric: 'pace' })).toBe(true);
    expect(isPaceLayer({ ...distance, metric: 'swimPace' })).toBe(true);
    expect(isPaceLayer({ ...distance, metric: 'movingTime' })).toBe(false);
    expect(isPaceLayer(total)).toBe(false);
    expect(isPaceLayer({ ...total, metric: 'averagePace' })).toBe(true);
    expect(isPaceLayer({ ...total, metric: 'totalMovingTime' })).toBe(false);
  });
});
