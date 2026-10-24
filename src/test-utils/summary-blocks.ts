import { monthRange, weekRange, yearRange } from '@/core/dates';
import { newLayer } from '@/core/default-layout';
import { bucketForPeriod, type PeriodKind } from '@/core/periods';
import { summarize } from '@/core/summary';
import { isSummaryDataWidget, summaryBlockLettering, summaryBlocks } from '@/core/summary-block';
import type { Layer, SummaryBlock } from '@/core/template';
import type { SummaryData } from '@/editor/editor-data';
import type { LayerContext, PreparedLayer } from '@/editor/template-scene';
import { FixtureActivitySource } from '@/sources/fixtures/fixture-source';

import { translate } from './activity-blocks';
import { alphaOutside, DRAWN_ALPHA } from './skia-bounds';
import type { Scene } from './scene';
import { loadTestFonts } from './skia-fonts';
import { TEST_DURATION_UNITS, testUnitLabel } from './text-context';

/**
 * What the scene tests of a period summary's widgets share: their periods, and the widgets laid
 * out and checked as the gallery offers them.
 */

const source = new FixtureActivitySource({ endDate: '2026-10-21', days: 400, seed: 42 });

/** A summary of the period of `kind` around 2026, of every sport, as the editor loads it. */
export async function periodData(kind: Exclude<PeriodKind, 'custom'>): Promise<SummaryData> {
  const range =
    kind === 'week'
      ? weekRange('2026-10-14')
      : kind === 'month'
        ? monthRange('2026-09-01')
        : yearRange('2025-06-01');
  const activities = await source.listInRange(range);
  return {
    mode: 'summary',
    kind,
    summary: summarize(activities, range),
    activities,
    bucketSize: bucketForPeriod(kind, range),
    families: [],
    current: true,
  };
}

/** How the summaries' scene tests write data: in Spanish, the longest of the app's languages. */
export const SUMMARY_TEXT_CONTEXT: LayerContext['textContext'] = {
  unit: 'km',
  locale: 'es',
  durationUnits: TEST_DURATION_UNITS,
  unitLabel: testUnitLabel,
};

/**
 * The layers of `blocks` signed with the logo, each also on a backdrop when `backdrop`, filled
 * with `data` in their own fonts and measured; and those that draw outside the size they measure
 * (the editor grabs, frames and snaps a widget by it), with how much.
 */
export async function overflowingSummaryBlocks(
  scene: Scene,
  data: SummaryData,
  blocks: readonly SummaryBlock[],
  backdrop: boolean,
): Promise<{
  readonly prepared: readonly PreparedLayer[];
  readonly layers: readonly Layer[];
  readonly overflowing: readonly { readonly id: string; readonly alpha: number }[];
}> {
  const layers = blocks.flatMap((block, i): Layer[] => {
    const layer = newLayer({ kind: 'summaryBlock', block }, `block-${i}`, 'story');
    if (layer.kind !== 'summaryBlock') {
      throw new Error('Expected a summary widget');
    }
    const signed = { ...layer, logo: true };
    return backdrop
      ? [signed, { ...signed, id: `${layer.id}-soft`, style: { ...layer.style, backdrop: 'soft' } }]
      : [signed];
  });
  const prepared = scene.prepareLayers(
    { version: 1, id: 'blocks', mode: 'summary', format: 'story', layers },
    {
      data,
      fonts: loadTestFonts(blocks.map((block) => summaryBlockLettering(block).font)),
      textContext: SUMMARY_TEXT_CONTEXT,
      translate,
    },
  );
  const overflowing: { readonly id: string; readonly alpha: number }[] = [];
  for (const block of prepared) {
    const alpha = await alphaOutside(block);
    if (alpha > DRAWN_ALPHA) {
      overflowing.push({ id: block.layer.id, alpha });
    }
  }
  return { prepared, layers, overflowing };
}

/**
 * Registers the test that draws every data widget (bare and on a backdrop) or every creative
 * widget of a `kind` period off-screen with real fonts, and checks that nothing is drawn outside
 * the size it measures. One period a file: Jest draws the files at once.
 */
export function testSummaryWidgets(
  scene: () => Scene,
  kind: Exclude<PeriodKind, 'custom'>,
  widgets: 'data' | 'creative',
): void {
  const data = widgets === 'data';
  it(`draws every ${widgets} widget of a ${kind} within the size it measures${data ? ', bare and on a backdrop' : ''}`, async () => {
    const period = await periodData(kind);
    const blocks = summaryBlocks(period.summary).filter(
      (block) => isSummaryDataWidget(block.design) === data,
    );
    if (data) {
      // A period of every sport offers them all.
      expect(blocks.map((block) => block.design)).toEqual(
        expect.arrayContaining(['periodData', 'periodTable', 'periodSports']),
      );
    } else {
      expect(blocks.length).toBeGreaterThan(0);
    }
    const { prepared, layers, overflowing } = await overflowingSummaryBlocks(
      scene(),
      period,
      blocks,
      data,
    );
    expect(prepared).toHaveLength(layers.length);
    expect(overflowing).toEqual([]);
  }, 60_000);
}
