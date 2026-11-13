/**
 * The map's style (ADR 021, the owner's "apagado"): which features of OpenFreeMap's vector tiles
 * (OpenMapTiles schema, https://openmaptiles.org/schema/) are drawn, in what color, how wide and
 * in what order. A dark, quiet background for the route: streets and paths in grays by their
 * class, railways darker and thin; the ground barely tinted (parks, lawns, sports grounds and woods
 * green, beaches warm, rock and ice gray, farmland almost not at all); water in a barely blue
 * gray. No labels, no buildings, no points of interest, nothing underground, and no protected
 * areas (the `park` layer: national parks and reserves by their legal bounds, which aren't seen
 * on the ground and covered whole mountains in one green; city parks come as lawns, `landcover`
 * grass; the owner's choice, 2026-11-13).
 */

/** Geometry of a tile's feature, as the vector tile format numbers them: 1, 2 and 3. */
export type MapGeometry = 'point' | 'line' | 'polygon';

/** How a feature is drawn: a filled area or a line of `width` pixels (see below), round ends. */
export type MapPaint =
  | { readonly kind: 'fill'; readonly color: string; readonly order: number }
  | {
      readonly kind: 'line';
      readonly color: string;
      readonly order: number;
      readonly width: number;
    };

/**
 * Width of the drawing that line widths are given for: a line of width w is w · drawing width /
 * 1,080 pixels wide, so a thumbnail and its exported image look alike.
 */
export const MAP_REFERENCE_WIDTH = 1080;

/** The map's colors: the prototype the owner chose, and the ground's tints next to them. */
export const MAP_COLORS = {
  background: '#1C1C1E',
  farmland: '#1E1F1D',
  park: '#202421',
  wood: '#1F2320',
  wetland: '#1D2221',
  sand: '#25231F',
  rock: '#232326',
  ice: '#21252B',
  water: '#171C22',
  rail: '#28282C',
  road: '#34343A',
  path: '#2A2A2E',
} as const;

/** Streets, thinnest first: the drawing order, one over another where they cross. */
const STREETS: readonly { readonly classes: readonly string[]; readonly width: number }[] = [
  // Piers are walked and run on: drawn as paths.
  { classes: ['path', 'track', 'pier'], width: 1 },
  { classes: ['service', 'busway'], width: 1.2 },
  { classes: ['minor'], width: 2 },
  { classes: ['tertiary'], width: 2.6 },
  { classes: ['secondary'], width: 3.2 },
  { classes: ['primary'], width: 4 },
  { classes: ['trunk'], width: 4.5 },
  { classes: ['motorway'], width: 5 },
];

const WATERWAYS: Readonly<Record<string, number>> = {
  river: 2.4,
  canal: 2,
  stream: 1,
  drain: 0.8,
  ditch: 0.8,
};

/** Railways and trams above ground (the metro runs in tunnels, which aren't drawn). */
const RAILWAYS: readonly string[] = ['rail', 'transit'];
const RAILWAY_WIDTH = 1.4;

/** The ground of `landcover`, by class: tinted, barely. Grass holds the city parks' lawns. */
const LANDCOVER: Readonly<Record<string, string>> = {
  farmland: MAP_COLORS.farmland,
  grass: MAP_COLORS.park,
  wood: MAP_COLORS.wood,
  wetland: MAP_COLORS.wetland,
  sand: MAP_COLORS.sand,
  rock: MAP_COLORS.rock,
  ice: MAP_COLORS.ice,
};

/** The green places of `landuse`: sports grounds, athletics tracks, cemeteries, recreation. */
const GREEN_LANDUSE: readonly string[] = [
  'pitch',
  'stadium',
  'track',
  'cemetery',
  'recreation_ground',
];

/** Squares and other walkable areas of `transportation`, drawn as paths are. */
const WALKABLE_AREAS: readonly string[] = ['pedestrian', 'footway'];

/** Drawing order of each kind, bottom to top; streets take one step each from `street`. */
const ORDER = {
  farmland: 0,
  ground: 1,
  water: 2,
  waterway: 3,
  walkable: 4,
  railway: 5,
  street: 6,
} as const;

function polygonPaint(layer: string, kind: unknown, subclass: unknown): MapPaint | null {
  if (typeof kind !== 'string') {
    return layer === 'water' ? { kind: 'fill', color: MAP_COLORS.water, order: ORDER.water } : null;
  }
  switch (layer) {
    case 'landcover': {
      const color = LANDCOVER[kind];
      if (color === undefined) {
        return null;
      }
      return {
        kind: 'fill',
        color,
        order: kind === 'farmland' ? ORDER.farmland : ORDER.ground,
      };
    }
    case 'landuse':
      return GREEN_LANDUSE.includes(kind)
        ? { kind: 'fill', color: MAP_COLORS.park, order: ORDER.ground }
        : null;
    case 'water':
      return { kind: 'fill', color: MAP_COLORS.water, order: ORDER.water };
    case 'transportation':
      return kind === 'pier' ||
        (kind === 'path' && typeof subclass === 'string' && WALKABLE_AREAS.includes(subclass))
        ? { kind: 'fill', color: MAP_COLORS.path, order: ORDER.walkable }
        : null;
    default:
      return null;
  }
}

/**
 * How a feature of the tiles is drawn, or null if the map leaves it out. `layer` is the tile's
 * layer (`transportation`, `water`…) and `properties` the feature's (`class`, `subclass`,
 * `brunnel`…). Paints are drawn by increasing `order`; within one, in the tiles' order. Time and
 * space O(1).
 */
export function paintFor(
  layer: string,
  properties: Readonly<Record<string, unknown>>,
  geometry: MapGeometry,
): MapPaint | null {
  const kind = properties.class;
  if (properties.brunnel === 'tunnel') {
    return null;
  }
  if (geometry === 'polygon') {
    return polygonPaint(layer, kind, properties.subclass);
  }
  if (geometry !== 'line' || typeof kind !== 'string') {
    return null;
  }
  if (layer === 'waterway') {
    const width = WATERWAYS[kind];
    // The water's color: a river's or a channel's middle line vanishes into its own area,
    // and a stream without one still shows.
    return width === undefined
      ? null
      : { kind: 'line', color: MAP_COLORS.water, order: ORDER.waterway, width };
  }
  if (layer === 'transportation') {
    if (RAILWAYS.includes(kind)) {
      return { kind: 'line', color: MAP_COLORS.rail, order: ORDER.railway, width: RAILWAY_WIDTH };
    }
    const rank = STREETS.findIndex((street) => street.classes.includes(kind));
    if (rank === -1) {
      return null;
    }
    return {
      kind: 'line',
      color: rank === 0 ? MAP_COLORS.path : MAP_COLORS.road,
      order: ORDER.street + rank,
      width: STREETS[rank].width,
    };
  }
  return null;
}

/** The tile layers {@link paintFor} draws something of: the rest needn't be read. */
export const MAP_LAYERS: readonly string[] = [
  'landcover',
  'landuse',
  'water',
  'waterway',
  'transportation',
];
