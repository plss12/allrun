import { makeActivity } from '@/test-utils/make-activity';

import { defaultActivityTemplate, defaultSummaryTemplate } from './default-layout';
import { parseTemplate } from './template';

describe('defaultActivityTemplate', () => {
  it('is a valid template with the top three metrics of the sport', () => {
    const template = parseTemplate(
      defaultActivityTemplate(makeActivity({ sportType: 'TrailRun' })),
    );
    const metrics = template.layers.flatMap((layer) =>
      layer.kind === 'metric' ? [layer.metric] : [],
    );
    expect(metrics).toEqual(['distance', 'elevationGain', 'movingTime']);
  });

  it('skips the route for activities without GPS', () => {
    const template = defaultActivityTemplate(
      makeActivity({ sportType: 'VirtualRun', routePolyline: null }),
    );
    expect(template.layers.some((layer) => layer.kind === 'route')).toBe(false);
  });

  it('spreads the metrics evenly when there are fewer than three', () => {
    const gym = makeActivity({
      sportType: 'Yoga',
      distanceMeters: 0,
      averageSpeed: null,
      elevationGainMeters: 0,
      averageHeartRate: null,
      maxHeartRate: null,
      calories: null,
      routePolyline: null,
    });
    const xs = defaultActivityTemplate(gym).layers.flatMap((layer) =>
      layer.kind === 'metric' ? [layer.transform.x] : [],
    );
    expect(xs.map((x) => Number(x.toFixed(3)))).toEqual([0.25, 0.75]);
  });

  it('uses the requested format', () => {
    expect(defaultActivityTemplate(makeActivity(), 'square').format).toBe('square');
  });
});

describe('defaultSummaryTemplate', () => {
  it('is a valid summary template with the requested chart buckets', () => {
    const template = parseTemplate(defaultSummaryTemplate('month'));
    expect(template.mode).toBe('summary');
    expect(template.layers.find((layer) => layer.kind === 'summaryChart')).toMatchObject({
      bucket: 'month',
    });
  });
});

describe('default layouts in every format', () => {
  const formats = ['story', 'tall', 'portrait', 'square', 'landscape'] as const;

  it('keeps each widget of a metrics row within its own column', () => {
    for (const format of formats) {
      for (const template of [
        defaultActivityTemplate(makeActivity(), format),
        defaultSummaryTemplate('day', format),
      ]) {
        const row = template.layers
          .flatMap((layer) =>
            layer.kind === 'metric' || layer.kind === 'summaryMetric' ? [layer] : [],
          )
          .sort((a, b) => a.transform.x - b.transform.x);
        expect(row).toHaveLength(3);
        row.slice(1).forEach((layer, i) => {
          const previous = row[i];
          const halfWidths = ((layer.maxWidth ?? 1) + (previous.maxWidth ?? 1)) / 2;
          expect(layer.transform.x - previous.transform.x).toBeGreaterThanOrEqual(halfWidths);
        });
      }
    }
  });

  it('shrinks the widgets on shorter canvases', () => {
    const scaleOf = (format: (typeof formats)[number]) =>
      defaultSummaryTemplate('day', format).layers.find((layer) => layer.id === 'chart')?.transform
        .scale;
    expect(scaleOf('story')).toBeGreaterThan(scaleOf('tall') ?? 0);
    expect(scaleOf('tall')).toBeGreaterThan(scaleOf('portrait') ?? 0);
    expect(scaleOf('portrait')).toBeGreaterThan(scaleOf('square') ?? 0);
  });
});

describe('landscape layout', () => {
  const byId = (template: ReturnType<typeof defaultSummaryTemplate>, id: string) => {
    const found = template.layers.find((layer) => layer.id === id);
    if (found === undefined) {
      throw new Error(`No layer ${id}`);
    }
    return found;
  };

  it('puts graphics in the left column and text in the right one', () => {
    const summary = defaultSummaryTemplate('day', 'landscape');
    expect(byId(summary, 'routes').transform.x).toBeLessThan(0.5);
    expect(byId(summary, 'chart').transform.x).toBeLessThan(0.5);
    for (const id of ['period', 'total-totalDistance', 'total-activityCount', 'logo']) {
      expect(byId(summary, id).transform.x).toBeGreaterThan(0.44);
    }
    const activity = defaultActivityTemplate(makeActivity(), 'landscape');
    expect(byId(activity, 'route').transform.x).toBeLessThan(0.5);
    expect(byId(activity, 'name').transform.x).toBeGreaterThan(0.5);
  });
});
