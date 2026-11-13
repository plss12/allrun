import type { Activity } from '@/core/activity';
import type { ActivityDetail } from '@/core/activity-detail';
import type { DateRange } from '@/core/dates';
import type { HeartRateZones } from '@/core/heart-rate-zones';
import { withRoutePrivacy } from '@/core/route-privacy';

import type { ActivitySource } from './activity-source';

/**
 * `source` with the start and end of every route hidden, `meters` of each (the profile's setting,
 * ADR 019): where activities come into the app, so that no screen, gallery or exported image shows
 * them whole. A detail holds no coordinates, and passes as it is.
 */
export class PrivateRoutesSource implements ActivitySource {
  constructor(
    private readonly source: ActivitySource,
    private readonly meters: number,
  ) {}

  private hide(activity: Activity): Activity {
    return withRoutePrivacy(activity, this.meters);
  }

  async listRecent(limit: number): Promise<Activity[]> {
    return (await this.source.listRecent(limit)).map((activity) => this.hide(activity));
  }

  async listBefore(startUtc: string, limit: number): Promise<Activity[]> {
    return (await this.source.listBefore(startUtc, limit)).map((activity) => this.hide(activity));
  }

  async listInRange(range: DateRange): Promise<Activity[]> {
    return (await this.source.listInRange(range)).map((activity) => this.hide(activity));
  }

  async getActivity(id: string): Promise<Activity | null> {
    const activity = await this.source.getActivity(id);
    return activity === null ? null : this.hide(activity);
  }

  getActivityDetail(id: string): Promise<ActivityDetail | null> {
    return this.source.getActivityDetail(id);
  }

  getHeartRateZones(): Promise<HeartRateZones | null> {
    return this.source.getHeartRateZones();
  }

  getAthletePhoto(): Promise<string | null> {
    return this.source.getAthletePhoto();
  }
}
