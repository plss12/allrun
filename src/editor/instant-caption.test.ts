import { weekRange } from '@/core/dates';
import { summarize } from '@/core/summary';
import { makeActivity } from '@/test-utils/make-activity';
import { TEST_DURATION_UNITS, testUnitLabel } from '@/test-utils/text-context';

import type { ActivityData, SummaryData, TextContext } from './editor-data';
import { instantCaption } from './instant-caption';

const context: TextContext = {
  unit: 'km',
  locale: 'es',
  durationUnits: TEST_DURATION_UNITS,
  unitLabel: testUnitLabel,
};

/** Spanish labels, their placeholders filled. */
function translate(key: string, values: Readonly<Record<string, string>> = {}): string {
  const labels: Readonly<Record<string, string>> = {
    'widgets.verified.km': '{{value}} kilómetros',
    'widgets.verified.mi': '{{value}} millas',
    'widgets.playlist.counts.all.one': '1 actividad',
    'widgets.playlist.counts.all.other': '{{count}} actividades',
    'widgets.playlist.counts.run.other': '{{count}} carreras',
    thisWeek: 'Esta semana',
  };
  const label = labels[key] ?? key;
  return label.replace(/\{\{(\w+)\}\}/gu, (_, name: string) => values[name] ?? '');
}

const run = makeActivity({
  sportType: 'Run',
  localDate: '2026-10-30',
  startLocal: '2026-10-30T08:55:00',
  distanceMeters: 11_340,
  movingTimeSeconds: 4020,
  averageSpeed: 11_340 / 4020,
});
const runData: ActivityData = {
  mode: 'activity',
  activity: run,
  detail: null,
  place: null,
  zones: null,
};

describe('instantCaption of an activity', () => {
  it('writes where it started over its distance in words, with one decimal', () => {
    const named: ActivityData = {
      ...runData,
      place: { city: 'Andújar', region: 'Jaén', country: 'España' },
    };
    expect(instantCaption('place', named, context, translate)).toEqual({
      columns: [['Andújar, Jaén', '11,3 kilómetros']],
      // The city alone, for a place too long to write in full.
      shorterFirst: 'Andújar',
    });
  });

  it('writes its date instead of a place it cannot name', () => {
    expect(instantCaption('place', runData, context, translate).columns[0][0]).toBe('30 oct');
  });

  it('writes its time without a distance', () => {
    const gym = makeActivity({ sportType: 'Workout', distanceMeters: 0, movingTimeSeconds: 3240 });
    const data: ActivityData = { ...runData, activity: gym };
    expect(instantCaption('place', data, context, translate).columns[0][1]).toBe('54min');
  });

  it('writes its date and start time, then its two main data in its sport order', () => {
    expect(instantCaption('data', runData, context, translate)).toEqual({
      columns: [
        ['30 oct', '8:55'],
        ['11,3 km', '5:54/km'],
      ],
    });
  });

  it('writes miles and the English decimal point', () => {
    const miles = { ...context, unit: 'mi', locale: 'en' } as const;
    expect(instantCaption('place', runData, miles, translate).columns[0][1]).toBe('7.0 millas');
  });
});

describe('instantCaption of a period', () => {
  const range = weekRange('2026-10-14');
  const runs = ['2026-10-13', '2026-10-15'].map((localDate) =>
    makeActivity({ sportType: 'Run', localDate, distanceMeters: 10_250, movingTimeSeconds: 3600 }),
  );
  const week: SummaryData = {
    mode: 'summary',
    kind: 'week',
    summary: summarize(runs, range),
    activities: runs,
    bucketSize: 'day',
    families: [],
    current: false,
  };

  it('writes its name over its total distance in words', () => {
    const [[name, total]] = instantCaption('place', week, context, translate).columns;
    expect(name).toContain('oct');
    expect(total).toBe('20,5 kilómetros');
    const current = { ...week, current: true };
    expect(instantCaption('place', current, context, translate).columns[0][0]).toBe('Esta semana');
  });

  it('writes its dates and how many activities, then its total distance and time', () => {
    expect(instantCaption('data', week, context, translate).columns).toEqual([
      ['12–18 oct', '2 actividades'],
      ['20,5 km', '2h'],
    ]);
    // Named by its sport when it is of one.
    const running = { ...week, families: ['run'] } as const;
    expect(instantCaption('data', running, context, translate).columns[0][1]).toBe('2 carreras');
  });
});
