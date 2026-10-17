import {
  hitTestLayers,
  type LayerBox,
  type LayerTransform,
  MAX_LAYER_SCALE,
  MIN_LAYER_SCALE,
  rotateLayer,
  scaleLayer,
  snapLayer,
  translateLayer,
} from './layer-transform';

const story = { width: 1080, height: 1920 };
const centered: LayerTransform = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };
const thresholds = { distance: 10, rotation: 0.05 };
/** A 200 × 100 layer. */
const size = { width: 200, height: 100 };

describe('translateLayer', () => {
  it('moves by canvas pixels', () => {
    const moved = translateLayer(centered, story, 108, -192);
    expect(moved.x).toBeCloseTo(0.6);
    expect(moved.y).toBeCloseTo(0.4);
  });

  it('keeps the center on the canvas', () => {
    const moved = translateLayer(centered, story, -5000, 5000);
    expect(moved.x).toBe(0);
    expect(moved.y).toBe(1);
  });
});

describe('scaleLayer', () => {
  it('scales within the schema limits', () => {
    expect(scaleLayer(centered, 2).scale).toBe(2);
    expect(scaleLayer(centered, 0.001).scale).toBe(MIN_LAYER_SCALE);
    expect(scaleLayer(centered, 1000).scale).toBe(MAX_LAYER_SCALE);
  });

  it('ignores factors that are not positive', () => {
    expect(scaleLayer(centered, 0)).toBe(centered);
    expect(scaleLayer(centered, NaN)).toBe(centered);
  });
});

describe('rotateLayer', () => {
  it('adds the rotation and keeps it in (-π, π]', () => {
    expect(rotateLayer(centered, 0.3).rotation).toBeCloseTo(0.3);
    expect(rotateLayer({ ...centered, rotation: 3 }, 1).rotation).toBeCloseTo(4 - 2 * Math.PI);
  });
});

describe('snapLayer', () => {
  const at = (x: number, y: number, extra: Partial<LayerTransform> = {}) =>
    snapLayer({ ...centered, x: x / 1080, y: y / 1920, ...extra }, size, story, thresholds, 0);

  it('snaps to the center lines within the threshold', () => {
    const result = at(545, 600);
    expect(result.transform.x).toBe(0.5);
    expect(result.transform.y).toBeCloseTo(600 / 1920);
    expect(result.x).toBe('center');
    expect(result.y).toBe('none');
  });

  it('snaps the edges of the layer to the canvas edges', () => {
    // Half the layer is 100 px wide and 50 px tall.
    const topLeft = at(106, 45);
    expect(topLeft.transform.x * 1080).toBeCloseTo(100);
    expect(topLeft.transform.y * 1920).toBeCloseTo(50);
    expect([topLeft.x, topLeft.y]).toEqual(['start', 'start']);
    const bottomRight = at(1080 - 95, 1920 - 58);
    expect(bottomRight.transform.x * 1080).toBeCloseTo(980);
    expect(bottomRight.transform.y * 1920).toBeCloseTo(1870);
    expect([bottomRight.x, bottomRight.y]).toEqual(['end', 'end']);
  });

  it('keeps the margin as air between the layer and the edge', () => {
    // Scaled ×2 the half-width is 200 px; with a 24 px margin the layer snaps 224 px from the
    // edge, so its content starts 24 px in.
    const near = snapLayer({ ...centered, x: 230 / 1080, scale: 2 }, size, story, thresholds, 24);
    expect(near.transform.x * 1080).toBeCloseTo(224);
    expect(near.x).toBe('start');
    const bottom = snapLayer({ ...centered, y: 1840 / 1920 }, size, story, thresholds, 24);
    // Half-height 50 px plus the margin: 74 px from the bottom.
    expect(bottom.transform.y * 1920).toBeCloseTo(1920 - 74);
    expect(bottom.y).toBe('end');
  });

  it('keeps the margin around the rotated content, as the rounded frame does', () => {
    // Turned 45°, the 200 × 100 content reaches 300·√2/4 ≈ 106 px each way; plus 24 px margin.
    const reach = (300 * Math.SQRT1_2) / 2 + 24;
    const tilted = snapLayer(
      { ...centered, x: (reach + 5) / 1080, rotation: Math.PI / 4 },
      size,
      story,
      thresholds,
      24,
    );
    expect(tilted.transform.x * 1080).toBeCloseTo(reach);
    expect(tilted.x).toBe('start');
  });

  it('lets a layer be pushed past an edge', () => {
    const result = at(60, 900);
    expect(result.x).toBe('none');
    expect(result.transform.x * 1080).toBeCloseTo(60);
  });

  it('measures edges with the scale and the rotated box', () => {
    // Scaled ×2 the half-width is 200 px; turned a quarter it is the 50 px half-height.
    expect(at(205, 900, { scale: 2 }).transform.x * 1080).toBeCloseTo(200);
    const turned = at(55, 900, { rotation: Math.PI / 2 });
    expect(turned.transform.x * 1080).toBeCloseTo(50);
    expect(turned.x).toBe('start');
  });

  it('snaps to straight angles', () => {
    const result = at(300, 600, { rotation: Math.PI / 2 - 0.02 });
    expect(result.transform.rotation).toBeCloseTo(Math.PI / 2);
    expect(result.rotation).toBe(true);
  });

  it('leaves layers outside every threshold alone', () => {
    const result = at(300, 700, { rotation: 0.4 });
    expect(result.transform.x * 1080).toBeCloseTo(300);
    expect(result.transform.y * 1920).toBeCloseTo(700);
    expect(result.transform.rotation).toBeCloseTo(0.4);
    expect([result.x, result.y, result.rotation]).toEqual(['none', 'none', false]);
  });
});

describe('hitTestLayers', () => {
  const box = (id: string, transform: Partial<LayerTransform>, width = 200, height = 100) =>
    ({ id, transform: { ...centered, ...transform }, width, height }) satisfies LayerBox;

  it('finds the layer under the point', () => {
    const boxes = [box('a', { x: 0.25 }), box('b', { x: 0.75 })];
    expect(hitTestLayers(boxes, { x: 270, y: 960 }, story, 0)).toBe('a');
    expect(hitTestLayers(boxes, { x: 810, y: 1000 }, story, 0)).toBe('b');
    expect(hitTestLayers(boxes, { x: 540, y: 960 }, story, 0)).toBeNull();
  });

  it('picks the topmost of overlapping layers', () => {
    const boxes = [box('bottom', {}), box('top', {})];
    expect(hitTestLayers(boxes, { x: 540, y: 960 }, story, 0)).toBe('top');
  });

  it('follows the scale and rotation of the layer', () => {
    const scaled = [box('a', { scale: 2 })];
    // 180 px right of the center: outside the 200 px box, inside once scaled to 400 px.
    expect(hitTestLayers(scaled, { x: 720, y: 960 }, story, 0)).toBe('a');
    const rotated = [box('a', { rotation: Math.PI / 2 })];
    // Turned a quarter, the 200 × 100 box stands 100 wide and 200 tall.
    expect(hitTestLayers(rotated, { x: 540, y: 1050 }, story, 0)).toBe('a');
    expect(hitTestLayers(rotated, { x: 630, y: 960 }, story, 0)).toBeNull();
  });

  it('gives small layers a minimum touch size', () => {
    const thin = [box('a', {}, 200, 10)];
    expect(hitTestLayers(thin, { x: 540, y: 990 }, story, 0)).toBeNull();
    expect(hitTestLayers(thin, { x: 540, y: 990 }, story, 88)).toBe('a');
  });
});
