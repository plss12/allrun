import { makeActivity } from '@/test-utils/make-activity';

import { weekRange } from './dates';
import { defaultActivityTemplate, defaultSummaryTemplate, newLayer } from './default-layout';
import {
  activityCatalog,
  type CatalogItem,
  type CatalogSection,
  catalogItemKey,
  type NewLayer,
  summaryCatalog,
} from './layer-catalog';
import { summarize } from './summary';
import { CANVAS_FORMATS, type CanvasFormat, parseTemplate, type Template } from './template';
import { addLayer, uniqueLayerId } from './template-edit';

const week = weekRange('2026-10-14');
const items = (catalog: readonly CatalogSection[]) => catalog.flatMap((section) => section.items);
const keys = (catalog: readonly CatalogSection[]) => items(catalog).map(catalogItemKey);

/** Adds every catalog item to `template` (free text with some content) and validates it. */
function addAll(template: Template, catalog: readonly CatalogSection[]): Template {
  return parseTemplate(
    items(catalog).reduce((current, item: CatalogItem) => {
      const pick: NewLayer = item.kind === 'text' ? { kind: 'text', content: 'PB!' } : item;
      const id = uniqueLayerId(current, catalogItemKey(item));
      return addLayer(current, newLayer(pick, id, current.format));
    }, template),
  );
}

describe('activityCatalog', () => {
  it('offers the metrics the activity has, its texts, the route and the logo', () => {
    const catalog = activityCatalog(makeActivity({ sportType: 'TrailRun' }));
    expect(catalog.map((section) => section.id)).toEqual(['data', 'text', 'graphics', 'brand']);
    expect(keys(catalog)).toEqual([
      'metric-distance',
      'metric-elevationGain',
      'metric-movingTime',
      'metric-maxElevation',
      'metric-pace',
      'metric-averageHeartRate',
      'metric-maxHeartRate',
      'metric-averageCadence',
      'metric-calories',
      'metric-elapsedTime',
      'info-activityName',
      'info-activityDate',
      'text',
      'route',
      'logo-allrun',
    ]);
  });

  it('leaves out the graphics of an activity without GPS', () => {
    const catalog = activityCatalog(makeActivity({ sportType: 'Yoga', routePolyline: null }));
    expect(catalog.some((section) => section.id === 'graphics')).toBe(false);
  });

  it.each(Object.keys(CANVAS_FORMATS) as CanvasFormat[])(
    'makes valid, centered layers in the %s format',
    (format) => {
      const activity = makeActivity();
      const template = addAll(defaultActivityTemplate(activity, format), activityCatalog(activity));
      const added = template.layers.slice(defaultActivityTemplate(activity, format).layers.length);
      expect(added).toHaveLength(items(activityCatalog(activity)).length);
      for (const layer of added) {
        expect(layer.transform).toMatchObject({ x: 0.5, y: 0.5, rotation: 0 });
      }
    },
  );
});

describe('summaryCatalog', () => {
  const activities = [makeActivity({ localDate: '2026-10-13' })];

  it('offers every total, the period texts, the routes, the chart and the logo', () => {
    const catalog = summaryCatalog(summarize(activities, week));
    expect(keys(catalog)).toEqual([
      'summaryMetric-totalDistance',
      'summaryMetric-totalMovingTime',
      'summaryMetric-activityCount',
      'summaryMetric-totalElevationGain',
      'summaryMetric-averagePace',
      'summaryMetric-longestDistance',
      'info-periodName',
      'text',
      'summaryRoutes',
      'summaryChart',
      'logo-allrun',
    ]);
  });

  it('leaves out the routes when no activity has GPS, but keeps the chart', () => {
    const catalog = summaryCatalog(summarize([], week));
    expect(keys(catalog)).not.toContain('summaryRoutes');
    expect(items(catalog)).toContainEqual({ kind: 'summaryChart' });
  });

  it('makes valid layers', () => {
    const catalog = summaryCatalog(summarize(activities, week));
    const template = addAll(defaultSummaryTemplate('square'), catalog);
    expect(template.layers.length).toBe(
      defaultSummaryTemplate('square').layers.length + items(catalog).length,
    );
  });
});
