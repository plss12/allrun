import { MAP_COLORS, MAP_LAYERS, paintFor, type MapPaint } from './map-style';

const line = (layer: string, properties: Record<string, unknown>) =>
  paintFor(layer, properties, 'line');
const fill = (layer: string, properties: Record<string, unknown>) =>
  paintFor(layer, properties, 'polygon');

const width = (paint: MapPaint | null) => (paint?.kind === 'line' ? paint.width : Number.NaN);

describe('paintFor', () => {
  it('draws streets wider and higher the bigger their class', () => {
    const classes = [
      'path',
      'service',
      'minor',
      'tertiary',
      'secondary',
      'primary',
      'trunk',
      'motorway',
    ];
    const paints = classes.map((kind) => line('transportation', { class: kind }));
    for (let i = 1; i < paints.length; i++) {
      expect(width(paints[i])).toBeGreaterThan(width(paints[i - 1]));
      expect(paints[i]?.order).toBeGreaterThan(paints[i - 1]?.order ?? Number.NaN);
    }
    expect(width(paints[0])).toBe(1);
    expect(width(paints.at(-1) ?? null)).toBe(5);
  });

  it('draws paths and tracks darker than roads', () => {
    expect(line('transportation', { class: 'path' })?.color).toBe(MAP_COLORS.path);
    expect(line('transportation', { class: 'track' })?.color).toBe(MAP_COLORS.path);
    expect(line('transportation', { class: 'minor' })?.color).toBe(MAP_COLORS.road);
  });

  it('leaves out railways, works, ferries, squares and anything underground', () => {
    for (const kind of ['rail', 'transit', 'minor_construction', 'ferry', 'aerialway', 'pier']) {
      expect(line('transportation', { class: kind })).toBeNull();
    }
    expect(fill('transportation', { class: 'path' })).toBeNull();
    expect(line('transportation', { class: 'motorway', brunnel: 'tunnel' })).toBeNull();
    expect(line('waterway', { class: 'stream', brunnel: 'tunnel' })).toBeNull();
  });

  it('keeps bridges', () => {
    expect(line('transportation', { class: 'primary', brunnel: 'bridge' })).toEqual(
      line('transportation', { class: 'primary' }),
    );
  });

  it('fills parks, lawns and woods in green grays, water in a blue gray', () => {
    expect(fill('park', { class: 'nature_reserve' })?.color).toBe(MAP_COLORS.park);
    expect(fill('landcover', { class: 'grass', subclass: 'park' })?.color).toBe(MAP_COLORS.park);
    expect(fill('landcover', { class: 'wood' })?.color).toBe(MAP_COLORS.wood);
    expect(fill('water', { class: 'lake' })).toEqual({
      kind: 'fill',
      color: MAP_COLORS.water,
      order: expect.any(Number),
    });
  });

  it('leaves out the rest of the ground: farmland, sand, built-up land', () => {
    expect(fill('landcover', { class: 'farmland' })).toBeNull();
    expect(fill('landcover', { class: 'sand' })).toBeNull();
    expect(fill('landuse', { class: 'residential' })).toBeNull();
  });

  it('draws rivers wider than streams, and no unknown waterway', () => {
    expect(width(line('waterway', { class: 'river' }))).toBeGreaterThan(
      width(line('waterway', { class: 'stream' })),
    );
    expect(line('waterway', { class: 'waterfall' })).toBeNull();
  });

  it('draws no labels, buildings, points of interest or boundaries', () => {
    expect(fill('building', {})).toBeNull();
    expect(paintFor('poi', { class: 'cafe' }, 'point')).toBeNull();
    expect(paintFor('place', { class: 'city' }, 'point')).toBeNull();
    expect(line('transportation_name', { class: 'primary' })).toBeNull();
    expect(line('boundary', { admin_level: 2 })).toBeNull();
  });

  it('stacks the ground, then water, then waterways, then streets', () => {
    const order = [
      fill('landcover', { class: 'wood' }),
      fill('park', { class: 'protected_area' }),
      fill('water', { class: 'river' }),
      line('waterway', { class: 'river' }),
      line('transportation', { class: 'path' }),
    ].map((paint) => paint?.order ?? Number.NaN);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });
});

describe('MAP_LAYERS', () => {
  it('names every layer something is drawn from', () => {
    const drawn = [
      fill('landcover', { class: 'wood' }),
      fill('park', { class: 'park' }),
      fill('water', { class: 'lake' }),
      line('waterway', { class: 'river' }),
      line('transportation', { class: 'minor' }),
    ];
    expect(drawn.every((paint) => paint !== null)).toBe(true);
    expect(MAP_LAYERS).toEqual(['landcover', 'park', 'water', 'waterway', 'transportation']);
  });
});
