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

  it('reads a pace notation, optional so older templates still read', () => {
    const pace = { ...distance, metric: 'pace', paceNotation: 'marks' };
    expect(parseTemplate({ ...activityTemplate, layers: [pace] }).layers[0]).toMatchObject({
      paceNotation: 'marks',
    });
    expect(parseTemplate({ ...activityTemplate, layers: [distance] }).layers[0]).not.toHaveProperty(
      'paceNotation',
    );
    expect(() =>
      parseTemplate({ ...activityTemplate, layers: [{ ...pace, paceNotation: 'quotes' }] }),
    ).toThrow(/paceNotation/);
  });

  it('reads a time notation, optional so older templates still read', () => {
    const time = { ...distance, metric: 'movingTime', timeNotation: 'units' };
    expect(parseTemplate({ ...activityTemplate, layers: [time] }).layers[0]).toMatchObject({
      timeNotation: 'units',
    });
    expect(() =>
      parseTemplate({ ...activityTemplate, layers: [{ ...time, timeNotation: 'words' }] }),
    ).toThrow(/timeNotation/);
  });

  it('reads rounded data saved before as they were recorded: times in units, all decimals', () => {
    const rounded = { ...distance, metric: 'movingTime', timeNotation: 'rounded' };
    expect(parseTemplate({ ...activityTemplate, layers: [rounded] }).layers[0]).toMatchObject({
      timeNotation: 'units',
    });
    const short = parseTemplate({ ...activityTemplate, layers: [{ ...distance, decimals: 0 }] });
    expect(short.layers[0]).not.toHaveProperty('decimals');
  });

  it("reads the activity's place and its format, only in activity templates", () => {
    const place = {
      id: 'place',
      kind: 'info',
      field: 'activityPlace',
      placeFormat: 'cityCountry',
      style: textStyle,
      transform: center,
      opacity: 1,
    };
    expect(parseTemplate({ ...activityTemplate, layers: [place] }).layers[0]).toMatchObject({
      placeFormat: 'cityCountry',
    });
    expect(() =>
      parseTemplate({ ...activityTemplate, mode: 'summary', layers: [place] }),
    ).toThrow();
    expect(() =>
      parseTemplate({ ...activityTemplate, layers: [{ ...place, placeFormat: 'street' }] }),
    ).toThrow(/placeFormat/);
  });

  it('reads a date format, optional so older templates still read', () => {
    const date = {
      id: 'date',
      kind: 'info',
      field: 'activityDate',
      dateFormat: 'weekday',
      style: textStyle,
      transform: center,
      opacity: 1,
    };
    expect(parseTemplate({ ...activityTemplate, layers: [date] }).layers[0]).toMatchObject({
      dateFormat: 'weekday',
    });
    expect(() =>
      parseTemplate({ ...activityTemplate, layers: [{ ...date, dateFormat: 'iso' }] }),
    ).toThrow(/dateFormat/);
  });

  it('reads the newer style options, all optional, and rejects unknown values', () => {
    const styled = {
      ...distance,
      style: { ...textStyle, backdrop: 'soft', letterSpacing: 'wide' },
    };
    const lined = {
      ...route,
      stroke: { ...route.stroke, line: 'dotted', glow: true },
    };
    expect(parseTemplate({ ...activityTemplate, layers: [styled, lined] }).layers).toMatchObject([
      styled,
      lined,
    ]);
    for (const broken of [
      { ...styled, style: { ...textStyle, backdrop: 'neon' } },
      { ...lined, stroke: { ...route.stroke, line: 'wavy' } },
    ]) {
      expect(() => parseTemplate({ ...activityTemplate, layers: [broken] })).toThrow();
    }
  });

  it('still reads routes saved with start and end marks, dropping them', () => {
    const [read] = parseTemplate({
      ...activityTemplate,
      layers: [{ ...route, endpoints: true }],
    }).layers;
    expect(read).toEqual(route);
  });

  it('still reads designs with retired mixed widgets, without them', () => {
    const block = (design: string) => ({
      id: design,
      kind: 'activityBlock',
      block: { design, layout: 'stacked' },
      logo: true,
      style: { font: 'inter', color: '#FFFFFF', bold: true, uppercase: true },
      transform: center,
      opacity: 1,
    });
    const read = parseTemplate({
      ...activityTemplate,
      layers: [route, block('headline'), { ...block('serif'), block: { design: 'serif' } }],
    });
    expect(read.layers).toEqual([route]);
    expect(() => parseTemplate({ ...activityTemplate, layers: [route, block('unknown')] })).toThrow(
      /design/,
    );
  });

  it('takes activity charts in activity templates only', () => {
    const chart = {
      id: 'chart',
      kind: 'activityChart',
      series: 'splits',
      color: '#FFFFFF',
      axisLabels: true,
      title: true,
      font: 'inter',
      bold: true,
      uppercase: true,
      align: 'center',
      transform: center,
      opacity: 1,
    };
    expect(parseTemplate({ ...activityTemplate, layers: [chart] }).layers[0]).toMatchObject({
      series: 'splits',
    });
    expect(() => parseTemplate({ ...activityTemplate, mode: 'summary', layers: [chart] })).toThrow(
      /activityChart.*not allowed in summary/,
    );
    expect(() =>
      parseTemplate({ ...activityTemplate, layers: [{ ...chart, series: 'cadence' }] }),
    ).toThrow(/series/);
    const rows = { ...chart, splitElevation: true, maxLabel: true };
    const read = parseTemplate({ ...activityTemplate, layers: [rows] }).layers[0];
    expect(read).toMatchObject({ splitElevation: true });
    // Charts saved with a title, end labels or their peak marked read with a header instead.
    expect(read).not.toHaveProperty('title');
    expect(read).not.toHaveProperty('axisLabels');
    expect(read).not.toHaveProperty('maxLabel');
    expect(() =>
      parseTemplate({ ...activityTemplate, layers: [{ ...chart, zones: 'bars' }] }),
    ).toThrow(/zones/);
    // Splits saved while they could be columns read as rows.
    const columns = parseTemplate({
      ...activityTemplate,
      layers: [{ ...rows, orientation: 'columns' }],
    }).layers[0];
    expect(columns).not.toHaveProperty('orientation');
  });

  it('reads designs saved in a retired font with the closest one left, and rejects unknown fonts', () => {
    const read = (font: string) =>
      parseTemplate({
        ...activityTemplate,
        layers: [{ ...distance, style: { ...textStyle, font } }],
      }).layers[0];
    expect(read('archivoBlack')).toMatchObject({ style: { font: 'unbounded' } });
    expect(read('delaGothicOne')).toMatchObject({ style: { font: 'unbounded' } });
    expect(read('fredoka')).toMatchObject({ style: { font: 'inter' } });
    expect(read('dancingScript')).toMatchObject({ style: { font: 'playfairDisplay' } });
    expect(() => read('comicSans')).toThrow(/font/);
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
    const template = parseTemplate({
      ...activityTemplate,
      mode: 'summary',
      layers: [{ ...chart, title: true }],
    });
    // The title it had gives way to the header, shown when absent.
    expect(template.layers[0]).not.toHaveProperty('title');
    expect(template.layers[0]).not.toHaveProperty('header');
    expect(template.layers[0]).toMatchObject({
      bucket: 'auto',
      axisLabels: false,
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
