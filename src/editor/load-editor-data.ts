import { availableActivityCharts } from '@/core/activity-charts';
import { customRange } from '@/core/dates';
import { activityCatalog, type CatalogSection, summaryCatalog } from '@/core/layer-catalog';
import { bucketForPeriod, isCurrentPeriod } from '@/core/periods';
import { selectActivities, summarize } from '@/core/summary';
import type { DistanceUnit } from '@/core/units';
import type { ActivitySource } from '@/sources/activity-source';
import { logError } from '@/ui/log';
import { todayLocal } from '@/ui/today';

import type { EditorData } from './editor-data';
import type { EditorRequest } from './editor-params';

/** The activity asked for isn't there. */
export class ActivityNotFoundError extends Error {}

/**
 * Loads what the editor fills its design with.
 *
 * @throws ActivityNotFoundError for an activity that isn't there; the source's errors otherwise.
 */
export async function loadEditorData(
  source: ActivitySource,
  params: EditorRequest,
): Promise<EditorData> {
  if (params.mode === 'activity') {
    // The charts' data comes along; without it the editor still works, just without charts.
    const [activity, detail, zones] = await Promise.all([
      source.getActivity(params.activityId),
      source.getActivityDetail(params.activityId).catch((error: unknown) => {
        logError('Could not load the activity detail for its charts', error);
        return null;
      }),
      // Without them the heart rate chart just has no zones.
      source.getHeartRateZones().catch((error: unknown) => {
        logError('Could not load the heart rate zones', error);
        return null;
      }),
    ]);
    if (activity === null) {
      throw new ActivityNotFoundError(`No activity with id ${params.activityId}`);
    }
    // Its place is named once the editor is open: it doesn't hold up the loading.
    return { mode: 'activity', activity, detail, place: null, zones };
  }
  const range = customRange(params.start, params.end);
  const activities = await source.listInRange(range);
  const filter = params.families.length === 0 ? {} : { families: params.families };
  const selected = selectActivities(activities, range, filter);
  return {
    mode: 'summary',
    kind: params.kind,
    summary: summarize(selected, range),
    activities: selected,
    bucketSize: bucketForPeriod(params.kind, range),
    families: params.families,
    current: isCurrentPeriod(params.kind, range, todayLocal()),
  };
}

/**
 * The widgets on offer for `data`, in the catalog's sections.
 *
 * @param withPlace - Whether the place widgets are offered: its name is known, or can be asked for.
 */
export function catalogFor(
  data: EditorData,
  unit: DistanceUnit,
  withPlace: boolean,
): CatalogSection[] {
  return data.mode === 'activity'
    ? activityCatalog(
        data.activity,
        data.detail === null ? [] : availableActivityCharts(data.detail, unit),
        withPlace,
        data.zones !== null,
        data.detail !== null && data.detail.laps.length > 1,
      )
    : summaryCatalog(data.summary, data.bucketSize);
}
