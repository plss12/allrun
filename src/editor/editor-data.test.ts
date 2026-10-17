import { weekRange } from '@/core/dates';
import { defaultActivityTemplate, defaultSummaryTemplate } from '@/core/default-layout';
import { summarize } from '@/core/summary';
import type { Layer } from '@/core/template';
import { en } from '@/i18n/locales/en';
import { makeActivity } from '@/test-utils/make-activity';

import {
  chartBuckets,
  chartTitleKey,
  type EditorData,
  hasUnit,
  layerText,
  MISSING_VALUE,
  type SummaryData,
  textRuns,
} from './editor-data';

const context = { unit: 'km', locale: 'es' } as const;
const activity = makeActivity({ name: 'Rodaje suave', startLocal: '2026-10-14T08:00:00' });
const activityData: EditorData = { mode: 'activity', activity };

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
      layerText(layer('metric-distance', layers), activityData, { unit: 'mi', locale: 'en' }),
    ).toMatchObject({ value: '6.21', unit: 'mi' });
  });

  it('shows the name and the local date', () => {
    expect(layerText(layer('name', layers), activityData, context)?.value).toBe('Rodaje suave');
    expect(layerText(layer('date', layers), activityData, context)?.value).toBe(
      'Miércoles, 14 de octubre de 2026',
    );
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

  it('returns nothing for summary layers and non-text layers', () => {
    const summaryLayers = defaultSummaryTemplate().layers;
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
  const { layers } = defaultSummaryTemplate();

  it('shows totals and the period name', () => {
    expect(layerText(layer('total-totalDistance', layers), data, context)).toEqual({
      label: 'summaryMetrics.totalDistance',
      value: '20,00',
      unit: 'km',
    });
    expect(layerText(layer('total-activityCount', layers), data, context)?.value).toBe('2');
    expect(layerText(layer('period', layers), data, context)?.value).toBe('12 oct – 18 oct 2026');
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
  const found = layer('chart', defaultSummaryTemplate('story').layers);
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
    const total = layer('total-totalDistance', defaultSummaryTemplate().layers);
    if (total.kind !== 'summaryMetric') {
      throw new Error('Not a summary metric');
    }
    expect(hasUnit(total)).toBe(true);
    expect(hasUnit({ ...total, metric: 'totalMovingTime' })).toBe(true);
    expect(hasUnit({ ...total, metric: 'activityCount' })).toBe(false);
  });
});

describe('chartTitleKey', () => {
  it('names a translated title for every value and bar size', () => {
    for (const value of ['distance', 'movingTime'] as const) {
      for (const size of ['day', 'week', 'month'] as const) {
        const key = chartTitleKey(value, size);
        expect(key).toBe(`chartTitles.${value}.${size}`);
        expect(en.chartTitles[value][size]).toEqual(expect.any(String));
      }
    }
    expect(en.chartTitles.distance.week).toBe('{{unit}} per week');
  });
});
