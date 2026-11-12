import { decodePolyline } from '@/core/polyline';
import { pathLengthMeters } from '@/core/geo';

import { FixtureActivitySource } from './fixtures/fixture-source';
import { PrivateRoutesSource } from './private-routes-source';

const source = new FixtureActivitySource({ endDate: '2026-11-12', days: 60, seed: 1 });
const length = (polyline: string | null) =>
  polyline === null ? 0 : pathLengthMeters(decodePolyline(polyline));

describe('PrivateRoutesSource', () => {
  it('hides the ends of every route it lists, a kilometre less each', async () => {
    const whole = await source.listRecent(20);
    const hidden = await new PrivateRoutesSource(source, 500).listRecent(20);
    expect(hidden.map(({ id }) => id)).toEqual(whole.map(({ id }) => id));
    whole.forEach((activity, index) => {
      const kept = hidden[index].routePolyline;
      if (activity.routePolyline === null || kept === null) {
        return;
      }
      expect(length(kept)).toBeCloseTo(length(activity.routePolyline) - 1000, -1);
    });
    expect(whole.some(({ routePolyline }) => routePolyline !== null)).toBe(true);
  });

  it('hides them in a range and in a single activity as well', async () => {
    const [first] = await source.listRecent(1);
    const one = await new PrivateRoutesSource(source, 200).getActivity(first.id);
    expect(length(one?.routePolyline ?? null)).toBeLessThan(length(first.routePolyline));
    const range = { start: '2026-11-01', end: '2026-11-12' } as const;
    const all = await new PrivateRoutesSource(source, 200).listInRange(range);
    expect(all).toHaveLength((await source.listInRange(range)).length);
  });
});
