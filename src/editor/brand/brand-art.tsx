import { Canvas, Group, Path, PathOp, Skia, type SkPath } from '@shopify/react-native-skia';
import { useColorScheme } from 'react-native';

import { BRAND_GEOMETRY } from './geometry.generated';
import { type WatermarkVariant, watermarkLayout } from './watermark-layout';

/**
 * The AllRun logo drawn as vectors with Skia, from the same paths as the brand files. Vectors are
 * rasterized at the final size, so the logo is sharp on screen and in exports at any scale.
 */

/** Logo tone: white for dark photos, black for light ones, brand colors on plain light. */
export type LogoTone = 'light' | 'dark' | 'color';

interface MarkPalette {
  readonly stems: string;
  readonly lanes: string;
  /** Color of the lines between lanes, or `null` to cut them out (transparent). */
  readonly lines: string | null;
}

interface WordPalette {
  readonly all: string;
  readonly run: string;
}

const { colors } = BRAND_GEOMETRY;
const WHITE = colors.laneWhite;
const BLACK = colors.black;

const MARK_PALETTES: Readonly<Record<LogoTone, MarkPalette>> = {
  light: { stems: WHITE, lanes: WHITE, lines: null },
  dark: { stems: BLACK, lanes: BLACK, lines: null },
  color: { stems: colors.nightInk, lanes: colors.trackRed, lines: colors.laneWhite },
};

/** Monogram on dark interface backgrounds: Night Ink stems would vanish, so they turn Chalk. */
const MARK_ON_DARK: MarkPalette = { stems: colors.chalk, lanes: colors.trackRed, lines: null };

const WORD_PALETTES: Readonly<Record<LogoTone, WordPalette>> = {
  light: { all: WHITE, run: WHITE },
  dark: { all: BLACK, run: BLACK },
  color: { all: colors.nightInk, run: colors.trackRed },
};

interface BrandPaths {
  readonly stems: SkPath;
  /** The stems with the lines between lanes cut out, for transparent lines. */
  readonly stemsWithoutGaps: SkPath;
  readonly lanes: SkPath;
  readonly lines: SkPath;
  readonly wordAll: SkPath;
  readonly wordRun: SkPath;
}

function parse(svgPath: string): SkPath {
  const path = Skia.Path.MakeFromSVGString(svgPath);
  if (path === null) {
    throw new Error(`Invalid brand path: ${svgPath.slice(0, 40)}…`);
  }
  return path;
}

function combine(paths: readonly SkPath[], op: PathOp): SkPath {
  return paths.slice(1).reduce((result, path) => {
    const combined = Skia.Path.MakeFromOp(result, path, op);
    if (combined === null) {
      throw new Error(`Brand path operation ${PathOp[op]} failed`);
    }
    return combined;
  }, paths[0]);
}

let cachedPaths: BrandPaths | null = null;

/** Parses the brand geometry once; the paths are immutable and shared by every drawing. */
function brandPaths(): BrandPaths {
  if (cachedPaths === null) {
    const stems = parse(BRAND_GEOMETRY.mark.stems);
    cachedPaths = {
      stems,
      stemsWithoutGaps: combine([stems, ...BRAND_GEOMETRY.mark.gaps.map(parse)], PathOp.Difference),
      lanes: combine(BRAND_GEOMETRY.mark.lanes.map(parse), PathOp.Union),
      lines: parse(BRAND_GEOMETRY.mark.lines),
      wordAll: parse(BRAND_GEOMETRY.wordmark.all),
      wordRun: parse(BRAND_GEOMETRY.wordmark.run),
    };
  }
  return cachedPaths;
}

/** The monogram in its source units (880.57 × 600). */
function MarkShape({ palette }: { readonly palette: MarkPalette }) {
  const paths = brandPaths();
  if (palette.lines === null) {
    return (
      <Group>
        <Path path={paths.stemsWithoutGaps} color={palette.stems} />
        <Path path={paths.lanes} color={palette.lanes} />
      </Group>
    );
  }
  // As in the original artwork: stems, then the white lines, then the lanes on top.
  return (
    <Group>
      <Path path={paths.stems} color={palette.stems} />
      <Path path={paths.lines} color={palette.lines} />
      <Path path={paths.lanes} color={palette.lanes} />
    </Group>
  );
}

/** The name in its source units, with its top-left corner at (0, 0). */
function WordmarkShape({ palette }: { readonly palette: WordPalette }) {
  const paths = brandPaths();
  const { minX, top } = BRAND_GEOMETRY.wordmark;
  return (
    <Group transform={[{ translateX: -minX }, { translateY: -top }]}>
      <Path path={paths.wordAll} color={palette.all} />
      <Path path={paths.wordRun} color={palette.run} />
    </Group>
  );
}

/** AllRun watermark centered on (0, 0), at its base size on a 1080 px wide canvas. */
export function Watermark({
  variant,
  tone,
}: {
  readonly variant: WatermarkVariant;
  readonly tone: LogoTone;
}) {
  const layout = watermarkLayout(variant);
  return (
    <Group transform={[{ translateX: -layout.width / 2 }, { translateY: -layout.height / 2 }]}>
      {layout.mark === null ? null : (
        <Group
          transform={[
            { translateX: layout.mark.x },
            { translateY: layout.mark.y },
            { scale: layout.mark.scale },
          ]}
        >
          <MarkShape palette={MARK_PALETTES[tone]} />
        </Group>
      )}
      {layout.wordmark === null ? null : (
        <Group
          transform={[
            { translateX: layout.wordmark.x },
            { translateY: layout.wordmark.y },
            { scale: layout.wordmark.scale },
          ]}
        >
          <WordmarkShape palette={WORD_PALETTES[tone]} />
        </Group>
      )}
    </Group>
  );
}

/** Height of the AllRun name drawn `width` wide. */
export function wordmarkHeight(width: number): number {
  return (BRAND_GEOMETRY.wordmark.height * width) / BRAND_GEOMETRY.wordmark.width;
}

/**
 * The AllRun name in one `color`, `width` wide, with its top-left corner at (0, 0): the signature
 * of a mixed widget, in the widget's own color.
 */
export function PlainWordmark({
  color,
  width,
}: {
  readonly color: string;
  readonly width: number;
}) {
  return (
    <Group transform={[{ scale: width / BRAND_GEOMETRY.wordmark.width }]}>
      <WordmarkShape palette={{ all: color, run: color }} />
    </Group>
  );
}

/** The monogram as an interface element (e.g. a header), adapted to light and dark mode. */
export function BrandMark({ height }: { readonly height: number }) {
  const scheme = useColorScheme();
  const { width: markWidth, height: markHeight } = BRAND_GEOMETRY.mark;
  const scale = height / markHeight;
  return (
    <Canvas
      style={{ width: markWidth * scale, height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel="AllRun"
    >
      <Group transform={[{ scale }]}>
        <MarkShape palette={scheme === 'dark' ? MARK_ON_DARK : MARK_PALETTES.color} />
      </Group>
    </Canvas>
  );
}
