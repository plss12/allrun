// Builds the sport icons: the paths Skia draws into images and on screen
// (src/editor/icons/sport-icons.generated.ts). Trail running and mountain biking have icons of
// our own: the runner's and the bike's symbols over an uneven ground rising to the right, joined
// into one path with CanvasKit. Also the paths of the few icons the replicas of apps draw besides
// their own marks (a streak's flame, the weather's location arrow and its moon for a day of rest,
// the things the equivalences compare with), into images only.
//
// The icons are Material Symbols (Outlined, filled, weight 400) by Google, under the Apache
// License 2.0 (https://github.com/google/material-design-icons/blob/master/LICENSE). SF Symbols
// can't be drawn into an exported image, so the whole app uses these instead: the same icons on
// screen as in the images (ADR 009).
//
// Usage: npm run icons   (needs network; writes the generated files, which are committed)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit.js';
import { format, resolveConfig } from 'prettier';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'editor', 'icons', 'sport-icons.generated.ts');

const SOURCE = 'https://raw.githubusercontent.com/google/material-design-icons/master/symbols/web';

/**
 * Icon of each sport family, plus hiking, which has a symbol of its own, and all sports together
 * (only on screen, in the filter). Trail running and mountain biking are composed (`ON_GROUND`).
 */
const ICONS = {
  run: 'directions_run',
  ride: 'directions_bike',
  walk: 'directions_walk',
  hike: 'hiking',
  swim: 'pool',
  training: 'fitness_center',
  other: 'sports',
  all: 'apps',
};

/**
 * The ground of the trail and mountain icons, drawn for AllRun: low bumps on the left rising to a
 * rounded peak on the right, in the symbols' square.
 */
const GROUND =
  'M0 0 L0 -60 C40 -100 90 -100 135 -78 C185 -55 235 -62 285 -98 C335 -134 395 -126 445 -100 C505 -70 565 -88 615 -135 C665 -182 725 -175 775 -205 C825 -235 855 -320 892 -330 C928 -338 948 -290 960 -245 L960 0 Z';

/**
 * Icons composed over the ground: a symbol scaled and moved onto it (its foot or wheels sunk in
 * a little, with no air under them), and turned around `pivot` to follow the slope.
 */
const ON_GROUND = {
  trailRun: { symbol: 'directions_run', scale: 0.82, translate: [60, -20] },
  mountainBike: {
    symbol: 'directions_bike',
    scale: 0.8,
    translate: [40, 24],
    rotate: { degrees: -10, pivot: [200, -80] },
  },
};

/** Icons the replicas of apps draw into images, by their name in `APP_ICON_PATHS`. */
const APP_ICONS = {
  flame: 'local_fire_department',
  location: 'near_me',
  rest: 'bedtime',
  // The things a widget of equivalences compares a distance, a climb, a time or calories with.
  track: 'stadium',
  boat: 'directions_boat',
  city: 'location_city',
  finish: 'sports_score',
  route: 'route',
  globe: 'public',
  stairs: 'stairs',
  building: 'apartment',
  mountain: 'landscape',
  song: 'music_note',
  football: 'sports_soccer',
  movie: 'movie',
  beer: 'sports_bar',
  burger: 'lunch_dining',
  pizza: 'local_pizza',
};

async function fetchPath(symbol) {
  const url = `${SOURCE}/${symbol}/materialsymbolsoutlined/${symbol}_fill1_24px.svg`;
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

const entries = [];
for (const [id, symbol] of Object.entries(ICONS)) {
  // One line per path, as Prettier leaves them: a string longer than the line can't wrap.
  entries.push(`  // ${symbol}\n  ${id}: '${await fetchPath(symbol)}',`);
}

const CanvasKit = await CanvasKitInit();
for (const [id, { symbol, scale, translate, rotate }] of Object.entries(ON_GROUND)) {
  const symbolPath = CanvasKit.Path.MakeFromSVGString(await fetchPath(symbol));
  const ground = CanvasKit.Path.MakeFromSVGString(GROUND);
  const placed = CanvasKit.Matrix.multiply(
    CanvasKit.Matrix.translated(...translate),
    CanvasKit.Matrix.scaled(scale, scale),
  );
  // Paths are immutable: a builder copies the symbol to move it.
  const figure = new CanvasKit.PathBuilder(symbolPath)
    .transform(
      rotate === undefined
        ? placed
        : CanvasKit.Matrix.multiply(
            CanvasKit.Matrix.rotated((rotate.degrees * Math.PI) / 180, ...rotate.pivot),
            placed,
          ),
    )
    .detachAndDelete();
  // One filled shape: the union keeps the wheels' and the figure's holes where the ground isn't.
  const joined = CanvasKit.Path.MakeFromOp(figure, ground, CanvasKit.PathOp.Union);
  // Tenths of a unit are far below a pixel at any size the app draws.
  const path = joined
    .toSVGString()
    .replace(/-?\d+\.\d+/g, (number) => String(Math.round(Number(number) * 10) / 10));
  entries.push(`  // ${symbol} over the ground\n  ${id}: '${path}',`);
  [symbolPath, figure, ground, joined].forEach((each) => each.delete());
}

const appEntries = [];
for (const [id, symbol] of Object.entries(APP_ICONS)) {
  appEntries.push(`  // ${symbol}\n  ${id}: '${await fetchPath(symbol)}',`);
}

const source = `// Generated by scripts/icons/build-sport-icons.mjs (npm run icons). Do not edit.
//
// Material Symbols by Google, Outlined, filled, weight 400, under the Apache License 2.0:
// https://github.com/google/material-design-icons/blob/master/LICENSE

/** Side of the square every icon is drawn in, in the units of its path. */
export const SPORT_ICON_SIZE = 960;

/**
 * SVG path of each sport's icon (and of all sports together), in a ${'`'}SPORT_ICON_SIZE${'`'} square
 * whose top-left corner is at (0, -${'`'}SPORT_ICON_SIZE${'`'}), as Material Symbols draws them.
 */
export const SPORT_ICON_PATHS = {
${entries.join('\n')}
} as const;

/** SVG path of each icon a replica of an app draws, in the same square as the sports' icons. */
export const APP_ICON_PATHS = {
${appEntries.join('\n')}
} as const;
`;

mkdirSync(dirname(OUT), { recursive: true });
// Formatted as the rest of the code, so the lint (which runs Prettier) passes.
writeFileSync(OUT, await format(source, { ...(await resolveConfig(OUT)), filepath: OUT }));
console.log(`Wrote ${OUT}`);
