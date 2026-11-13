import { parseTileJson, tileKey, tilesToEvict, tileUrl, type KeptTile } from './map-tile-source';

const OPENFREEMAP = {
  tilejson: '3.0.0',
  tiles: ['https://tiles.openfreemap.org/planet/20261101_080013_pt/{z}/{x}/{y}.pbf'],
  maxzoom: 14,
  vector_layers: [{ id: 'water', fields: {} }],
};

describe('parseTileJson', () => {
  it("takes the index's first tile address, with its version", () => {
    expect(parseTileJson(OPENFREEMAP)).toEqual({
      template: 'https://tiles.openfreemap.org/planet/20261101_080013_pt/{z}/{x}/{y}.pbf',
    });
  });

  it('refuses an index without a usable address', () => {
    expect(() => parseTileJson({})).toThrow();
    expect(() => parseTileJson({ tiles: [] })).toThrow();
    expect(() => parseTileJson({ tiles: ['not an address'] })).toThrow();
    expect(() => parseTileJson({ tiles: ['https://tiles.example/{z}/{x}.pbf'] })).toThrow(
      /\{z\}, \{x\} and \{y\}/,
    );
  });
});

describe('tileUrl and tileKey', () => {
  const source = parseTileJson(OPENFREEMAP);

  it("fills the tile's zoom, column and row in", () => {
    expect(tileUrl(source, { z: 14, x: 8022, y: 6176 })).toBe(
      'https://tiles.openfreemap.org/planet/20261101_080013_pt/14/8022/6176.pbf',
    );
  });

  it('keeps a tile under a name without the data version', () => {
    expect(tileKey({ z: 14, x: 8022, y: 6176 })).toBe('14-8022-6176');
    expect(tileKey({ z: 0, x: 0, y: 0 })).toBe('0-0-0');
  });
});

describe('tilesToEvict', () => {
  const tile = (key: string, bytes: number, keptAt: number): KeptTile => ({ key, bytes, keptAt });

  it('deletes nothing while the tiles fit', () => {
    expect(tilesToEvict([tile('a', 40, 1), tile('b', 60, 2)], 100)).toEqual([]);
    expect(tilesToEvict([], 0)).toEqual([]);
  });

  it('deletes the oldest first, only as many as needed', () => {
    const kept = [tile('new', 50, 30), tile('old', 50, 10), tile('mid', 50, 20)];
    expect(tilesToEvict(kept, 100)).toEqual(['old']);
    expect(tilesToEvict(kept, 60)).toEqual(['old', 'mid']);
    expect(tilesToEvict(kept, 0)).toEqual(['old', 'mid', 'new']);
  });

  it('breaks ties by name, whatever order the files are listed in', () => {
    const kept = [tile('b', 10, 5), tile('a', 10, 5), tile('c', 10, 5)];
    expect(tilesToEvict(kept, 15)).toEqual(['a', 'b']);
    expect(tilesToEvict([...kept].reverse(), 15)).toEqual(['a', 'b']);
  });

  it('refuses a negative limit', () => {
    expect(() => tilesToEvict([], -1)).toThrow(RangeError);
    expect(() => tilesToEvict([], Number.NaN)).toThrow(RangeError);
  });
});
