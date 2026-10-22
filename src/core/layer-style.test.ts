import { makeActivity } from '@/test-utils/make-activity';
import { makeSummary } from '@/test-utils/make-summary';

import { defaultActivityTemplate, defaultSummaryTemplate, newLayer } from './default-layout';
import {
  castsShadow,
  colorPageOf,
  contrastingInk,
  layerColor,
  relativeLuminance,
  setChartOptions,
  setDataLabels,
  setLayerColor,
  setLayerOpacity,
  setAxisLabels,
  setBlockOptions,
  setLogoOptions,
  setStrokeWidth,
  setTextStyle,
  STYLE_COLOR_PAGES,
} from './layer-style';
import { type Layer, parseTemplate, type Template } from './template';
import { addLayer } from './template-edit';

const activity = defaultActivityTemplate(makeActivity(), 'story');
const summary = defaultSummaryTemplate(makeSummary(), 'story');
const find = (template: Template, id: string): Layer => {
  const layer = template.layers.find((candidate) => candidate.id === id);
  if (layer === undefined) {
    throw new Error(`No layer ${id}`);
  }
  return layer;
};

describe('relativeLuminance and castsShadow', () => {
  it('follows the WCAG definition', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1);
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3);
    expect(relativeLuminance('#C94A2E')).toBeCloseTo(0.175, 2);
    // Alpha doesn't change how bright the color is.
    expect(relativeLuminance('#FFFFFF80')).toBeCloseTo(1);
  });

  it('rejects anything that is not a hex color', () => {
    expect(() => relativeLuminance('white')).toThrow(/#RRGGBB/);
  });

  it('shadows light and bright colors but not black, Night Ink or the darkest gray', () => {
    const withoutShadow = STYLE_COLOR_PAGES.flatMap(
      (page): readonly { readonly id: string; readonly hex: string }[] => page.colors,
    )
      .filter((color) => !castsShadow(color.hex))
      .map((color) => color.id);
    expect(new Set(withoutShadow)).toEqual(new Set(['black', 'nightInk', 'gray5']));
  });
});

describe('STYLE_COLOR_PAGES', () => {
  /** Straight-line distance between two colors in sRGB (0..441). */
  const distance = (a: string, b: string) => {
    const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [x, y] = [channels(a), channels(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };

  it('has pages of seven valid colors', () => {
    for (const page of STYLE_COLOR_PAGES) {
      expect(page.colors).toHaveLength(7);
      for (const color of page.colors) {
        expect(() => relativeLuminance(color.hex)).not.toThrow();
      }
    }
  });

  it('never puts two look-alike colors on the same page', () => {
    // White and Chalk, which looked the same side by side, are 27 apart.
    expect(distance('#FFFFFF', '#F6F1EA')).toBeLessThan(40);
    for (const page of STYLE_COLOR_PAGES) {
      page.colors.forEach((a, i) => {
        for (const b of page.colors.slice(i + 1)) {
          expect([a.id, b.id, distance(a.hex, b.hex) >= 40]).toEqual([a.id, b.id, true]);
        }
      });
    }
  });

  it('finds the first page of a color', () => {
    expect(colorPageOf('#ffffff')).toBe(0);
    expect(colorPageOf('#FF6FB5')).toBe(1);
    expect(colorPageOf('#5C5C5C')).toBe(3);
    expect(colorPageOf('#123456')).toBe(0);
    expect(colorPageOf(null)).toBe(0);
  });
});

describe('setLayerColor', () => {
  it('colors text, routes and charts in their own field', () => {
    const red = '#C94A2E';
    expect(find(setLayerColor(activity, 'name', red), 'name')).toMatchObject({
      style: { color: red },
    });
    expect(find(setLayerColor(activity, 'route', red), 'route')).toMatchObject({
      stroke: { color: red },
    });
    expect(find(setLayerColor(summary, 'chart', red), 'chart')).toMatchObject({ color: red });
    expect(layerColor(find(setLayerColor(summary, 'routes', red), 'routes'))).toBe(red);
  });

  it('returns the template itself for the same color or a missing layer', () => {
    expect(setLayerColor(activity, 'name', '#FFFFFF')).toBe(activity);
    expect(setLayerColor(activity, 'missing', '#000000')).toBe(activity);
  });

  it('refuses the logo and invalid colors', () => {
    expect(layerColor(find(activity, 'logo'))).toBeNull();
    expect(() => setLayerColor(activity, 'logo', '#000000')).toThrow(/has no color/);
    expect(() => setLayerColor(activity, 'name', 'red')).toThrow(/#RRGGBB/);
  });
});

describe('setLayerOpacity', () => {
  it('sets the opacity of any layer, within 0..1', () => {
    expect(find(setLayerOpacity(activity, 'logo', 0.5), 'logo').opacity).toBe(0.5);
    expect(setLayerOpacity(activity, 'name', 1)).toBe(activity);
    expect(() => setLayerOpacity(activity, 'name', 1.5)).toThrow(RangeError);
  });
});

describe('setTextStyle and setDataLabels', () => {
  it('changes only the given text properties', () => {
    const edited = setTextStyle(activity, 'name', { font: 'orbitron', uppercase: true });
    expect(find(edited, 'name')).toMatchObject({
      style: { font: 'orbitron', uppercase: true, bold: true, align: 'center' },
    });
    expect(parseTemplate(edited)).toEqual(edited);
    expect(setTextStyle(activity, 'name', { bold: true })).toBe(activity);
    expect(() => setTextStyle(activity, 'route', { bold: true })).toThrow(/has no text style/);
  });

  it('hides the label or the unit of a metric', () => {
    const edited = setDataLabels(activity, 'metric-distance', { showUnit: false });
    expect(find(edited, 'metric-distance')).toMatchObject({ showLabel: true, showUnit: false });
    expect(setDataLabels(activity, 'metric-distance', { showLabel: true })).toBe(activity);
    expect(() => setDataLabels(activity, 'name', { showLabel: false })).toThrow(/data labels/);
  });
});

describe('contrastingInk', () => {
  it('is black on light colors and white on dark ones', () => {
    expect(contrastingInk('#FFFFFF')).toBe('#000000');
    expect(contrastingInk('#F6F1EA')).toBe('#000000');
    expect(contrastingInk('#141B2D')).toBe('#FFFFFF');
    expect(contrastingInk('#C94A2E')).toBe('#FFFFFF');
  });
});

describe('the options of the format tab', () => {
  it('puts a backdrop and letter spacing on texts, none and normal being the defaults', () => {
    const boxed = setTextStyle(activity, 'name', { backdrop: 'solid', letterSpacing: 'wide' });
    expect(find(boxed, 'name')).toMatchObject({
      style: { backdrop: 'solid', letterSpacing: 'wide' },
    });
    expect(setTextStyle(activity, 'name', { backdrop: 'none', letterSpacing: 'normal' })).toBe(
      activity,
    );
  });

  it("styles an activity's chart like a period's", () => {
    const withChart = parseTemplate({
      ...activity,
      layers: [
        ...activity.layers,
        newLayer({ kind: 'activityChart', series: 'elevation' }, 'chart', 'story'),
      ],
    });
    const styled = setChartOptions(withChart, 'chart', { font: 'orbitron', align: 'center' });
    expect(find(styled, 'chart')).toMatchObject({ font: 'orbitron', align: 'center' });
    // Only a period's bars have axis labels.
    expect(() => setAxisLabels(withChart, 'chart', true)).toThrow(/axis labels/);
    expect(find(setLayerColor(styled, 'chart', '#C94A2E'), 'chart')).toMatchObject({
      color: '#C94A2E',
    });
  });
});

describe('setStrokeWidth, setChartOptions and setLogoOptions', () => {
  it('sets the line width of routes', () => {
    expect(find(setStrokeWidth(activity, 'route', 14), 'route')).toMatchObject({
      stroke: { width: 14 },
    });
    expect(setStrokeWidth(activity, 'route', 8)).toBe(activity);
    expect(() => setStrokeWidth(activity, 'route', 0)).toThrow(RangeError);
    expect(() => setStrokeWidth(activity, 'name', 4)).toThrow(/line width/);
  });

  it('sets chart and logo options', () => {
    const chart = setChartOptions(summary, 'chart', {
      font: 'orbitron',
      bold: false,
      uppercase: false,
      align: 'left',
    });
    expect(find(chart, 'chart')).toMatchObject({
      align: 'left',
      font: 'orbitron',
      bold: false,
      uppercase: false,
    });
    expect(parseTemplate(chart)).toEqual(chart);
    expect(setChartOptions(summary, 'chart', { bold: true })).toBe(summary);
    expect(find(setAxisLabels(summary, 'chart', false), 'chart')).toMatchObject({
      axisLabels: false,
    });
    expect(setAxisLabels(summary, 'chart', true)).toBe(summary);
    const logo = setLogoOptions(activity, 'logo', { tone: 'color' });
    expect(find(logo, 'logo')).toMatchObject({ tone: 'color' });
    expect(() => setLogoOptions(activity, 'name', { tone: 'dark' })).toThrow(/logo options/);
  });
});

describe('setBlockOptions', () => {
  const withBlock = addLayer(
    activity,
    newLayer(
      { kind: 'activityBlock', block: { design: 'headline', layout: 'stacked' } },
      'block',
      'story',
    ),
  );

  it("sets a mixed widget's font, weight, case, logo and color", () => {
    const styled = setBlockOptions(withBlock, 'block', {
      font: 'orbitron',
      bold: false,
      uppercase: false,
      logo: true,
    });
    expect(find(styled, 'block')).toMatchObject({
      logo: true,
      style: { font: 'orbitron', bold: false, uppercase: false, color: '#FFFFFF' },
    });
    expect(parseTemplate(styled)).toEqual(styled);
    expect(find(setLayerColor(styled, 'block', '#C94A2E'), 'block')).toMatchObject({
      style: { color: '#C94A2E', font: 'orbitron' },
    });
  });

  it('changes nothing when the options are already set, and only fits mixed widgets', () => {
    expect(setBlockOptions(withBlock, 'block', { bold: true, logo: false })).toBe(withBlock);
    expect(() => setBlockOptions(withBlock, 'name', { logo: true })).toThrow(/block options/);
  });
});
