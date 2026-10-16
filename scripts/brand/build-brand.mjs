// Builds the brand variants and app assets from the AllRun logo geometry.
//
// The source of truth is the original design in docs/marca (Pedro Luis Soto Santos, 2026). The
// monogram is rebuilt here from the same coordinates so new variants (fewer lanes, horizontal
// lockup, one-color versions with transparent lane lines) stay pixel-identical to it.
//
// Usage: npm run brand   (writes docs/marca/generated, assets/images and the app geometry)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCS_OUT = join(ROOT, 'docs', 'marca', 'generated');
const APP_OUT = join(ROOT, 'assets', 'images');

const COLORS = {
  trackRed: '#C94A2E',
  nightInk: '#141B2D',
  chalk: '#F6F1EA',
  laneWhite: '#FFFFFF',
  black: '#000000',
};

// --- Monogram geometry (units of the original 880.57 × 600 drawing) ---------------------------

const MARK_WIDTH = 880.57;
const MARK_HEIGHT = 600;
const STEM_RIGHT = 495.29;
// Center of the lane curves.
const CX = 661.9687435280222;
const CY = 215;
// The lanes are cut along the outer edge of the A: x = 382.29 at the top, 0 at the bottom.
const edgeX = (y) => 382.29 - y * (382.29 / 600);

const LEFT_LEG = 'M382.29,0 L495.29,0 L495.29,27.35 L130.43,600 L0,600Z';
const STEM = 'M385.29,0 L495.29,0 L495.29,600 L385.29,600Z';
const RIGHT_LEG = 'M626.54,406 L750.14,600 L880.57,600 L756.97,406Z';

/**
 * One lane, or the gap between two lanes: a band between radii `inner` and `outer` that leaves
 * the stem, turns around the curve of the R and runs straight back to the edge of the A.
 */
const band = (outer, inner) =>
  [
    `M${edgeX(CY + outer)},${CY + outer}`,
    `L${CX},${CY + outer}`,
    `A${outer},${outer} 0 0 0 ${CX},${CY - outer}`,
    `L${STEM_RIGHT},${CY - outer}`,
    `L${STEM_RIGHT},${CY - inner}`,
    `L${CX},${CY - inner}`,
    `A${inner},${inner} 0 0 1 ${CX},${CY + inner}`,
    `L${edgeX(CY + inner)},${CY + inner}Z`,
  ].join(' ');

// The lanes fill the radii 95..215. The original has 4 lanes of 24 with gaps of 8; the reduced
// version has 3 lanes of 32 with gaps of 12, so the lines survive at small sizes.
const LANE_SETS = {
  full: { count: 4, lane: 24, gap: 8 },
  simple: { count: 3, lane: 32, gap: 12 },
};

function lanes({ count, lane, gap }) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const outer = 215 - i * (lane + gap);
    result.push({ outer, inner: outer - lane });
  }
  return result;
}

function gaps(set) {
  const all = lanes(set);
  return all.slice(1).map((current, i) => ({ outer: all[i].inner, inner: current.outer }));
}

/**
 * The monogram as SVG elements.
 *
 * - `color`: stems in `stem`, lanes in `lane`, lane lines in `line` (as in the original).
 * - `mono`: everything in one color, lane lines cut out (transparent), for the white and black
 *   versions over photos and for monochrome icons.
 */
function mark(laneSet, style, id) {
  const set = LANE_SETS[laneSet];
  if (style.mono !== undefined) {
    const maskId = `lanes-${id}`;
    return `
      <mask id="${maskId}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="${MARK_WIDTH + 20}" height="${MARK_HEIGHT + 20}">
        <rect x="-10" y="-10" width="${MARK_WIDTH + 20}" height="${MARK_HEIGHT + 20}" fill="#fff"/>
        ${gaps(set)
          .map((g) => `<path fill="#000" d="${band(g.outer, g.inner)}"/>`)
          .join('\n        ')}
      </mask>
      <g mask="url(#${maskId})" fill="${style.mono}">
        <path d="${LEFT_LEG}"/><path d="${STEM}"/><path d="${RIGHT_LEG}"/>
        ${lanes(set)
          .map((l) => `<path d="${band(l.outer, l.inner)}"/>`)
          .join('\n        ')}
      </g>`;
  }
  const all = lanes(set);
  return `
      <g fill="${style.stem}"><path d="${LEFT_LEG}"/><path d="${STEM}"/><path d="${RIGHT_LEG}"/></g>
      <path fill="${style.line}" d="${band(all[0].outer - 1, all.at(-1).inner + 1)}"/>
      <g fill="${style.lane}">
        ${all.map((l) => `<path d="${band(l.outer, l.inner)}"/>`).join('\n        ')}
      </g>`;
}

// --- Wordmark (Montserrat Black Italic, outlined in the original) ------------------------------

const WORD_ALL =
  'M43.75 0L-18.50 0L93-175L151-175L192.50 0L133.75 0L128-30.50L61.25-30.50L43.75 0M85.50-73L119.75-73L111.25-117.75 M256.75 0L200.25 0L237.25-185.50L293.75-185.50 M338.25 0L281.75 0L318.75-185.50L375.25-185.50';
const WORD_RUN =
  'M424 0L365 0L400-175L478.50-175Q513.25-175 532.25-159.87Q551.25-144.75 551.25-117.50Q551.25-95.50 540.38-79Q529.50-62.50 509.75-53.25Q507-52 504-51L533.25 0L472 0L447.25-44L432.75-44L424 0M449.75-129.50L441.50-88.50L465.75-88.50Q478-88.50 484.75-94.62Q491.50-100.75 491.50-111.75Q491.50-121.25 485.63-125.37Q479.75-129.50 469.50-129.50 M608.25 2.50Q591.75 2.50 579.63-4.62Q567.50-11.75 562.38-25.87Q557.25-40 561.50-61.25L576.50-136.75L633-136.75L619.25-68Q617-56.75 620.25-50.87Q623.50-45 632-45Q641.50-45 647.88-51.37Q654.25-57.75 656.75-71L670-136.75L726.50-136.75L699.25 0L646 0L648.75-13.50Q643-8.25 636.50-4.75Q622.25 2.50 608.25 2.50 M842.75-139.25Q859.75-139.25 871.88-132.12Q884-125 889.13-110.87Q894.25-96.75 890-75.50L875 0L818.50 0L832.25-68.75Q834.50-80 831.25-85.87Q828-91.75 819-91.75Q809.50-91.75 803-85.37Q796.50-79 793.75-65.75L780.50 0L724 0L751.25-136.75L804.50-136.75L801.75-123.25Q807.50-128.50 814.50-132Q828.75-139.25 842.75-139.25';
// Bounding box of the wordmark paths.
const WORD_MIN_X = -18.5;
const WORD_WIDTH = 894.25 - WORD_MIN_X;
const WORD_TOP = -185.5;
const WORD_HEIGHT = 2.5 - WORD_TOP;

function wordmark(style) {
  const all = style.mono ?? style.all;
  const run = style.mono ?? style.run;
  return `<path fill="${all}" d="${WORD_ALL}"/><path fill="${run}" d="${WORD_RUN}"/>`;
}

// --- Compositions ---------------------------------------------------------------------------

const svg = (width, height, body, background) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <title>AllRun</title>${background ? `\n  <rect width="${width}" height="${height}" fill="${background}"/>` : ''}
  ${body}
</svg>
`;

const PAD = 40;

/** Monogram alone with a small margin. */
const markSvg = (laneSet, style, id) =>
  svg(
    MARK_WIDTH + 2 * PAD,
    MARK_HEIGHT + 2 * PAD,
    `<g transform="translate(${PAD} ${PAD})">${mark(laneSet, style, id)}</g>`,
  );

/** Wordmark alone. */
const wordmarkSvg = (style) =>
  svg(
    WORD_WIDTH + 2 * PAD,
    WORD_HEIGHT + 2 * PAD,
    `<g transform="translate(${PAD - WORD_MIN_X} ${PAD - WORD_TOP})">${wordmark(style)}</g>`,
  );

/**
 * Horizontal lockup: monogram on the left, wordmark on the right, vertically centered. The
 * wordmark is sized to 42% of the monogram height, like a cap height next to a symbol.
 */
function horizontalSvg(laneSet, markStyle, wordStyle, id) {
  const wordScale = (MARK_HEIGHT * 0.42) / WORD_HEIGHT;
  const gap = MARK_HEIGHT * 0.16;
  const width = MARK_WIDTH + gap + WORD_WIDTH * wordScale;
  const wordY = (MARK_HEIGHT - WORD_HEIGHT * wordScale) / 2;
  return svg(
    width + 2 * PAD,
    MARK_HEIGHT + 2 * PAD,
    `<g transform="translate(${PAD} ${PAD})">
    ${mark(laneSet, markStyle, id)}
    <g transform="translate(${MARK_WIDTH + gap} ${wordY}) scale(${wordScale}) translate(${-WORD_MIN_X} ${-WORD_TOP})">${wordmark(wordStyle)}</g>
  </g>`,
  );
}

/**
 * Square icon: the monogram centered on a background, filling `fill` of the width. `null`
 * background gives a transparent canvas (Android adaptive foreground, splash image).
 */
function iconSvg(laneSet, style, background, fill, id, size = 1024) {
  const scale = (size * fill) / MARK_WIDTH;
  const x = (size - MARK_WIDTH * scale) / 2;
  const y = (size - MARK_HEIGHT * scale) / 2;
  return svg(
    size,
    size,
    `<g transform="translate(${x} ${y}) scale(${scale})">${mark(laneSet, style, id)}</g>`,
    background,
  );
}

// --- Styles -----------------------------------------------------------------------------------

const MARK = {
  color: { stem: COLORS.nightInk, lane: COLORS.trackRed, line: COLORS.laneWhite },
  // On dark backgrounds the Night Ink stems would vanish: they turn Chalk.
  onDark: { stem: COLORS.chalk, lane: COLORS.trackRed, line: COLORS.nightInk },
  white: { mono: COLORS.laneWhite },
  black: { mono: COLORS.black },
};
const WORD = {
  color: { all: COLORS.nightInk, run: COLORS.trackRed },
  onDark: { all: COLORS.chalk, run: COLORS.trackRed },
  white: { mono: COLORS.laneWhite },
  black: { mono: COLORS.black },
};

// --- Output -----------------------------------------------------------------------------------

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function png(svgText, width) {
  return new Resvg(svgText, { fitTo: { mode: 'width', value: width } }).render().asPng();
}

function emit(name, svgText, { dir = DOCS_OUT, pngWidth = 2048, svgFile = true } = {}) {
  if (svgFile) {
    write(join(dir, `${name}.svg`), svgText);
  }
  write(join(dir, `${name}.png`), png(svgText, pngWidth));
}

// Brand variants (docs/marca/generated), SVG + PNG.
for (const tone of ['color', 'white', 'black']) {
  emit(`allrun-mark-simple-${tone}`, markSvg('simple', MARK[tone], `ms-${tone}`));
  emit(`allrun-mark-${tone}`, markSvg('full', MARK[tone], `mf-${tone}`));
  emit(`allrun-wordmark-${tone}`, wordmarkSvg(WORD[tone]));
  emit(
    `allrun-logo-horizontal-${tone}`,
    horizontalSvg('full', MARK[tone], WORD[tone], `hf-${tone}`),
  );
  emit(
    `allrun-logo-horizontal-simple-${tone}`,
    horizontalSvg('simple', MARK[tone], WORD[tone], `hs-${tone}`),
  );
}
emit(
  `allrun-logo-horizontal-simple-on-dark`,
  horizontalSvg('simple', MARK.onDark, WORD.onDark, 'hd'),
);

// App icons. The reduced monogram keeps the lane lines visible at the small sizes iOS and
// Android use in settings, search and notifications.
const ICON_FILL = 0.72;
const iconLight = iconSvg('simple', MARK.color, COLORS.chalk, ICON_FILL, 'il');
emit('icon', iconLight, { dir: APP_OUT, pngWidth: 1024, svgFile: false });
emit('icon-ios-dark', iconSvg('simple', MARK.onDark, COLORS.nightInk, ICON_FILL, 'id'), {
  dir: APP_OUT,
  pngWidth: 1024,
  svgFile: false,
});
// Tinted icons are grayscale; iOS applies the user's tint over them.
emit('icon-ios-tinted', iconSvg('simple', MARK.white, COLORS.black, ICON_FILL, 'it'), {
  dir: APP_OUT,
  pngWidth: 1024,
  svgFile: false,
});
// Android adaptive icons are cropped to a circle of 66/108 of the canvas: the monogram's
// diagonal must fit in it, which a 56% width does with some air.
const ADAPTIVE_FILL = 0.56;
emit('android-icon-foreground', iconSvg('simple', MARK.color, null, ADAPTIVE_FILL, 'af'), {
  dir: APP_OUT,
  pngWidth: 1024,
  svgFile: false,
});
emit('android-icon-monochrome', iconSvg('simple', MARK.white, null, ADAPTIVE_FILL, 'am'), {
  dir: APP_OUT,
  pngWidth: 1024,
  svgFile: false,
});
emit('splash-icon', iconSvg('simple', MARK.color, null, 0.9, 'sl'), {
  dir: APP_OUT,
  pngWidth: 1024,
  svgFile: false,
});
emit('splash-icon-dark', iconSvg('simple', MARK.onDark, null, 0.9, 'sd'), {
  dir: APP_OUT,
  pngWidth: 1024,
  svgFile: false,
});
emit('favicon', iconSvg('simple', MARK.color, COLORS.chalk, 0.8, 'fv', 48), {
  dir: APP_OUT,
  pngWidth: 48,
  svgFile: false,
});

// Vector geometry for the app: the editor draws the watermarks with Skia from these paths, so
// they stay sharp at any size and export resolution (no raster logo to scale).
const simpleLanes = lanes(LANE_SETS.simple);
const geometry = {
  mark: {
    width: MARK_WIDTH,
    height: MARK_HEIGHT,
    stems: [LEFT_LEG, STEM, RIGHT_LEG].join(' '),
    lanes: simpleLanes.map((l) => band(l.outer, l.inner)),
    gaps: gaps(LANE_SETS.simple).map((g) => band(g.outer, g.inner)),
    lines: band(simpleLanes[0].outer - 1, simpleLanes.at(-1).inner + 1),
  },
  wordmark: {
    minX: WORD_MIN_X,
    top: WORD_TOP,
    width: WORD_WIDTH,
    height: WORD_HEIGHT,
    all: WORD_ALL,
    run: WORD_RUN,
  },
  colors: COLORS,
};
write(
  join(ROOT, 'src', 'editor', 'brand', 'geometry.generated.ts'),
  `// Generated by scripts/brand/build-brand.mjs (npm run brand). Do not edit by hand.
// Monogram (reduced 3-lane version) and wordmark of the AllRun logo, as SVG path data.

export const BRAND_GEOMETRY = ${JSON.stringify(geometry, null, 2)} as const;
`,
);

console.log('Brand assets written to docs/marca/generated, assets/images and src/editor/brand');
