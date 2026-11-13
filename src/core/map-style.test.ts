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

  it('draws paths, tracks and piers as paths, darker than roads', () => {
    for (const kind of ['path', 'track', 'pier']) {
      expect(line('transportation', { class: kind })).toEqual(
        line('transportation', { class: 'path', subclass: 'footway' }),
      );
    }
    expect(line('transportation', { class: 'path' })?.color).toBe(MAP_COLORS.path);
    expect(line('transportation', { class: 'minor' })?.color).toBe(MAP_COLORS.road);
  });

  it('draws railways and trams thin and darker, under the streets', () => {
    const rail = line('transportation', { class: 'rail', subclass: 'rail' });
    expect(rail).toEqual(line('transportation', { class: 'transit', subclass: 'tram' }));
    expect(rail?.color).toBe(MAP_COLORS.rail);
    expect(width(rail)).toBeLessThan(width(line('transportation', { class: 'minor' })));
    expect(rail?.order).toBeLessThan(line('transportation', { class: 'path' })?.order ?? 0);
  });

  it('leaves out works, ferries, cable cars and anything underground', () => {
    for (const kind of ['minor_construction', 'path_construction', 'ferry', 'aerialway']) {
      expect(line('transportation', { class: kind })).toBeNull();
    }
    expect(line('transportation', { class: 'motorway', brunnel: 'tunnel' })).toBeNull();
    expect(line('transportation', { class: 'transit', brunnel: 'tunnel' })).toBeNull();
    expect(line('waterway', { class: 'stream', brunnel: 'tunnel' })).toBeNull();
  });

  it('keeps bridges, but not their decks as areas', () => {
    expect(line('transportation', { class: 'primary', brunnel: 'bridge' })).toEqual(
      line('transportation', { class: 'primary' }),
    );
    expect(fill('transportation', { class: 'bridge', brunnel: 'bridge' })).toBeNull();
  });

  it('fills squares and piers as paths, but not platforms', () => {
    const walkable = { kind: 'fill', color: MAP_COLORS.path, order: expect.any(Number) };
    expect(fill('transportation', { class: 'path', subclass: 'pedestrian' })).toEqual(walkable);
    expect(fill('transportation', { class: 'path', subclass: 'footway' })).toEqual(walkable);
    expect(fill('transportation', { class: 'pier' })).toEqual(walkable);
    expect(fill('transportation', { class: 'path', subclass: 'platform' })).toBeNull();
    expect(fill('transportation', { class: 'path' })).toBeNull();
  });

  it('tints the ground by what covers it', () => {
    expect(fill('landcover', { class: 'grass', subclass: 'park' })?.color).toBe(MAP_COLORS.park);
    expect(fill('landcover', { class: 'wood', subclass: 'forest' })?.color).toBe(MAP_COLORS.wood);
    expect(fill('landcover', { class: 'sand', subclass: 'beach' })?.color).toBe(MAP_COLORS.sand);
    expect(fill('landcover', { class: 'rock', subclass: 'scree' })?.color).toBe(MAP_COLORS.rock);
    expect(fill('landcover', { class: 'ice', subclass: 'glacier' })?.color).toBe(MAP_COLORS.ice);
    expect(fill('landcover', { class: 'wetland' })?.color).toBe(MAP_COLORS.wetland);
    expect(fill('landcover', { class: 'farmland' })?.color).toBe(MAP_COLORS.farmland);
  });

  it('draws farmland under everything else, as it can cover a whole card', () => {
    const farmland = fill('landcover', { class: 'farmland' })?.order ?? Number.NaN;
    expect(farmland).toBeLessThan(fill('landcover', { class: 'wood' })?.order ?? Number.NaN);
  });

  it('fills sports grounds, tracks, cemeteries and recreation grounds as parks', () => {
    for (const kind of ['pitch', 'stadium', 'track', 'cemetery', 'recreation_ground']) {
      expect(fill('landuse', { class: kind })).toEqual(fill('landcover', { class: 'grass' }));
    }
    for (const kind of ['residential', 'industrial', 'school', 'hospital', 'military', 'zoo']) {
      expect(fill('landuse', { class: kind })).toBeNull();
    }
  });

  it('leaves out protected areas: their bounds are not seen on the ground', () => {
    for (const kind of ['national_park', 'protected_area', 'nature_reserve', 'historic']) {
      expect(fill('park', { class: kind })).toBeNull();
    }
  });

  it('fills every water area, the sea and pools too, in a blue gray', () => {
    for (const kind of ['ocean', 'lake', 'river', 'pond', 'swimming_pool', undefined]) {
      expect(fill('water', { class: kind })).toEqual({
        kind: 'fill',
        color: MAP_COLORS.water,
        order: expect.any(Number),
      });
    }
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
    expect(paintFor('poi', { class: 'drinking_water' }, 'point')).toBeNull();
    expect(paintFor('place', { class: 'city' }, 'point')).toBeNull();
    expect(line('transportation_name', { class: 'primary' })).toBeNull();
    expect(line('boundary', { admin_level: 2 })).toBeNull();
    expect(fill('aeroway', { class: 'helipad' })).toBeNull();
  });

  it('stacks the ground, then water, waterways, squares, railways and streets', () => {
    const order = [
      fill('landcover', { class: 'farmland' }),
      fill('landcover', { class: 'wood' }),
      fill('water', { class: 'river' }),
      line('waterway', { class: 'river' }),
      fill('transportation', { class: 'path', subclass: 'pedestrian' }),
      line('transportation', { class: 'rail' }),
      line('transportation', { class: 'path' }),
    ].map((paint) => paint?.order ?? Number.NaN);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });
});

describe('MAP_LAYERS', () => {
  it('names every layer something is drawn from, and no other', () => {
    const drawn = [
      fill('landcover', { class: 'wood' }),
      fill('landuse', { class: 'pitch' }),
      fill('water', { class: 'lake' }),
      line('waterway', { class: 'river' }),
      line('transportation', { class: 'minor' }),
    ];
    expect(drawn.every((paint) => paint !== null)).toBe(true);
    expect(MAP_LAYERS).toEqual(['landcover', 'landuse', 'water', 'waterway', 'transportation']);
  });
});

describe('waterways', () => {
  it("are the water's color, so a river's middle line vanishes into its area", () => {
    for (const kind of ['river', 'canal', 'stream', 'drain', 'ditch']) {
      expect(line('waterway', { class: kind })?.color).toBe(MAP_COLORS.water);
    }
  });
});
