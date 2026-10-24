import { decodePolyline } from '@/core/polyline';
import { DEFAULT_PRIVACY_TRIM_METERS, trimRouteEnds } from '@/core/route-privacy';
import { projectRoutes } from '@/core/route-projection';
import { sportIcon } from '@/core/activity-block';
import {
  listsNoteActivities,
  mainFamily,
  periodSentencePlan,
  playlistSongs,
} from '@/core/summary-block';
import { toDisplaySummaryMetric } from '@/core/summary-metrics';
import { durationParts } from '@/core/units';
import { formatActivityDate, formatMetric } from '@/ui/format';
import type { BRAND_COVERS, SummaryBlock } from '@/core/template';

import {
  appTextBox,
  type BlockContext,
  type Box,
  BRAND_COVER_COLORS,
  column,
  COVER_ROUTE,
  fillBox,
  hairlineBox,
  MUSIC_COLORS,
  placed,
  routeBox,
  widened,
  discBox,
  highlightedSentenceBox,
  markedPart,
  noteBox,
  NOTES_COLORS,
  NOTES_SIZES,
  noteSportBox,
  iconBox,
  overlay,
  row,
  type SentencePart,
  sentenceParts,
  symbolBox,
} from './activity-blocks';
import { metricText, periodName, periodNoteLines, type SummaryData } from './editor-data';

/**
 * The creative widgets of a period summary (R2c): replicas of apps, as an activity's (see
 * `activity-blocks.tsx`), in the apps' own fonts and colors, with the period's data.
 */

/**
 * A checklist's box beside each line of a note: its diameter, a share of the line's size; an
 * empty one's ring, a share of its diameter; the room after it, a share of the line's size. A
 * day's sports' icons after it, and the room before and between them, shares of its size too.
 */
const NOTE_CHECK = { size: 0.95, ring: 0.08, gap: 0.45, icon: 0.95, iconGap: 0.2 } as const;

/** The ring of a box not ticked off yet, in the Notes' dark and light mode. */
const NOTE_RING = { dark: '#5E5E62', light: '#C7C7CC' } as const;

/**
 * A period's note of the iPhone's Notes, as a checklist of what it got done (see
 * `periodNoteLines`): its name as the title (and its sport at the end of the bar, as an activity's
 * note, when it is of one), and a line per activity, or per day, week or month, each ticked off in
 * the accent's round box or left empty, the longest in the accent, a day with its sports' icons. A
 * period
 * whose activities a note doesn't list (see `listsNoteActivities`) lists its days, weeks or months
 * instead (a design saved with a week's activities, used for a year).
 */
export function periodNotesBox(
  block: Extract<SummaryBlock, { design: 'periodNotes' }>,
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box {
  const colors = NOTES_COLORS[block.layout];
  const size = NOTES_SIZES.row;
  const diameter = size * NOTE_CHECK.size;
  const rows =
    block.rows === 'activities' && listsNoteActivities(data.summary) ? 'activities' : 'buckets';
  const lines = periodNoteLines(data, rows, textContext, translate).map((line) => {
    const check = line.checked
      ? overlay(discBox(diameter / 2, colors.accent), symbolBox('check', diameter, colors.page))
      : discBox(diameter / 2, NOTE_RING[block.layout], diameter * NOTE_CHECK.ring);
    const ink = line.highlighted ? colors.accent : colors.ink;
    const text = appTextBox(fonts, [{ text: line.text, size, bold: false }], ink);
    const icons = line.sports.map((sport) => iconBox(sport, size * NOTE_CHECK.icon, ink));
    return row(
      [
        check,
        icons.length === 0
          ? text
          : row([text, row(icons, size * NOTE_CHECK.iconGap, 'center')], size * 0.3, 'center'),
      ],
      size * NOTE_CHECK.gap,
      'center',
    );
  });
  const [sport] = data.families;
  return noteBox(
    fonts,
    block.layout,
    periodName(data, textContext, translate),
    lines,
    data.families.length === 1
      ? noteSportBox(fonts, block.layout, translate(`families.${sport}`), sport)
      : undefined,
  );
}

/**
 * A period as a sentence typed on paper, as an activity's, its totals highlighted (see
 * `periodSentencePlan`): "Esta semana: 94,23 kilómetros y 7h 18min en movimiento en 6
 * actividades." Its distance in words, and its time down to its minutes.
 */
export function periodSentenceBox(
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box {
  const { summary } = data;
  const plan = periodSentencePlan(summary);
  const distance = formatMetric(
    toDisplaySummaryMetric('totalDistance', summary.totalDistanceMeters, textContext.unit),
    textContext.locale,
  );
  const values: Readonly<Record<string, SentencePart>> = {
    period: { text: periodName(data, textContext, translate), marked: false },
    distance: markedPart(
      distance.unit === 'km' || distance.unit === 'mi'
        ? translate(`widgets.verified.${distance.unit}`, { value: distance.value })
        : distance.value,
    ),
    time: markedPart(
      durationParts(summary.totalMovingTimeSeconds, 'minutes')
        .map(({ amount, unit }) => `${amount}${textContext.durationUnits[unit]}`)
        .join(' '),
    ),
    count: markedPart(
      summary.activityCount === 1
        ? translate('widgets.periodSentence.activityOne')
        : translate('widgets.periodSentence.activities', { number: String(summary.activityCount) }),
    ),
  };
  return highlightedSentenceBox(
    fonts,
    sentenceParts(
      (holders) => [
        translate('widgets.periodSentence.opening', holders),
        translate(`widgets.periodSentence.leads.${plan.lead}`, holders),
        ...plan.clauses.map((clause) =>
          translate(`widgets.periodSentence.clauses.${clause}`, holders),
        ),
        translate('widgets.sentence.end'),
      ],
      values,
    ),
  );
}

/**
 * Routes overlaid in a `width` × `height` box, on one shared scale so they keep their places and
 * sizes, without their privacy-trimmed ends, their lines `stroke` wide; `null` when none has two
 * points. In the block's color, or in a replica's own `color`. Time O(p) for p points.
 */
export function routesBox(
  polylines: readonly string[],
  width: number,
  height: number,
  stroke: number,
  color?: string,
): Box | null {
  const routes = projectRoutes(
    polylines.map((polyline) =>
      trimRouteEnds(decodePolyline(polyline), DEFAULT_PRIVACY_TRIM_METERS),
    ),
    width,
    height,
  ).filter((points) => points.length >= 2);
  if (routes.length === 0) {
    return null;
  }
  const all = routes.flat();
  const minX = Math.min(...all.map((point) => point.x));
  const minY = Math.min(...all.map((point) => point.y));
  const spanX = Math.max(...all.map((point) => point.x)) - minX;
  const spanY = Math.max(...all.map((point) => point.y)) - minY;
  return {
    width: spanX + stroke,
    height: spanY + stroke,
    place: (x, y) =>
      routes.map((points) => ({
        kind: 'route',
        points: points.map((point) => ({
          x: x + stroke / 2 + point.x - minX,
          y: y + stroke / 2 + point.y - minY,
        })),
        width: stroke,
        ...(color === undefined ? {} : { color }),
      })),
  };
}

/**
 * The sizes of a period's playlist, as the iPhone's Music shows one, in a see-through card as the
 * activities' song (see `MUSIC_COLORS`): its width, corners and room inside; its cover, the
 * period's routes on AllRun's red or night ink, beside its name, its owner and how many songs and
 * how long; and a row per song, its small cover beside its name and artist, its time at the end,
 * hairlines between rows.
 */
const PLAYLIST = {
  width: 840,
  radius: 46,
  pad: 40,
  cover: { size: 220, radius: 16, route: 4, icon: 0.5, gap: 32 },
  title: 50,
  owner: 34,
  info: 28,
  headGap: 36,
  row: { cover: 84, radius: 10, route: 2.5, song: 34, artist: 28, time: 28, gap: 24, rule: 2 },
  rowGap: 18,
} as const;

/** A cover of `size` in AllRun's `cover` color with `art` (routes, or a sport's icon) on it. */
function coverBox(
  size: number,
  radius: number,
  cover: (typeof BRAND_COVERS)[number],
  art: Box,
): Box {
  return overlay(fillBox(size, size, radius, BRAND_COVER_COLORS[cover], {}), art);
}

/**
 * A period's activities as the songs of a playlist of the iPhone's Music (see `playlistSongs`):
 * the period's routes as its cover (its main sport's icon without any), its name as the
 * playlist's, AllRun as its owner and how many activities (by their sport's name, when of one)
 * and how long, or the top of how many; then
 * a row per song, its route as its cover (its sport's icon without one), its name as the song's,
 * its sport and day as the artist, and its time.
 */
export function periodPlaylistBox(
  block: Extract<SummaryBlock, { design: 'periodPlaylist' }>,
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box {
  const colors = MUSIC_COLORS[block.layout];
  const { cover, row: song } = PLAYLIST;
  const inner = PLAYLIST.width - 2 * PLAYLIST.pad;
  const { songs, top } = playlistSongs(data.summary, data.activities);
  const routes = songs.flatMap((activity) =>
    activity.routePolyline === null ? [] : [activity.routePolyline],
  );
  const art = coverBox(
    cover.size,
    cover.radius,
    block.cover,
    routesBox(routes, cover.size * 0.7, cover.size * 0.7, cover.route, COVER_ROUTE) ??
      iconBox(mainFamily(data.activities), cover.size * cover.icon, COVER_ROUTE),
  );
  const textWidth = inner - cover.size - cover.gap;
  const time = durationParts(data.summary.totalMovingTimeSeconds, 'minutes')
    .map(({ amount, unit }) => `${amount}${textContext.durationUnits[unit]}`)
    .join(' ');
  // Its activities by their sport's name when the summary is of one ("6 carreras").
  const kind = data.families.length === 1 ? data.families[0] : 'all';
  const counted = (count: number) =>
    count === 1
      ? translate(`widgets.playlist.counts.${kind}.one`)
      : translate(`widgets.playlist.counts.${kind}.other`, { count: String(count) });
  const info = top
    ? translate('widgets.playlist.top', {
        count: String(songs.length),
        total: counted(data.activities.length),
      })
    : translate('widgets.playlist.info', { count: counted(songs.length), time });
  const heading = column(
    [
      appTextBox(
        fonts,
        [{ text: periodName(data, textContext, translate), size: PLAYLIST.title, bold: true }],
        colors.ink,
        { maxWidth: textWidth },
      ),
      appTextBox(fonts, [{ text: 'AllRun', size: PLAYLIST.owner, bold: false }], colors.ink, {
        maxWidth: textWidth,
      }),
      appTextBox(fonts, [{ text: info, size: PLAYLIST.info, bold: false }], colors.faded, {
        maxWidth: textWidth,
      }),
    ],
    PLAYLIST.info * 0.3,
    'start',
  );
  const head = row([art, heading], cover.gap, 'center');
  const rows = songs.map((activity) => {
    const sport = translate(`modalities.${activity.sportModality}`);
    const day = formatActivityDate(activity.startLocal, textContext.locale, 'short');
    const name = activity.name.trim();
    const length = appTextBox(
      fonts,
      [
        {
          text: metricText(activity, 'movingTime', textContext).value,
          size: song.time,
          bold: false,
        },
      ],
      colors.faded,
    );
    const room = inner - song.cover - 2 * song.gap - length.width;
    const small = coverBox(
      song.cover,
      song.radius,
      block.cover,
      (activity.routePolyline === null
        ? null
        : routeBox(activity.routePolyline, song.cover * 0.7, song.cover * 0.7, {
            color: COVER_ROUTE,
            width: song.route,
          })) ?? iconBox(sportIcon(activity), song.cover * 0.5, COVER_ROUTE),
    );
    const texts = column(
      [
        appTextBox(
          fonts,
          [{ text: name === '' ? sport : name, size: song.song, bold: false }],
          colors.ink,
          {
            maxWidth: room,
          },
        ),
        appTextBox(
          fonts,
          [{ text: `${sport} · ${day}`, size: song.artist, bold: false }],
          colors.faded,
          {
            maxWidth: room,
          },
        ),
      ],
      0,
      'start',
    );
    // The time at the end, centered on the row as the song's texts are.
    return row(
      [
        widened(row([small, texts], song.gap, 'center'), inner - length.width - song.gap, 'start'),
        length,
      ],
      song.gap,
      'center',
    );
  });
  const list = column(
    rows.flatMap((line, i) =>
      i === 0
        ? [line]
        : [hairlineBox(inner - song.cover - song.gap, 0, song.rule, colors.track), line],
    ),
    PLAYLIST.rowGap / 2,
    'end',
  );
  const content = column([widened(head, inner, 'start'), list], PLAYLIST.headGap, 'start');
  const height = content.height + 2 * PLAYLIST.pad;
  return placed(PLAYLIST.width, height, [
    {
      box: fillBox(PLAYLIST.width, height, PLAYLIST.radius, colors.card, { edge: colors.edge }),
      x: 0,
      y: 0,
    },
    { box: content, x: PLAYLIST.pad, y: PLAYLIST.pad },
  ]);
}
