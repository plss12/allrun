import { PbfWriter } from 'pbf';

/**
 * A minimal vector tile encoder for tests (https://github.com/mapbox/vector-tile-spec, version
 * 2): layers of features with string properties and geometry given as rings of points.
 */

/** A feature: 1 point, 2 line, 3 polygon; each ring a list of [x, y] points. */
export interface TestFeature {
  readonly type: 1 | 2 | 3;
  readonly properties?: Readonly<Record<string, string>>;
  readonly rings: readonly (readonly (readonly [number, number])[])[];
}

export interface TestLayer {
  readonly name: string;
  readonly extent?: number;
  readonly features: readonly TestFeature[];
}

const zigzag = (n: number) => (n << 1) ^ (n >> 31);
const command = (id: number, count: number) => (id & 0x7) | (count << 3);

/** The commands of a feature's geometry: MoveTo, LineTo and, for polygons, ClosePath. */
function geometry(feature: TestFeature): number[] {
  const out: number[] = [];
  let x = 0;
  let y = 0;
  const moveTo = ([px, py]: readonly [number, number]) => {
    out.push(zigzag(px - x), zigzag(py - y));
    x = px;
    y = py;
  };
  for (const ring of feature.rings) {
    if (feature.type === 1) {
      out.push(command(1, ring.length));
      ring.forEach(moveTo);
      continue;
    }
    // A polygon's ring closes with ClosePath, without repeating its first point.
    const points = feature.type === 3 ? ring.slice(0, -1) : ring;
    out.push(command(1, 1));
    moveTo(points[0]);
    out.push(command(2, points.length - 1));
    points.slice(1).forEach(moveTo);
    if (feature.type === 3) {
      out.push(command(7, 1));
    }
  }
  return out;
}

function writeLayer(layer: TestLayer, pbf: PbfWriter): void {
  const keys: string[] = [];
  const values: string[] = [];
  const index = (list: string[], item: string) => {
    const at = list.indexOf(item);
    return at === -1 ? list.push(item) - 1 : at;
  };
  const features = layer.features.map((feature) => ({
    feature,
    tags: Object.entries(feature.properties ?? {}).flatMap(([key, value]) => [
      index(keys, key),
      index(values, value),
    ]),
  }));
  pbf.writeVarintField(15, 2);
  pbf.writeStringField(1, layer.name);
  for (const { feature, tags } of features) {
    pbf.writeMessage(
      2,
      (_: null, out: PbfWriter) => {
        out.writePackedVarint(2, tags);
        out.writeVarintField(3, feature.type);
        out.writePackedVarint(4, geometry(feature));
      },
      null,
    );
  }
  keys.forEach((key) => pbf.writeStringField(3, key));
  values.forEach((value) =>
    pbf.writeMessage(4, (_: null, out: PbfWriter) => out.writeStringField(1, value), null),
  );
  pbf.writeVarintField(5, layer.extent ?? 4096);
}

/** The bytes of a tile with these layers, uncompressed. */
export function encodeTestTile(layers: readonly TestLayer[]): Uint8Array {
  const pbf = new PbfWriter();
  for (const layer of layers) {
    pbf.writeMessage(3, writeLayer, layer);
  }
  return pbf.finish();
}
