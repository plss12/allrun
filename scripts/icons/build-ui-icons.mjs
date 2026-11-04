// Builds the icons of the interface (src/ui/icons/ui-icons.generated.ts): the same on every phone,
// where the system's differ (SF Symbols on iOS, Material on Android), and each centered in its box
// by its own shape, which a test checks. Most are Material Symbols (Rounded, weight 500, outlined)
// by Google, under the Apache License 2.0
// (https://github.com/google/material-design-icons/blob/master/LICENSE); a few are drawn here.
//
// Usage: npm run icons   (needs network; writes the generated file, which is committed)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit.js';
import { format, resolveConfig } from 'prettier';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'ui', 'icons', 'ui-icons.generated.ts');

const SOURCE = 'https://raw.githubusercontent.com/google/material-design-icons/master/symbols/web';

/** The side of an icon's box: Material Symbols' 960 units, here from 0 to 960 both ways. */
const BOX = 960;

/** The icons taken from Material Symbols, by their names in the app. */
const SYMBOLS = {
  close: 'close',
  back: 'arrow_back_ios_new',
  chevronLeft: 'chevron_left',
  chevronRight: 'chevron_right',
  undo: 'undo',
  redo: 'redo',
  check: 'check',
  add: 'add',
  trash: 'delete',
  photos: 'photo_library',
  copy: 'content_copy',
  duplicate: 'library_add',
  more: 'more_horiz',
  opacity: 'opacity',
  size: 'signal_cellular_alt',
  lineWidth: 'line_weight',
  corners: 'rounded_corner',
  depth: 'background_replace',
  bringToFront: 'flip_to_front',
  sendToBack: 'flip_to_back',
  refresh: 'refresh',
  edit: 'edit',
  eyedropper: 'colorize',
  backdrop: 'format_color_fill',
  paint: 'format_paint',
  caps: 'match_case',
  bold: 'format_bold',
  italic: 'format_italic',
  alignLeft: 'format_align_left',
  alignCenter: 'format_align_center',
  alignRight: 'format_align_right',
  filter: 'filter_list',
  calendar: 'calendar_month',
};

/**
 * Strokes as thick as those of the symbols. Drawn here (decision of the user): saving and exporting
 * as a pair, the same tray and the same arrow, in and out.
 */
const STROKE = 80;
const TRAY = 'M200 620 V720 Q200 800 280 800 H680 Q760 800 760 720 V620';
const DRAWN = {
  save: [TRAY, 'M480 160 V630', 'M310 460 L480 630 L650 460'],
  export: [TRAY, 'M480 630 V160', 'M310 330 L480 160 L650 330'],
};

/** A rounded rectangle as a path. */
function rounded(left, top, right, bottom, radius) {
  return (
    `M${left + radius} ${top} H${right - radius} Q${right} ${top} ${right} ${top + radius} ` +
    `V${bottom - radius} Q${right} ${bottom} ${right - radius} ${bottom} ` +
    `H${left + radius} Q${left} ${bottom} ${left} ${bottom - radius} ` +
    `V${top + radius} Q${left} ${top} ${left + radius} ${top} Z`
  );
}

/**
 * The same, the other way around: inside a shape it is a hole. An operation on paths would give a
 * fill rule that an SVG path doesn't keep, and its holes came out filled.
 */
function hole(left, top, right, bottom, radius) {
  return (
    `M${left + radius} ${top} Q${left} ${top} ${left} ${top + radius} ` +
    `V${bottom - radius} Q${left} ${bottom} ${left + radius} ${bottom} ` +
    `H${right - radius} Q${right} ${bottom} ${right} ${bottom - radius} ` +
    `V${top + radius} Q${right} ${top} ${right - radius} ${top} Z`
  );
}

/**
 * Drawn here too (decision of the user): a frame split in panes that touch, its walls as thick as
 * the strokes. Four for the collages; for the designs, two on the left and a tall one on the right.
 */
const GRID_FRAME = rounded(120, 120, 840, 840, 120);
const NEAR = [200, 440];
const FAR = [520, 760];
const pane = (x, y) => hole(x[0], y[0], x[1], y[1], 32);
const GRIDS = {
  collages: [pane(NEAR, NEAR), pane(FAR, NEAR), pane(NEAR, FAR), pane(FAR, FAR)],
  designs: [pane(NEAR, NEAR), pane(NEAR, FAR), hole(FAR[0], NEAR[0], FAR[1], FAR[1], 32)],
};

/**
 * Icons that point sideways, by where they point (-1 left, 1 right). A chevron has its weight on its
 * open side: with its box in the middle of a button it looks off toward that side (decision of the
 * user), so it goes by the middle of the triangle around it, as a play button does. That middle is
 * a third of its width from the open side, so its box ends up a sixth of its width toward its point.
 */
const POINTING = { back: -1, chevronLeft: -1, chevronRight: 1 };

/** Icons that are another symbol in a mirror: starting over turns the other way from refreshing. */
const MIRRORED = { restart: 'refresh' };

async function fetchSymbol(symbol) {
  const url = `${SOURCE}/${symbol}/materialsymbolsrounded/${symbol}_wght500_24px.svg`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Couldn't fetch ${url}: ${response.status}`);
  }
  const svg = await response.text();
  if (!svg.includes('viewBox="0 -960 960 960"')) {
    throw new Error(`Unexpected viewBox in ${url}`);
  }
  const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);
  if (paths.length === 0) {
    throw new Error(`No path in ${url}`);
  }
  return paths.join(' ');
}

const CanvasKit = await CanvasKitInit();

/**
 * `path` moved so that its shape's middle is the box's (see `POINTING` for those that point), and
 * written with tenths of a unit.
 */
function centered(path, pointing = 0) {
  const [left, top, right, bottom] = path.computeTightBounds();
  const shift = (pointing * (right - left)) / 6;
  const moved = new CanvasKit.PathBuilder(path)
    .transform(
      CanvasKit.Matrix.translated(
        BOX / 2 + shift - (left + right) / 2,
        BOX / 2 - (top + bottom) / 2,
      ),
    )
    .detachAndDelete();
  const svg = moved
    .toSVGString()
    .replace(/-?\d+\.\d+/g, (number) => String(Math.round(Number(number) * 10) / 10));
  moved.delete();
  return svg;
}

const entries = [];
for (const [id, symbol] of Object.entries(SYMBOLS)) {
  const path = CanvasKit.Path.MakeFromSVGString(await fetchSymbol(symbol));
  entries.push([id, symbol, centered(path, POINTING[id])]);
  path.delete();
}
for (const [id, symbol] of Object.entries(MIRRORED)) {
  const path = CanvasKit.Path.MakeFromSVGString(await fetchSymbol(symbol));
  const mirrored = new CanvasKit.PathBuilder(path)
    .transform(CanvasKit.Matrix.scaled(-1, 1))
    .detachAndDelete();
  entries.push([id, `${symbol}, in a mirror`, centered(mirrored)]);
  path.delete();
  mirrored.delete();
}
for (const [id, strokes] of Object.entries(DRAWN)) {
  const outlines = strokes.map((stroke) =>
    CanvasKit.Path.MakeFromSVGString(stroke).makeStroked({
      width: STROKE,
      cap: CanvasKit.StrokeCap.Round,
      join: CanvasKit.StrokeJoin.Round,
    }),
  );
  const joined = outlines
    .slice(1)
    .reduce(
      (all, outline) => CanvasKit.Path.MakeFromOp(all, outline, CanvasKit.PathOp.Union),
      outlines[0],
    );
  entries.push([id, 'drawn for AllRun', centered(joined)]);
}
for (const [id, panes] of Object.entries(GRIDS)) {
  const grid = CanvasKit.Path.MakeFromSVGString([GRID_FRAME, ...panes].join(' '));
  entries.push([id, 'drawn for AllRun', centered(grid)]);
  grid.delete();
}
entries.sort(([a], [b]) => a.localeCompare(b));

const source = `// Generated by scripts/icons/build-ui-icons.mjs (npm run icons). Do not edit.

/** The side of an icon's box. */
export const UI_ICON_SIZE = ${BOX};

/** The icons of the interface, as SVG paths in that box, each centered by its own shape. */
export const UI_ICON_PATHS = {
${entries.map(([id, origin, path]) => `  // ${origin}\n  ${id}: '${path}',`).join('\n')}
} as const;

export type UiIconName = keyof typeof UI_ICON_PATHS;
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, await format(source, { ...(await resolveConfig(OUT)), filepath: OUT }));
console.log(`Wrote ${entries.length} icons to ${OUT}`);
