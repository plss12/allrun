import { makeActivity } from '@/test-utils/make-activity';
import { makeSummary } from '@/test-utils/make-summary';

import { defaultActivityTemplate, defaultSummaryTemplate, newLayer } from './default-layout';
import { type Layer, parseTemplate } from './template';

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
    // Each in the middle of its half of the row, which spans 0.03..0.97 of the canvas.
    expect(xs.map((x) => Number(x.toFixed(3)))).toEqual([0.265, 0.735]);
  });

  it('uses the requested format', () => {
    expect(defaultActivityTemplate(makeActivity(), 'square').format).toBe('square');
  });
});

describe('defaultSummaryTemplate', () => {
  it('is a valid summary template whose chart bars follow the period', () => {
    const template = parseTemplate(defaultSummaryTemplate(makeSummary()));
    expect(template.mode).toBe('summary');
    expect(template.layers.find((layer) => layer.kind === 'summaryChart')).toMatchObject({
      bucket: 'auto',
      value: 'distance',
    });
  });

  it('totals and charts the time of a period without distance', () => {
    const gym = makeActivity({
      sportType: 'WeightTraining',
      distanceMeters: 0,
      elevationGainMeters: 0,
      routePolyline: null,
    });
    const template = parseTemplate(defaultSummaryTemplate(makeSummary([gym])));
    const totals = template.layers.flatMap((layer) =>
      layer.kind === 'summaryMetric' ? [layer.metric] : [],
    );
    expect(totals).toEqual(['totalMovingTime', 'activityCount']);
    expect(template.layers.find((layer) => layer.kind === 'summaryChart')).toMatchObject({
      value: 'movingTime',
    });
  });
});

describe('default layouts in every format', () => {
  const formats = ['story', 'tall', 'portrait', 'square', 'landscape'] as const;

  it('keeps each widget of a metrics row within its own column', () => {
    for (const format of formats) {
      for (const template of [
        defaultActivityTemplate(makeActivity(), format),
        defaultSummaryTemplate(makeSummary(), format),
      ]) {
        const row = template.layers
          .flatMap((layer) =>
            layer.kind === 'metric' || layer.kind === 'summaryMetric' ? [layer] : [],
          )
          .sort((a, b) => a.transform.x - b.transform.x);
        expect(row).toHaveLength(3);
        // `maxWidth` applies before the layer's scale.
        const widthOf = (layer: (typeof row)[number]) =>
          (layer.maxWidth ?? 1) * layer.transform.scale;
        row.slice(1).forEach((layer, i) => {
          const previous = row[i];
          const halfWidths = (widthOf(layer) + widthOf(previous)) / 2;
          expect(layer.transform.x - previous.transform.x).toBeGreaterThanOrEqual(halfWidths);
        });
        expect(row[0].transform.x - widthOf(row[0]) / 2).toBeGreaterThan(0);
        const last = row[row.length - 1];
        expect(last.transform.x + widthOf(last) / 2).toBeLessThan(1);
      }
    }
  });

  it('keeps every text that may shrink inside the canvas, at its scale', () => {
    for (const format of formats) {
      for (const template of [
        defaultActivityTemplate(makeActivity(), format),
        defaultSummaryTemplate(makeSummary(), format),
      ]) {
        for (const layer of template.layers) {
          if ('maxWidth' in layer && layer.maxWidth !== undefined) {
            const half = (layer.maxWidth * layer.transform.scale) / 2;
            expect(layer.transform.x - half).toBeGreaterThanOrEqual(0);
            expect(layer.transform.x + half).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('shrinks the widgets on shorter canvases', () => {
    const scaleOf = (format: (typeof formats)[number]) =>
      defaultSummaryTemplate(makeSummary(), format).layers.find((layer) => layer.id === 'chart')
        ?.transform.scale;
    expect(scaleOf('story')).toBeGreaterThan(scaleOf('tall') ?? 0);
    expect(scaleOf('tall')).toBeGreaterThan(scaleOf('portrait') ?? 0);
    expect(scaleOf('portrait')).toBeGreaterThan(scaleOf('square') ?? 0);
  });

  it('writes every text, including widgets added later, in one font', () => {
    const fontsOf = (layers: readonly Layer[]) =>
      layers.flatMap((layer) => {
        switch (layer.kind) {
          case 'metric':
          case 'summaryMetric':
          case 'info':
          case 'text':
            return [layer.style.font];
          case 'summaryChart':
            return [layer.font];
          default:
            return [];
        }
      });
    const fonts = new Set([
      ...fontsOf(defaultActivityTemplate(makeActivity()).layers),
      ...fontsOf(defaultSummaryTemplate(makeSummary()).layers),
      ...fontsOf([
        newLayer({ kind: 'text', content: 'PB!' }, 'text', 'story'),
        newLayer({ kind: 'metric', metric: 'distance' }, 'metric', 'story'),
      ]),
    ]);
    expect(fonts.size).toBe(1);
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
    const summary = defaultSummaryTemplate(makeSummary(), 'landscape');
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
