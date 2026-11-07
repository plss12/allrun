import type { Place } from '@/core/place';
import { makeActivity } from '@/test-utils/make-activity';

import type { EditorData } from './editor-data';
import { galleryData } from './gallery-place';

const activity = { mode: 'activity', activity: makeActivity(), detail: null, place: null } as const;
const sample: Place = { city: 'Sample', region: 'Region', country: 'Country' };
const there: Place = { city: 'Andújar', region: 'Jaén', country: 'España' };

describe('galleryData', () => {
  it('writes the place when named, and a sample while it needs a permission', () => {
    const data = activity as unknown as EditorData;
    expect(galleryData(data, { status: 'known', place: there }, sample)).toEqual({
      ...activity,
      place: there,
    });
    expect(galleryData(data, { status: 'needsPermission' }, sample)).toEqual({
      ...activity,
      place: sample,
    });
    expect(galleryData(data, { status: 'unknown' }, sample)).toBe(data);
  });

  it('leaves a period as it is', () => {
    const period = { mode: 'summary' } as unknown as EditorData;
    expect(galleryData(period, { status: 'known', place: there }, sample)).toBe(period);
  });
});
