import { isLayerAllowed, type Layer, parseTemplate, type Template } from './template';

const center = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };
const textStyle = {
  font: 'barlowCondensed',
  color: '#FFFFFF',
  bold: false,
  uppercase: true,
  align: 'center',
  shadow: true,
} as const;

const distance: Layer = {
  id: 'distance',
  kind: 'metric',
  metric: 'distance',
  showLabel: true,
  showUnit: true,
  style: textStyle,
  transform: center,
  opacity: 1,
};
const route: Layer = {
  id: 'route',
  kind: 'route',
  stroke: { color: '#FFFFFF', width: 6 },
  transform: { ...center, y: 0.3 },
  opacity: 0.9,
};
const monthTotal: Layer = {
  id: 'total',
  kind: 'summaryMetric',
  metric: 'totalDistance',
  showLabel: true,
  showUnit: true,
  style: textStyle,
  transform: center,
  opacity: 1,
};

const activityTemplate: Template = {
  version: 1,
  id: 'tpl-1',
  name: 'Minimal',
  mode: 'activity',
  format: 'story',
  layers: [route, distance],
};

describe('parseTemplate', () => {
  it('accepts a valid template and survives a JSON round trip', () => {
    expect(parseTemplate(JSON.parse(JSON.stringify(activityTemplate)))).toEqual(activityTemplate);
  });

  it('rejects layers outside the canvas, bad colors and unknown fonts', () => {
    const outside = { ...distance, transform: { ...center, x: 1.2 } };
    expect(() => parseTemplate({ ...activityTemplate, layers: [outside] })).toThrow(/x/);

    const badColor = { ...route, stroke: { color: 'white', width: 6 } };
    expect(() => parseTemplate({ ...activityTemplate, layers: [badColor] })).toThrow(/color/);

    const badFont = { ...distance, style: { ...textStyle, font: 'comicSans' } };
    expect(() => parseTemplate({ ...activityTemplate, layers: [badFont] })).toThrow(/font/);
  });

  it('rejects duplicate layer ids', () => {
    expect(() => parseTemplate({ ...activityTemplate, layers: [distance, distance] })).toThrow(
      /Duplicate layer id "distance"/,
    );
  });

  it('rejects layers that do not fit the template mode', () => {
    expect(() => parseTemplate({ ...activityTemplate, layers: [monthTotal] })).toThrow(
      /summaryMetric.*not allowed in activity/,
    );
    expect(() => parseTemplate({ ...activityTemplate, mode: 'summary', layers: [route] })).toThrow(
      /route.*not allowed in summary/,
    );
  });

  it('rejects unknown versions and blank names', () => {
    expect(() => parseTemplate({ ...activityTemplate, version: 2 })).toThrow(/version/);
    expect(() => parseTemplate({ ...activityTemplate, name: '   ' })).toThrow(/name/);
  });

  it('reads a chart stored before its newer options with how it looked then', () => {
    const chart = {
      id: 'chart',
      kind: 'summaryChart',
      value: 'distance',
      color: '#FFFFFF',
      transform: center,
      opacity: 1,
    };
    const template = parseTemplate({ ...activityTemplate, mode: 'summary', layers: [chart] });
    expect(template.layers[0]).toMatchObject({
      bucket: 'auto',
      axisLabels: false,
      title: true,
      font: 'inter',
      bold: true,
      uppercase: true,
      align: 'center',
    });
  });
});

describe('isLayerAllowed', () => {
  const info = (field: 'activityName' | 'activityDate' | 'periodName'): Layer => ({
    id: field,
    kind: 'info',
    field,
    style: textStyle,
    transform: center,
    opacity: 1,
  });

  it('allows shared layers in both modes', () => {
    const text: Layer = {
      id: 'text',
      kind: 'text',
      content: 'Race day',
      style: textStyle,
      transform: center,
      opacity: 1,
    };
    for (const mode of ['activity', 'summary'] as const) {
      expect(isLayerAllowed(mode, text)).toBe(true);
    }
  });

  it('matches info fields to the mode', () => {
    expect(isLayerAllowed('activity', info('activityDate'))).toBe(true);
    expect(isLayerAllowed('activity', info('periodName'))).toBe(false);
    expect(isLayerAllowed('summary', info('periodName'))).toBe(true);
    expect(isLayerAllowed('summary', info('activityName'))).toBe(false);
  });
});
