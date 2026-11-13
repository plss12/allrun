import type { KeptTile } from '@/core/map-tile-source';
import { encodeTestTile } from '@/test-utils/vector-tile';

import { createMapTileLoader, type MapTileStore } from './map-tile-loader';

const INDEX = 'https://tiles.test/planet';
const TEMPLATE = 'https://tiles.test/planet/v1/{z}/{x}/{y}.pbf';

/** A tile with one lake, `size` tile units wide, so tiles of different sizes weigh differently. */
const lakeTile = (size: number) =>
  encodeTestTile([
    {
      name: 'water',
      features: [
        {
          type: 3,
          properties: { class: 'lake' },
          rings: [
            [
              [0, 0],
              [size, 0],
              [size, size],
              [0, size],
              [0, 0],
            ],
          ],
        },
      ],
    },
  ]);

function memoryStore(initial: Record<string, { bytes: Uint8Array; keptAt: number }> = {}) {
  const files = new Map(Object.entries(initial));
  const store: MapTileStore = {
    read: jest.fn(async (key: string) => files.get(key)?.bytes ?? null),
    write: jest.fn(async (key: string, bytes: Uint8Array) => {
      files.set(key, { bytes, keptAt: clock });
    }),
    remove: jest.fn(async (key: string) => {
      files.delete(key);
    }),
    list: jest.fn(async (): Promise<KeptTile[]> =>
      [...files].map(([key, file]) => ({ key, bytes: file.bytes.length, keptAt: file.keptAt })),
    ),
  };
  return { store, files };
}

let clock = 1000;

function setup({
  initial,
  limitBytes = 1_000_000,
  index = { tiles: [TEMPLATE] },
}: {
  initial?: Record<string, { bytes: Uint8Array; keptAt: number }>;
  limitBytes?: number;
  index?: unknown;
} = {}) {
  const { store, files } = memoryStore(initial);
  const fetchJson = jest.fn(async (url: string) => {
    expect(url).toBe(INDEX);
    return index;
  });
  const fetchBytes = jest.fn(async (url: string) => {
    const match = /\/(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(url);
    if (match === null) {
      throw new Error(`Unexpected address ${url}`);
    }
    return lakeTile(10 + Number(match[2]));
  });
  const loader = createMapTileLoader({
    indexUrl: INDEX,
    store,
    fetchJson,
    fetchBytes,
    limitBytes,
    now: () => clock,
  });
  return { loader, store, files, fetchJson, fetchBytes };
}

beforeEach(() => {
  clock = 1000;
});

describe('createMapTileLoader', () => {
  it('fetches a tile the phone lacks from the index address, keeps it and decodes it', async () => {
    const { loader, files, fetchBytes } = setup();
    const tile = await loader.load({ z: 14, x: 3, y: 7 });
    expect(fetchBytes).toHaveBeenCalledWith('https://tiles.test/planet/v1/14/3/7.pbf');
    expect(files.get('14-3-7')?.bytes).toEqual(lakeTile(13));
    expect(tile.groups).toHaveLength(1);
    expect(tile.groups[0].rings[0].slice(0, 4)).toEqual([0, 0, 13, 0]);
  });

  it('reads a kept tile without asking the server', async () => {
    const { loader, fetchJson, fetchBytes } = setup({
      initial: { '14-3-7': { bytes: lakeTile(99), keptAt: 1 } },
    });
    const tile = await loader.load({ z: 14, x: 3, y: 7 });
    expect(tile.groups[0].rings[0].slice(0, 4)).toEqual([0, 0, 99, 0]);
    expect(fetchJson).not.toHaveBeenCalled();
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('reads the index once for every tile', async () => {
    const { loader, fetchJson, fetchBytes } = setup();
    await Promise.all([loader.load({ z: 14, x: 1, y: 1 }), loader.load({ z: 14, x: 2, y: 1 })]);
    await loader.load({ z: 14, x: 3, y: 1 });
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchBytes).toHaveBeenCalledTimes(3);
  });

  it('loads the same tile asked for twice at once only once, and again once it is done', async () => {
    const { loader, store, fetchBytes } = setup();
    const [a, b] = await Promise.all([
      loader.load({ z: 13, x: 5, y: 5 }),
      loader.load({ z: 13, x: 5, y: 5 }),
    ]);
    expect(a).toBe(b);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    await loader.load({ z: 13, x: 5, y: 5 });
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(store.read).toHaveBeenCalledTimes(2);
  });

  it('deletes the oldest tiles past the limit, the new one kept', async () => {
    const old = lakeTile(1);
    const { loader, files, store } = setup({
      initial: {
        'old-1': { bytes: old, keptAt: 10 },
        'old-2': { bytes: old, keptAt: 20 },
      },
      // Room for two tiles of about the same size, not three.
      limitBytes: old.length * 2 + 4,
    });
    clock = 5000;
    await loader.load({ z: 14, x: 0, y: 0 });
    expect([...files.keys()].sort()).toEqual(['14-0-0', 'old-2']);
    expect(store.list).toHaveBeenCalledTimes(1);
    clock = 6000;
    await loader.load({ z: 14, x: 1, y: 0 });
    expect([...files.keys()].sort()).toEqual(['14-0-0', '14-1-0']);
    expect(store.list).toHaveBeenCalledTimes(1);
  });

  it('deletes a kept tile that does not decode, so the next load fetches it', async () => {
    const broken = new Uint8Array([0x1a, 0xff, 0xff, 0xff, 0x0f]);
    const { loader, files, fetchBytes } = setup({
      initial: { '14-3-7': { bytes: broken, keptAt: 1 } },
    });
    await expect(loader.load({ z: 14, x: 3, y: 7 })).rejects.toThrow(/14-3-7 didn't decode/);
    expect(files.has('14-3-7')).toBe(false);
    await loader.load({ z: 14, x: 3, y: 7 });
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(files.has('14-3-7')).toBe(true);
  });

  it("doesn't keep what the server sends that isn't a tile", async () => {
    const { loader, files, fetchBytes } = setup();
    fetchBytes.mockResolvedValueOnce(new Uint8Array([0x1a, 0xff, 0xff, 0xff, 0x0f]));
    await expect(loader.load({ z: 14, x: 3, y: 7 })).rejects.toThrow();
    expect(files.size).toBe(0);
  });

  it('asks for the index again after it failed', async () => {
    const { loader, fetchJson } = setup();
    fetchJson.mockRejectedValueOnce(new Error('offline'));
    await expect(loader.load({ z: 14, x: 3, y: 7 })).rejects.toThrow('offline');
    await loader.load({ z: 14, x: 3, y: 7 });
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("asks for a tile again after its request failed, and refuses an index it can't use", async () => {
    const { loader, fetchBytes } = setup();
    fetchBytes.mockRejectedValueOnce(new Error('Map request failed with 503'));
    await expect(loader.load({ z: 14, x: 3, y: 7 })).rejects.toThrow('503');
    await loader.load({ z: 14, x: 3, y: 7 });
    expect(fetchBytes).toHaveBeenCalledTimes(2);

    const broken = setup({ index: { tiles: [] } });
    await expect(broken.loader.load({ z: 14, x: 3, y: 7 })).rejects.toThrow();
    expect(broken.fetchBytes).not.toHaveBeenCalled();
  });
});
