import { activityBlocks, isAppReplica, isDataWidget } from '@/core/activity-block';
import type { Activity } from '@/core/activity';
import type { ActivityDetail } from '@/core/activity-detail';
import { newLayer } from '@/core/default-layout';
import { type FontId, type Layer, newTemplate } from '@/core/template';
import type { LayerContext, PreparedLayer } from '@/editor/template-scene';
import { es } from '@/i18n/locales/es';
import { generateStravaDetail } from '@/sources/fixtures/detail';
import { parseStravaDetail } from '@/sources/strava/detail';

import { makeActivity } from './make-activity';
import type { Scene } from './scene';
import { alphaOutside, DRAWN_ALPHA } from './skia-bounds';
import { loadTestFonts } from './skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from './text-context';

/**
 * What the scene tests of the mixed widgets share: their activities, fonts and labels, and the
 * widgets laid out as the gallery offers them.
 */

/** Spanish labels, the longest of the app's languages. */
export function translate(key: string): string {
  const text = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], es);
  if (typeof text !== 'string') {
    throw new Error(`No text for ${key}`);
  }
  return text;
}

/** Where the activities started, with a long name. */
const PLACE = { city: 'San Sebastián de los Reyes', region: 'Madrid', country: 'España' };

/** The fonts mixed widgets start in. */
export const BLOCK_FONTS: readonly FontId[] = [
  'inter',
  'barlowCondensed',
  'anton',
  'unbounded',
  'bigShoulders',
  'bowlbyOneSC',
  'playfairDisplay',
  'spaceMono',
  'orbitron',
  'graduate',
  'doto',
  'permanentMarker',
];

export const RUN = makeActivity({
  sportType: 'Run',
  distanceMeters: 42_195,
  movingTimeSeconds: 12_345,
});
export const GYM = makeActivity({
  sportType: 'WeightTraining',
  distanceMeters: 0,
  averageSpeed: null,
});

/**
 * Synthetic streams, splits and laps for `activity`, through the same mapping as Strava's; for a
 * run, an interval session, so its laps are drawn too.
 */
function detailOf(activity: Activity): ActivityDetail {
  const { streams, detailed } = generateStravaDetail(activity, 1);
  return parseStravaDetail(JSON.parse(JSON.stringify(streams)), detailed);
}

/** Every block of `activity`, its splits and laps too when it has them, and its place. */
export const blocksOf = (activity: Activity) => {
  const detail = detailOf(activity);
  return activityBlocks(activity, detail.splits.metric.length > 0, true, detail.laps.length > 1);
};

/**
 * The blocks of `activity`, signed with the logo, filled in and measured: each in its own font
 * (see `blockLettering`), or all in `font` as if the user had changed it (but the replicas, which
 * keep their apps' look), slanted when `italic`.
 */
export function prepareBlocks(
  scene: Scene,
  activity: Activity,
  font: FontId | null,
  italic = false,
): PreparedLayer[] {
  const context: LayerContext = {
    data: { mode: 'activity', activity, detail: detailOf(activity), place: PLACE, zones: null },
    fonts: loadTestFonts(
      font === null ? BLOCK_FONTS : [font, ...BLOCK_FONTS.filter((other) => other !== font)],
    ),
    textContext: {
      unit: 'km',
      locale: 'es',
      durationUnits: TEST_DURATION_UNITS,
      unitLabel: testUnitLabel,
    },
    translate,
  };
  const layers = blocksOf(activity).map((block, i): Layer => {
    const layer = newLayer({ kind: 'activityBlock', block }, `block-${i}`, 'story');
    if (layer.kind !== 'activityBlock') {
      throw new Error('Expected a mixed widget');
    }
    return {
      ...layer,
      logo: true,
      style: { ...layer.style, ...(font === null ? {} : { font }), italic },
    };
  });
  return scene.prepareLayers(
    newTemplate({ id: 'blocks', mode: 'activity', format: 'story', layers }),
    context,
  );
}

/** The blocks of `prepared` drawn outside the size they measure, with how much. */
async function overflowing(
  prepared: readonly PreparedLayer[],
): Promise<{ readonly id: string; readonly alpha: number }[]> {
  const found: { readonly id: string; readonly alpha: number }[] = [];
  for (const block of prepared) {
    expect(block.width).toBeGreaterThan(0);
    expect(block.height).toBeGreaterThan(0);
    const alpha = await alphaOutside(block);
    if (alpha > DRAWN_ALPHA) {
      found.push({ id: block.layer.id, alpha });
    }
  }
  return found;
}

/**
 * Registers the test that draws the blocks of `activity` in their own fonts, its data widgets or
 * its creative ones (`which`) or all of them, and checks that nothing is drawn outside the size
 * they measure. Split so that Jest draws them at once.
 */
export function testBlocksInTheirFonts(
  scene: () => Scene,
  name: string,
  activity: Activity,
  which: 'data' | 'creative' | 'all',
): void {
  const what = which === 'all' ? 'block' : `${which} block`;
  it(`draws every ${what} of ${name} in its own font within the size it measures`, async () => {
    const blocks = prepareBlocks(scene(), activity, null);
    expect(blocks).toHaveLength(blocksOf(activity).length);
    const drawn = blocks.filter(
      (block) =>
        which === 'all' ||
        (block.layer.kind === 'activityBlock' &&
          isDataWidget(block.layer.block.design) === (which === 'data')),
    );
    expect(drawn.length).toBeGreaterThan(0);
    expect(await overflowing(drawn)).toEqual([]);
  }, 60_000);
}

/**
 * Registers the test that draws a marathon's blocks in the user's lettering (all in `font`, or
 * each in its own when `null`; slanted when `italic`) and checks that nothing is drawn outside the
 * size they measure; a replica keeps its app's look whatever the lettering, the same size as in
 * its own.
 */
export function testBlocksRestyled(
  scene: () => Scene,
  name: string,
  font: FontId | null,
  italic: boolean,
): void {
  it(`draws every block of a marathon in ${name} within the size it measures`, async () => {
    const own = prepareBlocks(scene(), RUN, null);
    const blocks = prepareBlocks(scene(), RUN, font, italic);
    expect(blocks).toHaveLength(own.length);
    const restyled = blocks.filter((block, i) => {
      if (block.layer.kind === 'activityBlock' && isAppReplica(block.layer.block.design)) {
        expect([block.width, block.height]).toEqual([own[i].width, own[i].height]);
        return false;
      }
      return true;
    });
    expect(await overflowing(restyled)).toEqual([]);
  }, 60_000);
}
