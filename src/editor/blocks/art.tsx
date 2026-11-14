import {
  Circle,
  Group,
  Line,
  LinearGradient,
  Paint,
  Path,
  Picture,
  Rect,
  RoundedRect,
  Skia,
  type SkPath,
} from '@shopify/react-native-skia';
import type { ReactElement } from 'react';

import { castsShadow, contrastingInk } from '@/core/layer-style';
import type { Point } from '@/core/route-projection';
import type { HitHole } from '@/core/layer-transform';
import { mapPicture } from '@/ui/map-picture';

import { PlainMark, PlainWordmark } from '../brand/brand-art';
import { SPORT_ICON_SIZE } from '../icons/sport-icons.generated';
import { DropShadow, softBackdrop } from '../scene-text';
import { ParagraphPicture } from '../paragraph-picture';
import type { BlockStyle, PreparedBlock } from '../activity-blocks';
import { type Box, column, overlay, type Piece } from './layout';
import { BOARDING_PASS, RECEIPT } from './paper';
import {
  fillBox,
  GLASS_EDGE,
  ICON_PATHS,
  type IconId,
  logoBox,
  MESSAGE_RADIUS,
  MESSAGE_TAIL,
  ROUTE_STROKE,
  seededRandom,
} from './pieces';
import { GRAIN_AREA, MARKER_WOBBLE, VERIFIED } from './replicas';
import { BLOCK_BACKDROP, LOGO_GAP, LOGO_WIDTH } from './sizes';

/**
 * A block's `body` finished: signed with the AllRun name under it when the layer asks for its
 * `logo` and the design is `signable` (a replica is the app's own view: no signature), on its
 * backdrop when it has one, and drawn centered on (0, 0); `hole` is its see-through part.
 */
export function finishBlock(
  body: Box,
  { logo, style }: { readonly logo: boolean; readonly style: BlockStyle },
  signable: boolean,
  hole?: HitHole,
): PreparedBlock {
  const signed = logo && signable ? column([body, logoBox(LOGO_WIDTH)], LOGO_GAP, 'center') : body;
  // On a backdrop (only data widgets offer one), as a text widget: a box of the color opposite
  // to its texts', translucent or solid, padded in proportion.
  const backdrop = style.backdrop ?? 'none';
  const whole =
    backdrop === 'none'
      ? signed
      : (() => {
          const pad = Math.max(BLOCK_BACKDROP.minPad, signed.height * BLOCK_BACKDROP.padding);
          const width = signed.width + 2 * pad * BLOCK_BACKDROP.wider;
          const height = signed.height + 2 * pad;
          return overlay(
            fillBox(
              width,
              height,
              Math.min(pad * BLOCK_BACKDROP.radius, height / 2),
              backdrop === 'solid' ? contrastingInk(style.color) : softBackdrop(style.color),
              {},
            ),
            signed,
          );
        })();
  return {
    width: whole.width,
    height: whole.height,
    ...(hole === undefined ? {} : { hole }),
    content: (
      <BlockArt
        pieces={whole.place(0, 0)}
        color={style.color}
        width={whole.width}
        height={whole.height}
      />
    ),
  };
}

/**
 * The tail of a sent message, out of its bubble's top right corner at (`x`, `y`): it covers the
 * rounded corner and points right. A path of its own, so it never cuts into the bubble.
 */
function messageTailPath(x: number, y: number): SkPath {
  const builder = Skia.PathBuilder.Make();
  builder.moveTo(x - MESSAGE_RADIUS, y);
  builder.lineTo(x + MESSAGE_TAIL - 4, y);
  builder.quadTo(x + MESSAGE_TAIL + 2, y, x + MESSAGE_TAIL - 2, y + 6);
  builder.lineTo(x, y + MESSAGE_RADIUS * 1.1);
  builder.lineTo(x - MESSAGE_RADIUS, y + MESSAGE_RADIUS * 1.1);
  builder.close();
  return builder.detach();
}

/**
 * The outline of a sheet of paper (see `Piece`): a receipt's, torn in teeth at its top and bottom,
 * or a boarding pass's, its corners rounded and a round notch on each side at its cut.
 */
function paperPath(piece: Extract<Piece, { kind: 'paper' }>): SkPath {
  const { x, y, width, height } = piece;
  const builder = Skia.PathBuilder.Make();
  if (piece.shape === 'receipt') {
    const teeth = Math.max(1, Math.round(width / (2 * RECEIPT.tooth)));
    const step = width / teeth;
    const depth = RECEIPT.tooth * 0.7;
    builder.moveTo(x, y + depth);
    for (let i = 0; i < teeth; i++) {
      builder.lineTo(x + step * (i + 0.5), y);
      builder.lineTo(x + step * (i + 1), y + depth);
    }
    builder.lineTo(x + width, y + height - depth);
    for (let i = teeth - 1; i >= 0; i--) {
      builder.lineTo(x + step * (i + 0.5), y + height);
      builder.lineTo(x + step * i, y + height - depth);
    }
    builder.close();
    return builder.detach();
  }
  const r = BOARDING_PASS.radius;
  const notch = BOARDING_PASS.notch;
  const cut = y + (piece.cut ?? height / 2);
  /** A quarter of a circle `r` round (cx, cy), clockwise from `start` degrees. */
  const corner = (cx: number, cy: number, start: number) =>
    builder.arcToOval({ x: cx - r, y: cy - r, width: 2 * r, height: 2 * r }, start, 90, false);
  /** Half a circle into the pass, round (cx, cut), from `start` degrees. */
  const bite = (cx: number, start: number) =>
    builder.arcToOval(
      { x: cx - notch, y: cut - notch, width: 2 * notch, height: 2 * notch },
      start,
      -180,
      false,
    );
  builder.moveTo(x + r, y);
  builder.lineTo(x + width - r, y);
  corner(x + width - r, y + r, 270);
  bite(x + width, 270);
  corner(x + width - r, y + height - r, 0);
  corner(x + r, y + height - r, 90);
  bite(x, 90);
  corner(x + r, y + r, 180);
  builder.close();
  return builder.detach();
}

/**
 * A marker's strokes over `rects`, drawn by hand (see `MARKER_WOBBLE`): each a band with straight
 * ends whose top and bottom edges lean together and waver a little, the same every time for the
 * same place (seeded by it), so the canvas and the exported image match. Time O(w / h) per band.
 */
function markerPath(rects: Extract<Piece, { kind: 'highlight' }>['rects']): SkPath {
  const builder = Skia.PathBuilder.Make();
  for (const { x, y, width, height } of rects) {
    const random = seededRandom(Math.round(x) * 7_919 + Math.round(y));
    // From one end to the other, both edges go this much up (or down), the bottom a bit less.
    const tilt = (random() * 2 - 1) * MARKER_WOBBLE.tilt * height;
    const steps = Math.max(2, Math.round(width / (MARKER_WOBBLE.step * height)));
    /** An edge's wave: a gentle drift, step by step, that never strays past `wave`. */
    const wave = () => {
      const limit = MARKER_WOBBLE.wave * height;
      let drift = 0;
      return Array.from({ length: steps + 1 }, () => {
        drift = Math.max(-limit, Math.min(limit, drift + (random() * 2 - 1) * limit * 0.8));
        return drift;
      });
    };
    const top = wave();
    const bottom = wave();
    const at = (i: number) => x + (width * i) / steps;
    const lean = (i: number) => tilt * (0.5 - i / steps);
    // Along the top from left to right, then back along the bottom: the ends are straight.
    for (let i = 0; i <= steps; i++) {
      const py = y + lean(i) + top[i];
      if (i === 0) {
        builder.moveTo(at(i), py);
      } else {
        builder.lineTo(at(i), py);
      }
    }
    for (let i = steps; i >= 0; i--) {
      builder.lineTo(at(i), y + height + lean(i) * 0.8 + bottom[i]);
    }
    builder.close();
  }
  return builder.detach();
}

/** The paper's grain over a piece's rectangle: specks scattered alike every time. */
function grainPath({ x, y, width, height }: Extract<Piece, { kind: 'grain' }>): SkPath {
  const random = seededRandom(Math.round(width) * 31 + Math.round(height));
  const builder = Skia.PathBuilder.Make();
  const count = Math.round((width * height) / GRAIN_AREA);
  for (let i = 0; i < count; i++) {
    builder.addCircle(x + random() * width, y + random() * height, 0.6 + random() * 1.2);
  }
  return builder.detach();
}

/** The back chevron of an app's bar, `size` tall, its top-left corner at (x, y). */
function chevronPath({ x, y, size }: { x: number; y: number; size: number }): SkPath {
  const builder = Skia.PathBuilder.Make();
  builder.moveTo(x + size * 0.5, y + size * 0.1);
  builder.lineTo(x + size * 0.1, y + size * 0.5);
  builder.lineTo(x + size * 0.5, y + size * 0.9);
  return builder.detach();
}

/**
 * Two read ticks, `size` tall and 1.4 times as wide, their top-left corner at (x, y), as WhatsApp
 * draws them: the second tick's short stroke is cut short, leaving air before the first tick.
 */
function ticksPath({ x, y, size }: { x: number; y: number; size: number }): SkPath {
  const builder = Skia.PathBuilder.Make();
  const shift = size * 0.4;
  builder.moveTo(x + size * 0.05, y + size * 0.55);
  builder.lineTo(x + size * 0.35, y + size * 0.85);
  builder.lineTo(x + size * 0.95, y + size * 0.15);
  // Cut well before the first tick's long stroke, with air between them.
  builder.moveTo(x + shift + size * 0.29, y + size * 0.79);
  builder.lineTo(x + shift + size * 0.35, y + size * 0.85);
  builder.lineTo(x + shift + size * 0.95, y + size * 0.15);
  return builder.detach();
}

function routePath(points: readonly Point[]): SkPath {
  const builder = Skia.PathBuilder.Make();
  points.forEach((point, i) =>
    i === 0 ? builder.moveTo(point.x, point.y) : builder.lineTo(point.x, point.y),
  );
  return builder.detach();
}

/** The icons, parsed once. */
const iconPaths = new Map<IconId, SkPath>();

function iconPath(icon: IconId): SkPath {
  const cached = iconPaths.get(icon);
  if (cached !== undefined) {
    return cached;
  }
  const path = Skia.Path.MakeFromSVGString(ICON_PATHS[icon]);
  if (path === null) {
    throw new Error(`Invalid sport icon path: ${icon}`);
  }
  iconPaths.set(icon, path);
  return path;
}

/** A path through `points` of a `size` square at (x, y), given as fractions of its side. */
function polygon(
  builder: ReturnType<typeof Skia.PathBuilder.Make>,
  { x, y, size }: { x: number; y: number; size: number },
  points: readonly (readonly [number, number])[],
  close: boolean,
): void {
  points.forEach(([px, py], i) =>
    i === 0
      ? builder.moveTo(x + px * size, y + py * size)
      : builder.lineTo(x + px * size, y + py * size),
  );
  if (close) {
    builder.close();
  }
}

/**
 * A control of an app, `size` square with its top-left corner at (x, y), as the phone draws it:
 * its filled part, and the outline drawn as a line (the AirPlay screen, the flip's arrows).
 */
function symbolPaths(piece: Extract<Piece, { kind: 'symbol' }>): {
  readonly fill: SkPath | null;
  readonly line: SkPath | null;
} {
  const fill = Skia.PathBuilder.Make();
  const line = Skia.PathBuilder.Make();
  const { x, y, size } = piece;
  switch (piece.symbol) {
    case 'backward':
    case 'forward': {
      // Two triangles tip to base, their corners rounded by the outline drawn over them.
      const toLeft = piece.symbol === 'backward';
      for (const from of [0.08, 0.5]) {
        const points: [number, number][] = toLeft
          ? [
              [from + 0.42, 0.26],
              [from + 0.42, 0.74],
              [from, 0.5],
            ]
          : [
              [from, 0.26],
              [from + 0.42, 0.5],
              [from, 0.74],
            ];
        polygon(fill, piece, points, true);
        polygon(line, piece, points, true);
      }
      break;
    }
    case 'pause':
      for (const left of [0.11, 0.62]) {
        fill.addRRect({
          rect: { x: x + left * size, y: y + 0.02 * size, width: 0.27 * size, height: 0.96 * size },
          rx: 0.08 * size,
          ry: 0.08 * size,
        });
      }
      break;
    case 'airplay': {
      // AirPlay for sound: two rings open at the bottom, where the triangle comes in.
      const cx = x + 0.5 * size;
      const cy = y + 0.44 * size;
      for (const r of [0.4, 0.22]) {
        line.addArc(
          { x: cx - r * size, y: cy - r * size, width: 2 * r * size, height: 2 * r * size },
          125,
          290,
        );
      }
      polygon(
        fill,
        piece,
        [
          [0.5, 0.6],
          [0.78, 0.96],
          [0.22, 0.96],
        ],
        true,
      );
      break;
    }
    case 'waveform':
      // The sound wave of what is playing: bars short at the ends, tall in the middle.
      [0.22, 0.55, 0.9, 0.6, 0.22].forEach((tall, i) => {
        fill.addRRect({
          rect: {
            x: x + (0.07 + i * 0.19) * size,
            y: y + ((1 - tall) / 2) * size,
            width: 0.1 * size,
            height: tall * size,
          },
          rx: 0.05 * size,
          ry: 0.05 * size,
        });
      });
      break;
    case 'flip': {
      // Two arcs round a circle, each ending in a solid arrowhead: the top one comes down on the
      // right, the bottom one goes up on the left, with a gap before the next arc.
      const r = 0.35 * size;
      const cx = x + 0.5 * size;
      const cy = y + 0.5 * size;
      const oval = { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r };
      const length = 0.21 * size;
      const half = 0.14 * size;
      for (const start of [225, 45]) {
        line.addArc(oval, start, 135);
        const end = ((start + 135) * Math.PI) / 180;
        const endX = cx + r * Math.cos(end);
        const endY = cy + r * Math.sin(end);
        // Along the circle (clockwise) and across it.
        const alongX = -Math.sin(end);
        const alongY = Math.cos(end);
        const acrossX = Math.cos(end);
        const acrossY = Math.sin(end);
        fill.moveTo(endX + acrossX * half, endY + acrossY * half);
        fill.lineTo(endX + alongX * length, endY + alongY * length);
        fill.lineTo(endX - acrossX * half, endY - acrossY * half);
        fill.close();
      }
      break;
    }
    case 'pin': {
      // A map pin's outline: a circle drawn down to a tip, the lines from the tip touching it,
      // with a round hole.
      const r = 0.3 * size;
      const cx = x + 0.5 * size;
      const cy = y + 0.38 * size;
      const tipY = y + 0.95 * size;
      // The lines from the tip touch the circle this far round from straight down.
      const turn = (Math.acos(r / (tipY - cy)) * 180) / Math.PI;
      line.moveTo(cx, tipY);
      line.arcToOval(
        { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r },
        90 + turn,
        360 - 2 * turn,
        false,
      );
      line.close();
      line.addCircle(cx, cy, 0.12 * size);
      break;
    }
    case 'stopwatch': {
      // The fastest lap's stopwatch: a dial with its hand, and the crown on top.
      const r = 0.3 * size;
      const cx = x + 0.5 * size;
      const cy = y + 0.56 * size;
      line.addCircle(cx, cy, r);
      line.moveTo(cx, cy);
      line.lineTo(cx + 0.12 * size, cy - 0.12 * size);
      line.moveTo(cx, cy - r);
      line.lineTo(cx, y + 0.17 * size);
      fill.addRRect({
        rect: { x: cx - 0.1 * size, y: y + 0.08 * size, width: 0.2 * size, height: 0.09 * size },
        rx: 0.03 * size,
        ry: 0.03 * size,
      });
      break;
    }
    case 'badge': {
      // Instagram's verified badge: a round seal with scalloped edges.
      const cx = x + 0.5 * size;
      const cy = y + 0.5 * size;
      const steps = 120;
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        const r = size * (0.465 + 0.035 * Math.cos(VERIFIED.scallops * angle));
        const px = cx + r * Math.sin(angle);
        const py = cy - r * Math.cos(angle);
        if (i === 0) {
          fill.moveTo(px, py);
        } else {
          fill.lineTo(px, py);
        }
      }
      fill.close();
      break;
    }
    case 'check':
      polygon(
        line,
        piece,
        [
          [0.3, 0.51],
          [0.44, 0.65],
          [0.71, 0.37],
        ],
        false,
      );
      break;
  }
  return {
    fill: fill.isEmpty() ? null : fill.detach(),
    line: line.isEmpty() ? null : line.detach(),
  };
}

/** A replica's own mark, in its app's colors and without a shadow; `null` for other pieces. */
function appMark(piece: Piece, i: number): ReactElement | null {
  switch (piece.kind) {
    case 'chevron':
    case 'ticks':
      return (
        <Path
          key={i}
          path={piece.kind === 'chevron' ? chevronPath(piece) : ticksPath(piece)}
          style="stroke"
          strokeWidth={piece.size * 0.12}
          strokeCap="round"
          strokeJoin="round"
          color={piece.color}
        />
      );
    case 'icon':
      return piece.color === undefined ? null : (
        <Group
          key={i}
          transform={[
            { translateX: piece.x },
            { translateY: piece.y },
            { scale: piece.size / SPORT_ICON_SIZE },
            { translateY: SPORT_ICON_SIZE },
          ]}
        >
          <Path path={iconPath(piece.icon)} color={piece.color} />
        </Group>
      );
    case 'route':
      return piece.color === undefined ? null : (
        <Path
          key={i}
          path={routePath(piece.points)}
          style="stroke"
          strokeWidth={piece.width ?? ROUTE_STROKE}
          strokeCap="round"
          strokeJoin="round"
          color={piece.color}
        />
      );
    case 'disc':
      return (
        <Circle
          key={i}
          c={{ x: piece.cx, y: piece.cy }}
          r={piece.stroke === undefined ? piece.r : piece.r - piece.stroke / 2}
          color={piece.color}
          style={piece.stroke === undefined ? 'fill' : 'stroke'}
          strokeWidth={piece.stroke ?? 0}
        />
      );
    case 'symbol': {
      const { fill, line } = symbolPaths(piece);
      // Fill and outline overlap: drawn solid and faded together, a faded control shows no seams.
      const color = Skia.Color(piece.color);
      const opacity = color[3];
      color[3] = 1;
      return (
        <Group key={i} layer={opacity < 1 ? <Paint opacity={opacity} /> : undefined}>
          {fill === null ? null : <Path path={fill} color={color} />}
          {line === null ? null : (
            <Path
              path={line}
              style="stroke"
              strokeWidth={piece.size * 0.08}
              strokeCap="round"
              strokeJoin="round"
              color={color}
            />
          )}
        </Group>
      );
    }
    case 'panel':
      return piece.flat === true ? (
        <Group key={i}>
          <RoundedRect
            x={piece.x}
            y={piece.y}
            width={piece.width}
            height={piece.height}
            r={piece.radius}
            color={piece.color}
          />
          {piece.edge === undefined ? null : (
            <RoundedRect
              x={piece.x + GLASS_EDGE / 2}
              y={piece.y + GLASS_EDGE / 2}
              width={piece.width - GLASS_EDGE}
              height={piece.height - GLASS_EDGE}
              r={piece.radius - GLASS_EDGE / 2}
              color={piece.edge}
              style="stroke"
              strokeWidth={GLASS_EDGE}
            />
          )}
        </Group>
      ) : null;
    case 'shade':
      return (
        <Group
          key={i}
          clip={Skia.RRectXY(
            Skia.XYWHRect(piece.card.x, piece.card.y, piece.card.width, piece.card.height),
            piece.card.radius,
            piece.card.radius,
          )}
        >
          <Rect x={piece.x} y={piece.y} width={piece.width} height={piece.height}>
            <LinearGradient
              start={{ x: piece.x, y: piece.y }}
              end={
                piece.across === true
                  ? { x: piece.x + piece.width, y: piece.y }
                  : { x: piece.x, y: piece.y + piece.height }
              }
              colors={[...piece.colors]}
            />
          </Rect>
        </Group>
      );
    case 'grain':
      return <Path key={i} path={grainPath(piece)} color={piece.color} />;
    case 'highlight':
      return <Path key={i} path={markerPath(piece.rects)} color={piece.color} />;
    case 'hairline':
      return (
        <Line
          key={i}
          p1={{ x: piece.x1, y: piece.y1 }}
          p2={{ x: piece.x2, y: piece.y2 }}
          color={piece.color}
          strokeWidth={piece.width}
        />
      );
    case 'logo':
      return piece.color === undefined ? null : (
        <Group key={i} transform={[{ translateX: piece.x }, { translateY: piece.y }]}>
          <PlainWordmark color={piece.color} width={piece.width} />
        </Group>
      );
    case 'mark':
      return (
        <Group key={i} transform={[{ translateX: piece.x }, { translateY: piece.y }]}>
          <PlainMark color={piece.color} height={piece.height} />
        </Group>
      );
    case 'text':
    case 'messageTail':
    case 'paper':
    case 'map':
      return null;
  }
}

/**
 * Draws a block's pieces centered on (0, 0): its shapes under one shadow (one blur for all of
 * them), then its texts, which carry their own.
 */
function BlockArt({
  pieces,
  color,
  width,
  height,
}: {
  readonly pieces: readonly Piece[];
  readonly color: string;
  readonly width: number;
  readonly height: number;
}) {
  const shapes = pieces.flatMap((piece, i) => {
    switch (piece.kind) {
      case 'text':
      case 'panel':
      case 'paper':
      case 'grain':
      case 'highlight':
      case 'shade':
      case 'hairline':
      case 'messageTail':
      case 'chevron':
      case 'ticks':
      case 'symbol':
      case 'disc':
      case 'mark':
      case 'map':
        return [];
      case 'icon':
        return piece.color !== undefined
          ? []
          : [
              <Group
                key={i}
                transform={[
                  { translateX: piece.x },
                  { translateY: piece.y },
                  { scale: piece.size / SPORT_ICON_SIZE },
                  // Material Symbols draw from (0, -960) down to (960, 0).
                  { translateY: SPORT_ICON_SIZE },
                ]}
              >
                <Path path={iconPath(piece.icon)} color={piece.color ?? color} />
              </Group>,
            ];
      case 'logo':
        return piece.color !== undefined
          ? []
          : [
              <Group key={i} transform={[{ translateX: piece.x }, { translateY: piece.y }]}>
                <PlainWordmark color={color} width={piece.width} />
              </Group>,
            ];
      case 'route':
        return piece.color !== undefined
          ? []
          : [
              <Path
                key={i}
                path={routePath(piece.points)}
                style="stroke"
                strokeWidth={piece.width ?? ROUTE_STROKE}
                strokeCap="round"
                strokeJoin="round"
                color={color}
              />,
            ];
    }
  });
  return (
    <Group transform={[{ translateX: -width / 2 }, { translateY: -height / 2 }]}>
      {/* A replica's card lifts off the photo with a shadow, whatever its color. */}
      <Group
        layer={
          <Paint>
            <DropShadow />
          </Paint>
        }
      >
        {pieces.map((piece, i) =>
          piece.kind === 'panel' && piece.flat !== true ? (
            <RoundedRect
              key={i}
              x={piece.x}
              y={piece.y}
              width={piece.width}
              height={piece.height}
              r={piece.radius}
              color={piece.color}
            />
          ) : piece.kind === 'map' ? (
            <Group
              key={i}
              clip={Skia.RRectXY(
                Skia.XYWHRect(piece.x, piece.y, piece.size, piece.size),
                piece.radius,
                piece.radius,
              )}
            >
              <Group transform={[{ translateX: piece.x }, { translateY: piece.y }]}>
                <Picture picture={mapPicture(piece.viewport, piece.tiles)} />
              </Group>
            </Group>
          ) : piece.kind === 'messageTail' ? (
            <Path key={i} path={messageTailPath(piece.x, piece.y)} color={piece.color} />
          ) : piece.kind === 'paper' ? (
            <Path key={i} path={paperPath(piece)} color={piece.color} />
          ) : null,
        )}
      </Group>
      {/* Its marks are part of the app: no shadow on them. */}
      {pieces.map(appMark)}
      <Group
        layer={
          castsShadow(color) ? (
            <Paint>
              <DropShadow />
            </Paint>
          ) : undefined
        }
      >
        {shapes}
      </Group>
      {pieces.map((piece, i) => {
        if (piece.kind !== 'text') {
          return null;
        }
        const width = Math.ceil(piece.paragraph.getLongestLine()) + 1;
        const text =
          piece.stretch !== undefined || piece.scale !== undefined ? (
            // The shadow's layer is outside the stretch, so the shadow is cast once stretched.
            <Group
              key={i}
              layer={
                piece.shadow === true ? (
                  <Paint>
                    <DropShadow />
                  </Paint>
                ) : undefined
              }
            >
              <Group
                transform={[
                  { translateX: piece.x },
                  { translateY: piece.y },
                  { scale: piece.scale ?? 1 },
                  { scaleY: piece.stretch ?? 1 },
                ]}
              >
                <ParagraphPicture paragraph={piece.paragraph} x={0} y={0} width={width} />
              </Group>
            </Group>
          ) : (
            <ParagraphPicture
              key={i}
              paragraph={piece.paragraph}
              x={piece.x}
              y={piece.y}
              width={width}
            />
          );
        return piece.turn === undefined ? (
          text
        ) : (
          <Group
            key={i}
            transform={[
              { translateX: piece.turn.x },
              { translateY: piece.turn.y + piece.turn.length },
              { rotate: -Math.PI / 2 },
            ]}
          >
            {text}
          </Group>
        );
      })}
    </Group>
  );
}
