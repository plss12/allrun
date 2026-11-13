/**
 * The map's style (ADR 021, the owner's "apagado"): which features of OpenFreeMap's vector tiles
 * (OpenMapTiles schema, https://openmaptiles.org/schema/) are drawn, in what color, how wide and
 * in what order. A dark, quiet background for the route: streets in grays by their class, parks
 * and woods in a barely green gray, water in a barely blue one; no labels, no buildings, no
 * points of interest, nothing underground.
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

/** The map's colors, from the prototype the owner chose. */
export const MAP_COLORS = {
  background: '#1C1C1E',
  park: '#202421',
  wood: '#1F2320',
  water: '#171C22',
  waterway: '#1A2028',
  road: '#34343A',
  path: '#2A2A2E',
} as const;

/** Streets, thinnest first: the drawing order, one over another where they cross. */
const STREETS: readonly { readonly classes: readonly string[]; readonly width: number }[] = [
  { classes: ['path', 'track'], width: 1 },
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

/** Drawing order of each kind, bottom to top; streets take one step each from `street`. */
const ORDER = { landcover: 0, park: 1, water: 2, waterway: 3, street: 4 } as const;

/**
 * How a feature of the tiles is drawn, or null if the map leaves it out. `layer` is the tile's
 * layer (`transportation`, `water`…) and `properties` the feature's (`class`, `brunnel`…).
 * Paints are drawn by increasing `order`; within one, in the tiles' order. Time and space O(1).
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
    switch (layer) {
      case 'landcover':
        // Grass holds the city parks' lawns (subclass park, garden…): park-colored.
        if (kind === 'wood') {
          return { kind: 'fill', color: MAP_COLORS.wood, order: ORDER.landcover };
        }
        return kind === 'grass'
          ? { kind: 'fill', color: MAP_COLORS.park, order: ORDER.landcover }
          : null;
      case 'park':
        return { kind: 'fill', color: MAP_COLORS.park, order: ORDER.park };
      case 'water':
        return { kind: 'fill', color: MAP_COLORS.water, order: ORDER.water };
      default:
        return null;
    }
  }
  if (geometry !== 'line' || typeof kind !== 'string') {
    return null;
  }
  if (layer === 'waterway') {
    const width = WATERWAYS[kind];
    return width === undefined
      ? null
      : { kind: 'line', color: MAP_COLORS.waterway, order: ORDER.waterway, width };
  }
  if (layer === 'transportation') {
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
  'park',
  'water',
  'waterway',
  'transportation',
];
