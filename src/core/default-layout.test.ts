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
    expect(xs.map((x) => Number(x.toFixed(3)))).toEqual([0.333, 0.667]);
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
