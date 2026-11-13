import { encodeTestTile } from '@/test-utils/vector-tile';

import { decodeMapTile } from './map-tile-decode';
import { MAP_COLORS, paintFor } from './map-style';

const square = (x: number, y: number, size: number): [number, number][] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];

describe('decodeMapTile', () => {
  it('reads the drawn layers into groups by paint, bottom to top', () => {
    const bytes = encodeTestTile([
      {
        name: 'transportation',
        features: [
          {
            type: 2,
            properties: { class: 'motorway' },
            rings: [
              [
                [0, 0],
                [100, 50],
              ],
            ],
          },
          {
            type: 2,
            properties: { class: 'path' },
            rings: [
              [
                [10, 10],
                [20, 30],
                [40, 30],
              ],
            ],
          },
        ],
      },
      {
        name: 'water',
        features: [{ type: 3, properties: { class: 'lake' }, rings: [square(0, 0, 64)] }],
      },
    ]);
    const tile = decodeMapTile(bytes);
    expect(tile.extent).toBe(4096);
    expect(tile.groups.map((group) => group.paint)).toEqual([
      paintFor('water', { class: 'lake' }, 'polygon'),
      paintFor('transportation', { class: 'path' }, 'line'),
      paintFor('transportation', { class: 'motorway' }, 'line'),
    ]);
    expect(tile.groups[0].rings).toEqual([[0, 0, 64, 0, 64, 64, 0, 64, 0, 0]]);
    expect(tile.groups[1].rings).toEqual([[10, 10, 20, 30, 40, 30]]);
    expect(tile.groups[2].rings).toEqual([[0, 0, 100, 50]]);
  });

  it('gathers the features of one paint, in the tile order, and keeps holes as rings', () => {
    const outer = square(0, 0, 100);
    // A hole runs the other way round.
    const hole = [...square(25, 25, 50)].reverse();
    const bytes = encodeTestTile([
      {
        name: 'park',
        features: [
          { type: 3, properties: { class: 'park' }, rings: [outer, hole] },
          { type: 3, properties: { class: 'nature_reserve' }, rings: [square(200, 200, 10)] },
        ],
      },
    ]);
    const [group] = decodeMapTile(bytes).groups;
    expect(group.paint).toEqual({ kind: 'fill', color: MAP_COLORS.park, order: 1 });
    expect(group.rings).toHaveLength(3);
    expect(group.rings[1]).toEqual([25, 25, 25, 75, 75, 75, 75, 25, 25, 25]);
    expect(group.rings[2].slice(0, 2)).toEqual([200, 200]);
  });

  it('keeps wood and lawns apart: one order, two colors', () => {
    const bytes = encodeTestTile([
      {
        name: 'landcover',
        features: [
          { type: 3, properties: { class: 'wood' }, rings: [square(0, 0, 10)] },
          { type: 3, properties: { class: 'grass' }, rings: [square(20, 0, 10)] },
          { type: 3, properties: { class: 'wood' }, rings: [square(40, 0, 10)] },
        ],
      },
    ]);
    const groups = decodeMapTile(bytes).groups;
    expect(groups.map((group) => [group.paint.color, group.rings.length])).toEqual([
      [MAP_COLORS.wood, 2],
      [MAP_COLORS.park, 1],
    ]);
  });

  it('leaves out other layers, points, and what the style leaves out', () => {
    const bytes = encodeTestTile([
      { name: 'poi', features: [{ type: 1, properties: { class: 'cafe' }, rings: [[[5, 5]]] }] },
      {
        name: 'building',
        features: [{ type: 3, rings: [square(0, 0, 10)] }],
      },
      {
        name: 'transportation',
        features: [
          {
            type: 2,
            properties: { class: 'rail' },
            rings: [
              [
                [0, 0],
                [9, 9],
              ],
            ],
          },
          { type: 1, properties: { class: 'minor' }, rings: [[[1, 1]]] },
          {
            type: 2,
            properties: { class: 'primary', brunnel: 'tunnel' },
            rings: [
              [
                [0, 0],
                [9, 9],
              ],
            ],
          },
        ],
      },
    ]);
    expect(decodeMapTile(bytes)).toEqual({ extent: 4096, groups: [] });
  });

  it("takes the layers' extent", () => {
    const bytes = encodeTestTile([
      {
        name: 'water',
        extent: 512,
        features: [{ type: 3, properties: { class: 'ocean' }, rings: [square(0, 0, 512)] }],
      },
    ]);
    expect(decodeMapTile(bytes).extent).toBe(512);
  });

  it('refuses layers of different extents', () => {
    const lake = { type: 3 as const, properties: { class: 'lake' }, rings: [square(0, 0, 8)] };
    const bytes = encodeTestTile([
      { name: 'water', extent: 4096, features: [lake] },
      { name: 'park', extent: 512, features: [lake] },
    ]);
    expect(() => decodeMapTile(bytes)).toThrow(/different extents/);
  });

  it('reads an empty tile, and refuses bytes that are not a tile', () => {
    expect(decodeMapTile(new Uint8Array(0))).toEqual({ extent: 4096, groups: [] });
    expect(() => decodeMapTile(new Uint8Array([0x1a, 0xff, 0xff, 0xff, 0x0f]))).toThrow();
  });
});
