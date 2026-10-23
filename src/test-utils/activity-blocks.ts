import { activityBlocks } from '@/core/activity-block';
import type { Activity } from '@/core/activity';
import type { ActivityDetail } from '@/core/activity-detail';
import { newLayer } from '@/core/default-layout';
import type { FontId, Layer } from '@/core/template';
import type { LayerContext, PreparedLayer } from '@/editor/template-scene';
import { es } from '@/i18n/locales/es';
import { generateStravaDetail } from '@/sources/fixtures/detail';
import { parseStravaDetail } from '@/sources/strava/detail';

import { makeActivity } from './make-activity';
import { loadTestFonts } from './skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from './text-context';

/**
 * What the scene tests of the mixed widgets share: their activities, fonts and labels, and the
 * widgets laid out as the gallery offers them.
 */

/** The scene module, loaded by each test once CanvasKit is (see `template-scene.test.tsx`). */
type Scene = typeof import('@/editor/template-scene');

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
    { version: 1, id: 'blocks', mode: 'activity', format: 'story', layers },
    context,
  );
}
