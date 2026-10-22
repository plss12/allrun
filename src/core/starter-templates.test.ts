import { makeActivity } from '@/test-utils/make-activity';
import { makeSummary } from '@/test-utils/make-summary';

import { designFont } from './default-layout';
import type { TemplateData } from './layout-kit';
import { STARTER_TEMPLATE_IDS, starterTemplate } from './starter-templates';
import { type CanvasFormat, type FontId, type Layer, parseTemplate } from './template';

const FORMATS: readonly CanvasFormat[] = ['story', 'tall', 'portrait', 'square', 'landscape'];

const activity: TemplateData = { mode: 'activity', activity: makeActivity() };
const summary: TemplateData = { mode: 'summary', summary: makeSummary() };
const gym = makeActivity({
  sportType: 'WeightTraining',
  distanceMeters: 0,
  averageSpeed: null,
  elevationGainMeters: 0,
  routePolyline: null,
});
const gymSummary: TemplateData = { mode: 'summary', summary: makeSummary([gym]) };

const fontsOf = (layers: readonly Layer[]): Set<FontId> =>
  new Set(
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
    }),
  );

const valuesOf = (layers: readonly Layer[]) =>
  layers.flatMap((layer) =>
    layer.kind === 'metric' || layer.kind === 'summaryMetric' ? [layer] : [],
  );

describe('starterTemplate', () => {
  it('is a valid template of the data mode in every format', () => {
    for (const id of STARTER_TEMPLATE_IDS) {
      for (const format of FORMATS) {
        for (const data of [activity, summary, gymSummary]) {
          const template = parseTemplate(starterTemplate(id, data, format));
          expect(template.format).toBe(format);
          expect(template.mode).toBe(data.mode);
        }
      }
    }
  });

  it('writes each one in a font of its own', () => {
    const fonts = STARTER_TEMPLATE_IDS.map((id) => {
      const used = new Set([
        ...fontsOf(starterTemplate(id, activity, 'story').layers),
        ...fontsOf(starterTemplate(id, summary, 'story').layers),
      ]);
      expect(used.size).toBe(1);
      return [...used][0];
    });
    expect(fonts).toEqual(['barlowCondensed', 'unbounded', 'playfairDisplay', 'inter']);
  });

  it('keeps every text that may shrink inside the canvas, at its scale', () => {
    for (const id of STARTER_TEMPLATE_IDS) {
      for (const format of FORMATS) {
        for (const data of [activity, summary]) {
          for (const layer of starterTemplate(id, data, format).layers) {
            if ('maxWidth' in layer && layer.maxWidth !== undefined) {
              const half = (layer.maxWidth * layer.transform.scale) / 2;
              expect(layer.transform.x - half).toBeGreaterThanOrEqual(0);
              expect(layer.transform.x + half).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });

  it('leaves the route out for activities without one', () => {
    const indoor: TemplateData = { mode: 'activity', activity: gym };
    for (const id of STARTER_TEMPLATE_IDS) {
      expect(starterTemplate(id, indoor, 'story').layers.some((l) => l.kind === 'route')).toBe(
        false,
      );
    }
  });

  it('makes the main value of a poster the biggest', () => {
    for (const format of FORMATS) {
      const [main, ...others] = valuesOf(starterTemplate('poster', activity, format).layers);
      expect(main.metric).toBe('distance');
      for (const other of others) {
        expect(main.transform.scale).toBeGreaterThan(other.transform.scale);
      }
    }
  });

  it('shows just two values in the classic one', () => {
    expect(valuesOf(starterTemplate('classic', activity, 'story').layers)).toHaveLength(2);
    expect(valuesOf(starterTemplate('classic', summary, 'story').layers)).toHaveLength(2);
  });

  it('groups the minimal one in the bottom left corner, without labels or bare counts', () => {
    for (const format of FORMATS) {
      for (const data of [activity, summary]) {
        for (const layer of starterTemplate('minimal', data, format).layers) {
          expect(layer.transform.x).toBeLessThan(0.5);
          expect(layer.transform.y).toBeGreaterThan(0.4);
        }
      }
    }
    const totals = valuesOf(starterTemplate('minimal', summary, 'story').layers);
    expect(totals.map((layer) => layer.metric)).toEqual(['totalDistance', 'totalMovingTime']);
    expect(totals.every((layer) => !layer.showLabel)).toBe(true);
  });

  it('stacks the minimal values with the first one on top', () => {
    const values = valuesOf(starterTemplate('minimal', activity, 'story').layers);
    const ys = values.map((layer) => layer.transform.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });
});

describe('designFont', () => {
  it('is the font most texts of the design are in', () => {
    expect(designFont(starterTemplate('poster', activity, 'story').layers)).toBe('unbounded');
    const classic = starterTemplate('classic', summary, 'square').layers;
    expect(designFont(classic)).toBe('playfairDisplay');
  });

  it('falls back to the default font without texts', () => {
    expect(designFont([])).toBe('barlowCondensed');
  });
});
