import { monthRange, weekRange } from '@/core/dates';
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
  familyCard,
  periodBoardingPass,
  periodLaps,
  periodNutrition,
  equivalenceLines,
  activityNutrition,
  periodNoteLines,
  periodReceipt,
  periodTable,
  periodTotalsHeader,
  MISSING_VALUE,
  plainMetricParts,
  plainMetricText,
  plainSummaryText,
  roundedChartValue,
  summaryTotalText,
  speedMeasure,
  splitGapText,
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

describe('plainMetricText', () => {
  it('writes a pace with its marks and no unit, anything else with its unit', () => {
    expect(plainMetricText(activity, 'pace', context)).toBe(`5'00"`);
    expect(plainMetricText(activity, 'movingTime', context)).toBe('50:00');
    expect(plainMetricText(activity, 'elevationGain', context)).toBe('50 m');
    expect(plainMetricText(makeActivity({ sportType: 'Swim' }), 'swimPace', context)).toBe(`0'30"`);
  });

  it('writes a pace with its unit and a time in units, in words, for widgets with more text', () => {
    const run = makeActivity({
      distanceMeters: 11_340,
      movingTimeSeconds: 3085,
      averageSpeed: 11_340 / 3085,
    });
    expect(plainMetricText(run, 'pace', context, 'words')).toBe('4:32 min/km');
    expect(plainMetricText(run, 'movingTime', context, 'words')).toBe('51min 25seg');
    expect(plainMetricText(run, 'distance', context, 'words')).toBe('11.34 km');
  });

  it('writes a time without its seconds, and a pace without its minutes when tight', () => {
    const run = makeActivity({
      distanceMeters: 11_340,
      movingTimeSeconds: 3085,
      averageSpeed: 11_340 / 3085,
    });
    expect(plainMetricText(run, 'pace', context, 'tight')).toBe('4:32/km');
    expect(plainMetricText(run, 'movingTime', context, 'tight')).toBe('51min');
    expect(plainMetricText(run, 'distance', context, 'tight')).toBe('11.34 km');
    // Brief, for a line of data: the pace with its marks.
    expect(plainMetricText(run, 'pace', context, 'brief')).toBe(`4'32"`);
    expect(plainMetricText(run, 'movingTime', context, 'brief')).toBe('51min');
    expect(plainMetricText(run, 'distance', context, 'brief')).toBe('11.34 km');
  });

  it('writes numbers with a decimal point and no thousands separator, in any language', () => {
    const long = makeActivity({ distanceMeters: 11_340, calories: 1250 });
    expect(plainMetricText(long, 'distance', context)).toBe('11.34 km');
    expect(plainMetricText(long, 'calories', context)).toBe('1250 kcal');
  });
});

describe('plainMetricParts', () => {
  it('writes the amount and the unit apart, as plainMetricText does', () => {
    const run = makeActivity({ distanceMeters: 11_340, calories: 1250 });
    expect(plainMetricParts(run, 'distance', context)).toEqual({ amount: '11.34', unit: 'km' });
    expect(plainMetricParts(run, 'calories', context)).toEqual({ amount: '1250', unit: 'kcal' });
    // A time and a pace carry no unit: a clock, and the marks.
    expect(plainMetricParts(activity, 'movingTime', context)).toEqual({
      amount: '50:00',
      unit: null,
    });
    expect(plainMetricParts(activity, 'pace', context)).toEqual({ amount: `5'00"`, unit: null });
  });

  it('rounds a number to at most the decimals asked for', () => {
    const run = makeActivity({ distanceMeters: 11_340, calories: 1250 });
    expect(plainMetricParts(run, 'distance', context, 1)).toEqual({ amount: '11.3', unit: 'km' });
    expect(plainMetricParts(run, 'calories', context, 1)).toEqual({
      amount: '1250',
      unit: 'kcal',
    });
    const rounded = makeActivity({ distanceMeters: 11_960 });
    expect(plainMetricParts(rounded, 'distance', context, 1)).toEqual({
      amount: '12.0',
      unit: 'km',
    });
  });

  it('writes a dash and no unit for a datum the activity lacks', () => {
    const gym = makeActivity({ sportType: 'WeightTraining', distanceMeters: 0 });
    expect(plainMetricParts(gym, 'distance', context)).toEqual({ amount: '—', unit: null });
  });
});

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
    families: [],
    current: false,
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
    families: [],
    current: false,
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

  it("writes a pace's average (the activity's own) and fastest with marks, or a ride's speeds", () => {
    expect(activityChartHeader('pace', run, line(4, 3), context)).toEqual([
      { label: 'chartHeaders.averagePace', value: `5'00"`, unit: null },
      { label: 'chartHeaders.fastestPace', value: `4'10"`, unit: null },
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
      { label: 'chartHeaders.averagePace', value: `5'00"`, unit: null },
      { label: 'chartHeaders.fastestSplit', value: `4'10"`, unit: null },
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

describe('periodTotalsHeader', () => {
  /** English labels, looked up by their key. */
  const translate = (key: string): string => {
    const text = key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en);
    if (typeof text !== 'string') {
      throw new Error(`No text for ${key}`);
    }
    return text;
  };
  const run = makeActivity({
    localDate: '2026-10-13',
    distanceMeters: 12_340,
    movingTimeSeconds: 3_900,
    elevationGainMeters: 85,
  });
  const range = weekRange('2026-10-14');
  const data: SummaryData = {
    mode: 'summary',
    kind: 'week',
    summary: summarize([run], range),
    activities: [run],
    bucketSize: 'day',
    families: [],
    current: false,
  };

  it('names the period over its main totals, as they are written', () => {
    expect(periodTotalsHeader(data, 'distance', 3, context, translate)).toEqual({
      title: '12 oct – 18 oct 2026',
      data: [
        { label: 'summaryMetrics.totalDistance', value: '12,34', unit: 'km' },
        { label: 'summaryMetrics.totalMovingTime', value: '1:05', unit: 'h' },
        { label: 'summaryMetrics.totalElevationGain', value: '85', unit: 'm' },
      ],
    });
    expect(periodTotalsHeader(data, 'distance', 2, context, translate).data).toHaveLength(2);
  });

  it('writes first the total of what the chart draws', () => {
    expect(
      periodTotalsHeader(data, 'movingTime', 2, context, translate).data.map(
        (datum) => datum.label,
      ),
    ).toEqual(['summaryMetrics.totalMovingTime', 'summaryMetrics.totalDistance']);
  });

  it('calls the period in progress "this week", and names the sport of a filtered one', () => {
    expect(
      periodTotalsHeader({ ...data, current: true }, 'distance', 3, context, translate).title,
    ).toBe('This week');
    expect(
      periodTotalsHeader(
        { ...data, current: true, families: ['run'] },
        'distance',
        3,
        context,
        translate,
      ).title,
    ).toBe('This week · Running');
    expect(
      periodTotalsHeader({ ...data, families: ['run'] }, 'distance', 3, context, translate).title,
    ).toBe('12 oct – 18 oct 2026 · Running');
    // A month or a year in progress keeps its name: short, and it says which one.
    const october = monthRange('2026-10-01');
    const month: SummaryData = {
      ...data,
      kind: 'month',
      summary: summarize([run], october),
      current: true,
    };
    expect(periodTotalsHeader(month, 'distance', 3, context, translate).title).toBe(
      'Octubre de 2026',
    );
    // A summary of several sports names none.
    expect(
      periodTotalsHeader({ ...data, families: ['run', 'ride'] }, 'distance', 3, context, translate)
        .title,
    ).toBe('12 oct – 18 oct 2026');
  });
});

describe('plainSummaryText', () => {
  it('writes totals with a decimal point, a time in units and a count bare', () => {
    expect(plainSummaryText('totalDistance', 94_231, context)).toBe('94.23 km');
    expect(plainSummaryText('totalDistance', 94_231, context, 1)).toBe('94.2 km');
    expect(plainSummaryText('totalElevationGain', 12_909, context)).toBe('12909 m');
    expect(plainSummaryText('totalMovingTime', 26_280, context)).toBe(
      `7${TEST_DURATION_UNITS.hours} 18${TEST_DURATION_UNITS.minutes}`,
    );
    expect(plainSummaryText('activityCount', 6, context)).toBe('6');
  });
});

describe('summaryTotalText', () => {
  const translate = (key: string, values?: Readonly<Record<string, string>>): string =>
    ({
      'widgets.activities': `${values?.number ?? ''} act.`,
    })[key] ?? key;

  it('says what the number of activities counts, and writes the rest as data widgets do', () => {
    expect(summaryTotalText('activityCount', 6, context, translate)).toBe('6 act.');
    expect(summaryTotalText('activityCount', 1, context, translate)).toBe('1 act.');
    expect(summaryTotalText('totalDistance', 94_231, context, translate)).toBe('94.23 km');
  });
});

describe('familyCard', () => {
  const translate = (key: string, values?: Readonly<Record<string, string>>): string =>
    ({
      'families.run': 'Carreras',
      'families.training': 'Entrenos',
      'widgets.sessionOne': '1 sesión',
      'widgets.sessions': `${values?.number ?? ''} sesiones`,
    })[key] ?? key;

  it('writes a sport with distance by its distance, its time and its own pace', () => {
    const card = familyCard(
      {
        family: 'run',
        activityCount: 3,
        distanceMeters: 34_350,
        movingTimeSeconds: 12_300,
        calories: 2000,
      },
      context,
      translate,
    );
    expect(card).toEqual({
      name: 'Carreras',
      total: '34.35 km',
      detail: `3${TEST_DURATION_UNITS.hours} 25${TEST_DURATION_UNITS.minutes} · 5:58/km`,
    });
  });

  it('writes a sport without distance by its time, its sessions and its calories', () => {
    const gym = {
      family: 'training',
      activityCount: 2,
      distanceMeters: 0,
      movingTimeSeconds: 7_620,
      calories: 686,
    } as const;
    expect(familyCard(gym, context, translate).detail).toBe(
      `2 sesiones · 686 ${testUnitLabel('kcal')}`,
    );
    expect(
      familyCard({ ...gym, activityCount: 1, calories: null }, context, translate).detail,
    ).toBe('1 sesión');
  });
});

describe('periodTable', () => {
  const translate = (key: string): string =>
    ({ 'tableMeasures.km': 'Kilómetros', 'tableMeasures.hours': 'Horas', thisWeek: 'Esta semana' })[
      key
    ] ?? key;
  const range = weekRange('2026-10-14');
  const activities = [
    makeActivity({ localDate: '2026-10-13', distanceMeters: 10_940, movingTimeSeconds: 3_900 }),
    makeActivity({ localDate: '2026-10-14', distanceMeters: 6_000, movingTimeSeconds: 1_800 }),
    makeActivity({ localDate: '2026-10-14', distanceMeters: 5_300, movingTimeSeconds: 1_700 }),
  ];
  const data: SummaryData = {
    mode: 'summary',
    kind: 'week',
    summary: summarize(activities, range),
    activities,
    bucketSize: 'day',
    families: [],
    current: true,
  };

  it("writes a row per day with some, in one decimal without unit, and the period's total", () => {
    expect(periodTable(data, 'distance', context, translate)).toEqual({
      title: 'Esta semana',
      measure: 'Kilómetros',
      rows: [
        { name: 'Martes', value: '10.9' },
        { name: 'Miércoles', value: '11.3' },
      ],
      total: '22.2',
    });
  });

  it('writes times in hours and minutes', () => {
    const table = periodTable(data, 'movingTime', context, translate);
    expect(table.measure).toBe('Horas');
    expect(table.rows.map((row) => row.value)).toEqual(['1:05', '0:58']);
    expect(table.total).toBe('2:03');
  });
});

describe('periodNoteLines', () => {
  const translate = (key: string, values?: Readonly<Record<string, string>>): string =>
    key === 'noteLine'
      ? `${values?.value ?? ''} de ${values?.sport ?? ''}`
      : (({ 'modalities.roadRun': 'Carrera', 'modalities.workout': 'Entrenamiento' } as const)[
          key as 'modalities.roadRun'
        ] ?? key);
  const range = weekRange('2026-10-14');
  const run = (localDate: string, distanceMeters: number) =>
    makeActivity({
      sportType: 'Run',
      localDate,
      startLocal: `${localDate}T08:00:00`,
      distanceMeters,
      movingTimeSeconds: 3_000,
    });
  const gym = makeActivity({
    sportType: 'Workout',
    localDate: '2026-10-13',
    startLocal: '2026-10-13T19:00:00',
    distanceMeters: 0,
    elevationGainMeters: 0,
    routePolyline: null,
    movingTimeSeconds: 3_257,
  });
  // Newest first, as a source may list them.
  const activities = [run('2026-10-15', 6_000), gym, run('2026-10-13', 10_940)];
  const data: SummaryData = {
    mode: 'summary',
    kind: 'week',
    summary: summarize(activities, range),
    activities,
    bucketSize: 'day',
    families: [],
    current: true,
  };

  it('ticks off each activity, oldest first, by its distance or its time without seconds, and its sport', () => {
    expect(periodNoteLines(data, 'activities', context, translate)).toEqual([
      { text: '10,94 km de carrera', checked: true, highlighted: true, sports: [] },
      {
        text: `54${TEST_DURATION_UNITS.minutes} de entrenamiento`,
        checked: true,
        highlighted: false,
        sports: [],
      },
      { text: '6,00 km de carrera', checked: true, highlighted: false, sports: [] },
    ]);
  });

  it('ticks off the days with activities and their sports, the longest highlighted, and leaves the rest', () => {
    const lines = periodNoteLines(data, 'buckets', context, translate);
    expect(lines).toHaveLength(7);
    expect(lines[0]).toEqual({ text: 'Lunes', checked: false, highlighted: false, sports: [] });
    expect(lines[1]).toEqual({
      text: 'Martes · 10,94 km',
      checked: true,
      highlighted: true,
      sports: ['run', 'training'],
    });
    expect(lines[3]).toEqual({
      text: 'Jueves · 6,00 km',
      checked: true,
      highlighted: false,
      sports: ['run'],
    });
  });

  it("leaves a day's sports out of a summary of one sport, which the note names once", () => {
    const runs: SummaryData = { ...data, families: ['run'] };
    expect(periodNoteLines(runs, 'buckets', context, translate)[3].sports).toEqual([]);
  });

  it("leaves a week's or a month's sports out: the icons are a day's", () => {
    const october = monthRange('2026-10-01');
    const month: SummaryData = {
      ...data,
      kind: 'month',
      summary: summarize(activities, october),
      bucketSize: 'week',
      current: false,
    };
    const lines = periodNoteLines(month, 'buckets', context, translate);
    expect(lines.every((line) => line.sports.length === 0)).toBe(true);
  });

  it('writes a day without distance by its time, and highlights nothing alone', () => {
    const alone: SummaryData = {
      ...data,
      summary: summarize([gym], range),
      activities: [gym],
    };
    expect(periodNoteLines(alone, 'buckets', context, translate)[1]).toEqual({
      text: `Martes · 54${TEST_DURATION_UNITS.minutes}`,
      checked: true,
      highlighted: false,
      sports: ['training'],
    });
    expect(periodNoteLines(alone, 'activities', context, translate)[0].highlighted).toBe(false);
  });
});

describe('periodLaps', () => {
  const translate = (key: string): string =>
    ({
      'widgets.laps.lap': 'Vuelta',
      'widgets.laps.distance': 'Dist.',
      'widgets.laps.calories': 'Kcal',
      'widgets.laps.time': 'Tiempo',
      'widgets.laps.pace': 'Ritmo',
      'widgets.laps.speed': 'Vel.',
      'widgets.laps.activities': 'Act.',
      thisWeek: 'Esta semana',
    })[key] ?? key;
  const range = weekRange('2026-10-14');
  const run = (localDate: string, distanceMeters: number, movingTimeSeconds: number) =>
    makeActivity({ sportType: 'Run', localDate, distanceMeters, movingTimeSeconds });
  const runs = [run('2026-10-13', 10_000, 3_000), run('2026-10-15', 21_100, 6_330)];
  const week = (activities: readonly ReturnType<typeof run>[]): SummaryData => ({
    mode: 'summary',
    kind: 'week',
    summary: summarize(activities, range),
    activities,
    bucketSize: 'day',
    families: [],
    current: true,
  });

  it("writes a lap per day with activities, a sport's pace, and the longest as the fastest", () => {
    const laps = periodLaps(week(runs), context, translate);
    expect(laps.names).toEqual(['Vuelta', 'Dist.', 'Tiempo', 'Ritmo']);
    const km = testUnitLabel('km');
    expect(laps.rows).toEqual([
      { number: 'MAR', distance: '10,00', unit: km, time: '50:00', value: '5:00' },
      { number: 'JUE', distance: '21,10', unit: km, time: '1:45:30', value: '5:00' },
    ]);
    expect(laps.fastest).toBe(1);
    expect(laps.after).toBe(`/${km}`);
    expect(laps.value).toBe('pace');
    expect(laps.title).toBe('Esta semana');
  });

  it('counts the activities of a lap instead of an average over different sports', () => {
    const ride = makeActivity({
      sportType: 'Ride',
      localDate: '2026-10-13',
      distanceMeters: 40_000,
      movingTimeSeconds: 5_400,
    });
    const laps = periodLaps(week([...runs, ride]), context, translate);
    expect(laps.names[3]).toBe('Act.');
    expect(laps.rows.map((row) => row.value)).toEqual(['2', '1']);
    expect(laps.after).toBe('');
    expect(laps.value).toBe('count');
  });

  it("writes a day without distance by its calories, and a gym's laps after them", () => {
    const gym = (localDate: string, calories: number | null) =>
      makeActivity({
        sportType: 'WeightTraining',
        localDate,
        distanceMeters: 0,
        elevationGainMeters: 0,
        routePolyline: null,
        movingTimeSeconds: 3_600,
        calories,
      });
    const kcal = testUnitLabel('kcal');
    // A gym day among runs: its calories instead of "0 km".
    const mixed = periodLaps(week([...runs, gym('2026-10-14', 512)]), context, translate);
    expect(mixed.names[1]).toBe('Dist.');
    expect(mixed.rows[1]).toEqual({
      number: 'MIÉ',
      distance: '512',
      unit: kcal,
      time: '1:00:00',
      value: '1',
    });
    // Only gym sessions: the column is the calories', a dash where none were recorded.
    const sessions = periodLaps(
      week([gym('2026-10-13', 400), gym('2026-10-16', null)]),
      context,
      translate,
    );
    expect(sessions.names[1]).toBe('Kcal');
    expect(sessions.rows.map((row) => row.distance)).toEqual(['400', MISSING_VALUE]);
    expect(sessions.value).toBe('count');
  });
});

describe('periodReceipt and periodBoardingPass', () => {
  const translate = (key: string): string =>
    ({
      'modalities.roadRun': 'Carrera',
      'modalities.workout': 'Entrenamiento',
      'widgets.receipt.items': 'Artículos',
      'widgets.receipt.total': 'Total',
      'widgets.boardingPass.activities': 'Actividades',
      'widgets.boardingPass.time': 'Tiempo',
      'widgets.boardingPass.activeDays': 'Días activos',
      thisWeek: 'Esta semana',
    })[key] ?? key;
  const range = weekRange('2026-10-14');
  const run = (localDate: string, distanceMeters: number) =>
    makeActivity({
      sportType: 'Run',
      localDate,
      startLocal: `${localDate}T08:00:00`,
      distanceMeters,
      movingTimeSeconds: 3_000,
    });
  const gym = makeActivity({
    sportType: 'Workout',
    localDate: '2026-10-15',
    startLocal: '2026-10-15T19:00:00',
    distanceMeters: 0,
    elevationGainMeters: 0,
    routePolyline: null,
    movingTimeSeconds: 3_257,
  });
  const summaryOf = (activities: readonly ReturnType<typeof run>[]): SummaryData => ({
    mode: 'summary',
    kind: 'week',
    summary: summarize(activities, range),
    activities,
    bucketSize: 'day',
    families: [],
    current: true,
  });
  const km = testUnitLabel('km');

  it('lists a week by its activities, how far or how long, then how many and the total', () => {
    const receipt = periodReceipt(
      summaryOf([run('2026-10-16', 6_000), gym, run('2026-10-13', 10_940)]),
      context,
      translate,
    );
    expect(receipt.header).toEqual(['Esta semana', '12/10/2026 – 18/10/2026']);
    expect(receipt.items).toEqual([
      { name: 'Mar Carrera', value: `10,94 ${km}` },
      { name: 'Jue Entrenamiento', value: '54:17' },
      { name: 'Vie Carrera', value: `6,00 ${km}` },
    ]);
    expect(receipt.totals).toEqual([
      { name: 'Artículos', value: '3' },
      { name: 'Total', value: `16,94 ${km}` },
    ]);
  });

  it('flies from the first activity to the last, its activities, time and active days', () => {
    const pass = periodBoardingPass(
      summaryOf([run('2026-10-16', 6_000), run('2026-10-13', 10_940), run('2026-10-13', 3_000)]),
      context,
      translate,
    );
    expect(pass.title).toBe('Esta semana');
    expect(pass.distance).toEqual({ value: '19,94', unit: km });
    expect([pass.firstDay, pass.lastDay]).toEqual(['13 oct', '16 oct']);
    expect(pass.fields.map((field) => field.value)).toEqual([
      '3',
      `2:30 ${testUnitLabel('h')}`,
      '2',
    ]);
    // Without any distance, its days alone.
    expect(periodBoardingPass(summaryOf([gym]), context, translate).distance).toBeNull();
  });
});

describe('roundedChartValue', () => {
  it('rounds distances to whole units and writes times in hours and minutes', () => {
    expect(roundedChartValue('distance', 41_490, context, false)).toBe('41');
    expect(roundedChartValue('distance', 41_500, context, true)).toBe('42 km');
    expect(roundedChartValue('distance', 41_500, { ...context, unit: 'mi' }, false)).toBe('26');
    expect(roundedChartValue('movingTime', 4_680, context, false)).toBe('1:18');
    expect(roundedChartValue('movingTime', 4_680, context, true)).toBe('1:18 h');
  });

  it('writes an empty bar as 0, so every bar has its value', () => {
    expect(roundedChartValue('distance', 0, context, false)).toBe('0');
    expect(roundedChartValue('movingTime', 0, context, false)).toBe('0');
    expect(roundedChartValue('movingTime', 0, context, true)).toBe('0 h');
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
      distanceMeters: 1000,
      movingTimeSeconds: 450,
      speed: 1000 / 450,
      elevationDifference: 110.4,
      heartRate: 151.6,
    };
    expect(splitRowTexts(row, 'pace', context)).toEqual({
      number: '1',
      distance: '1,00',
      time: '7:30',
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
    ).toMatchObject({ number: '1–3', value: '8,0', elevation: '−72', heartRate: '—' });
    // A descent that rounds to nothing has no minus.
    expect(splitRowTexts({ ...row, elevationDifference: -0.2 }, 'pace', context).elevation).toBe(
      '0',
    );
  });

  it('write the gap of a row of splits to the fastest as the difference of what they show', () => {
    const row = {
      first: 1,
      last: 1,
      distanceMeters: 1000,
      movingTimeSeconds: 342,
      speed: 1000 / 342.4,
      elevationDifference: 0,
      heartRate: null,
    };
    const fastest = { ...row, speed: 1000 / 320.6 };
    // 5:42 against 5:21, as written.
    expect(splitGapText(row, fastest, 'pace', context)).toBe('+0:21');
    expect(splitGapText(fastest, fastest, 'pace', context)).toBe('+0:00');
    // Per 100 m: 34 s against 32 s.
    expect(splitGapText(row, fastest, 'swimPace', context)).toBe('+0:02');
    // 10,5 km/h against 11,2 km/h.
    expect(splitGapText(row, fastest, 'speed', context)).toBe('−0,7');
    expect(splitGapText({ ...row, speed: 0 }, fastest, 'pace', context)).toBe('—');
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

describe('activityNutrition and periodNutrition', () => {
  /** The key, with its values after it: what each text says is checked, not its wording. */
  const translate = (key: string, values?: Readonly<Record<string, string>>): string =>
    values === undefined ? key : `${key}(${Object.values(values).join(',')})`;
  /** A percentage with its no-break space as a plain one. */
  const plain = (text: string | null) => text?.replace(/\s/gu, ' ') ?? null;
  const range = weekRange('2026-10-14');
  const run = makeActivity({
    sportType: 'Run',
    localDate: '2026-10-13',
    startLocal: '2026-10-13T08:00:00',
    distanceMeters: 10_000,
    movingTimeSeconds: 3_000,
    calories: 700,
  });
  const ride = makeActivity({
    sportType: 'Ride',
    localDate: '2026-10-15',
    startLocal: '2026-10-15T08:00:00',
    distanceMeters: 30_000,
    movingTimeSeconds: 6_000,
    calories: null,
  });
  const summaryOf = (activities: readonly (typeof run)[]): SummaryData => ({
    mode: 'summary',
    kind: 'week',
    summary: summarize(activities, range),
    activities,
    bucketSize: 'day',
    families: [],
    current: true,
  });

  it("writes a period's calories, totals and sports, each sport's share of the time under it", () => {
    const label = periodNutrition(summaryOf([run, ride]), context, translate);
    expect(label.servings).toBe('widgets.nutrition.servings.other(2)');
    expect(label.serving).toBe('thisWeek');
    // Only the run has calories: they are the period's.
    expect(label.calories).toBe('700');
    expect(label.rows.map((row) => [row.name, row.part, plain(row.share)])).toEqual([
      ['widgets.nutrition.distance', false, null],
      ['widgets.nutrition.time', false, null],
      ['families.ride', true, '67 %'],
      ['families.run', true, '33 %'],
      ['widgets.nutrition.elevation', false, null],
      ['widgets.nutrition.activities', false, null],
      ['widgets.nutrition.activeDays', false, '29 %'],
    ]);
    expect(label.rows[1]).toMatchObject({ value: '2h 30min', time: '2h 30min' });
    expect(label.ingredients.map(plain)).toEqual([
      'modalities.roadride (67 %)',
      'modalities.roadrun (33 %)',
    ]);
  });

  it('has no calories when none of its activities has any, and one sport without its share', () => {
    const label = periodNutrition(summaryOf([ride]), context, translate);
    expect(label.calories).toBeNull();
    expect(label.rows.some((row) => row.part)).toBe(false);
    expect(label.ingredients).toEqual(['modalities.roadride']);
  });

  it("writes an activity's data in its sport's order, without its calories, which are its energy", () => {
    const label = activityNutrition(
      { mode: 'activity', activity: run, detail: null, place: null, zones: null },
      context,
      translate,
    );
    expect(label.servings).toBe('widgets.nutrition.servings.one');
    expect(label.serving).toBe('13 oct');
    expect(label.calories).toBe('700');
    expect(label.rows.map((row) => row.name)).not.toContain('metrics.calories');
    expect(label.rows[0].name).toBe('metrics.distance');
    const time = label.rows.find((row) => row.time !== undefined);
    expect(time).toMatchObject({ name: 'metrics.movingTime', value: '50min', time: '50min' });
    expect(label.rows.every((row) => !row.part)).toBe(true);
    expect(label.ingredients).toEqual(['modalities.roadrun']);
  });

  it('writes under its time the time in each heart rate zone it reached, and its share', () => {
    const streams = {
      time: [0, 60, 120, 180, 240],
      heartRate: [100, 100, 150, 150, 150],
      distance: null,
      altitude: null,
      speed: null,
      power: null,
    };
    const label = activityNutrition(
      {
        mode: 'activity',
        activity: run,
        detail: { streams, splits: { metric: [], imperial: [] }, laps: [] },
        place: null,
        zones: [
          { min: 0, max: 120 },
          { min: 120, max: 140 },
          { min: 140, max: null },
        ],
      },
      context,
      translate,
    );
    const time = label.rows.findIndex((row) => row.time !== undefined);
    expect(
      label.rows.slice(time + 1, time + 3).map((row) => [row.name, row.part, plain(row.share)]),
    ).toEqual([
      ['widgets.nutrition.zone(1)', true, '25 %'],
      ['widgets.nutrition.zone(3)', true, '75 %'],
    ]);
  });
});

describe('equivalenceLines', () => {
  const translate = (key: string, values?: Readonly<Record<string, string>>): string =>
    values === undefined ? key : `${key}(${Object.values(values).join(',')})`;

  it('writes how many times with a decimal under ten, whole from ten, and what it is of', () => {
    const lines = equivalenceLines(
      [
        { measure: 'distance', reference: 'marathon', times: 94_230 / 42_195, amount: 94_230 },
        { measure: 'distance', reference: 'track', times: 11_340 / 400, amount: 11_340 },
        { measure: 'time', reference: 'football', times: 2, amount: 10_800 },
        { measure: 'calories', reference: 'burger', times: 1.02, amount: 561 },
      ],
      context,
      translate,
    );
    expect(lines.map((line) => [line.times, line.name])).toEqual([
      ['2,2', 'widgets.equivalences.items.marathon.other'],
      ['28', 'widgets.equivalences.items.track.other'],
      ['2', 'widgets.equivalences.items.football.other'],
      // It reads one: in the singular.
      ['1', 'widgets.equivalences.items.burger.one'],
    ]);
    expect(lines.map((line) => line.source)).toEqual([
      `widgets.equivalences.sources.distance(94,23 ${testUnitLabel('km')})`,
      `widgets.equivalences.sources.distance(11,34 ${testUnitLabel('km')})`,
      'widgets.equivalences.sources.time(3h)',
      `widgets.equivalences.sources.calories(561 ${testUnitLabel('kcal')})`,
    ]);
  });
});
