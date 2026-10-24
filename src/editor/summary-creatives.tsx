import { decodePolyline } from '@/core/polyline';
import { DEFAULT_PRIVACY_TRIM_METERS, trimRouteEnds } from '@/core/route-privacy';
import { projectRoutes } from '@/core/route-projection';
import { sportIcon, tyreCompounds } from '@/core/activity-block';
import { addDays, isInRange } from '@/core/dates';
import {
  calendarFigures,
  calendarMonths,
  calendarView,
  calendarWeeks,
  grandPrixActivities,
  periodStreak,
  streakStrip,
  tableBucket,
  weatherCondition,
  listsNoteActivities,
  mainFamily,
  metroLayout,
  type MetroStation,
  metroStations,
  periodSentencePlan,
  periodWrapped,
  playlistSongs,
} from '@/core/summary-block';
import { summaryHasDistance, toDisplaySummaryMetric } from '@/core/summary-metrics';
import { durationParts, formatDuration } from '@/core/units';
import { bucketize, type SummaryBucket } from '@/core/summary';
import {
  formatActivityDate,
  formatBucketLabels,
  formatMetric,
  formatShortBucketName,
} from '@/ui/format';
import type { BRAND_COVERS, SummaryBlock } from '@/core/template';

import {
  appTextBox,
  type BlockContext,
  capitalsBox,
  boardingPassBox,
  type Box,
  BRAND_COVER_COLORS,
  column,
  COVER_ROUTE,
  fillBox,
  hairlineBox,
  lapsTableBox,
  logoBox,
  markBrandBox,
  MUSIC_COLORS,
  placed,
  receiptBox,
  routeBox,
  scaledBox,
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
  panel,
  paragraph,
  row,
  type SentencePart,
  sentenceParts,
  type SportMark,
  sportMarkBox,
  spread,
  symbolBox,
  textBox,
  timingTowerBox,
  turned,
} from './activity-blocks';
import { markWidth } from './brand/brand-art';
import { CAP_HEIGHTS } from './fonts';
import {
  metricText,
  MISSING_VALUE,
  periodBoardingPass,
  periodLaps,
  periodName,
  periodNoteLines,
  periodReceipt,
  periodTitle,
  plainSummaryText,
  roundedChartValue,
  type SummaryData,
} from './editor-data';

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
 * note, when it is of one; AllRun's monogram for every sport), and a line per activity, or per day, week or month, each ticked off in
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
    // Its sport at the end of its bar, as an activity's note; AllRun's monogram for every sport.
    data.families.length === 1
      ? noteSportBox(fonts, block.layout, translate(`families.${sport}`), sport)
      : sportMarkBox('allrun', NOTES_SIZES.icon, NOTES_COLORS[block.layout].accent),
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

/**
 * The sizes of a period's review, as music apps sum up a year, in the playlist's see-through card:
 * its width, corners and room inside; the period's name turned up its side, at most `max` big
 * and `gap` from the cover; the cover's corners, its routes' lines and its icon without routes (a
 * share of its side); the names over each list and figure, the lists' lines and the room between
 * them, the columns and the sections; the minutes and the favorite sport, its icon as big; and
 * AllRun's name and its monogram at the bottom.
 */
const WRAPPED = {
  width: 840,
  radius: 46,
  pad: 44,
  date: { max: 150, gap: 28 },
  cover: { radius: 16, route: 5, icon: 0.4 },
  label: 26,
  item: 32,
  columnGap: 40,
  sectionGap: 44,
  big: 72,
  favorite: 56,
  logo: 170,
  mark: 52,
} as const;

/** The size a text is laid out at to measure it before writing it as long as something. */
const WRAPPED_PROBE = 100;

/**
 * A period's review, as music apps sum up a year of songs (see `periodWrapped`), in the
 * playlist's see-through card rather than their bright colors: the period's name turned up the
 * side of its cover (its routes, or its favorite sport's icon without any); its top sports and its
 * longest activities (by their sport's icon, time and day), numbered, side by side; its minutes in motion and its favorite family of
 * sports with its icon; and AllRun's name and monogram at the bottom.
 */
export function periodWrappedBox(
  block: Extract<SummaryBlock, { design: 'periodWrapped' }>,
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box {
  const colors = MUSIC_COLORS[block.layout];
  const inner = WRAPPED.width - 2 * WRAPPED.pad;
  const review = periodWrapped(data.activities);
  const name = periodName(data, textContext, translate);
  const dateAt = (size: number) =>
    appTextBox(fonts, [{ text: name, size, bold: true }], colors.ink);
  // The name as big as it goes, but no longer than the cover beside it is tall.
  const coverBeside = (date: Box) => inner - date.height - WRAPPED.date.gap;
  const largest = dateAt(WRAPPED.date.max);
  const date =
    largest.width <= coverBeside(largest)
      ? largest
      : dateAt((WRAPPED_PROBE * coverBeside(largest)) / dateAt(WRAPPED_PROBE).width);
  const side = coverBeside(date);
  const art = coverBox(
    side,
    WRAPPED.cover.radius,
    block.cover,
    routesBox(data.summary.routes, side * 0.8, side * 0.8, WRAPPED.cover.route, COVER_ROUTE) ??
      iconBox(review.favorite, side * WRAPPED.cover.icon, COVER_ROUTE),
  );
  const half = (inner - WRAPPED.columnGap) / 2;
  const label = (text: string) =>
    appTextBox(fonts, [{ text, size: WRAPPED.label, bold: false }], colors.faded, {
      maxWidth: half,
    });
  const titled = (title: string, content: Box) =>
    column([label(title), content], WRAPPED.label * 0.4, 'start');
  const line = (text: string) =>
    appTextBox(fonts, [{ text, size: WRAPPED.item, bold: false }], colors.ink, {
      maxWidth: half,
    });
  /** A numbered list under `title`, each item after its number. */
  const list = (title: string, items: readonly Box[]) =>
    titled(
      title,
      column(
        items.map((item, i) => row([line(String(i + 1)), item], WRAPPED.item * 0.3, 'center')),
        WRAPPED.item * 0.2,
        'start',
      ),
    );
  const pair = (left: Box, right: Box) =>
    row([widened(left, half, 'start'), widened(right, half, 'start')], WRAPPED.columnGap, 'start');
  const lists = pair(
    list(
      translate('widgets.wrapped.topSports'),
      review.sports.map((sport) => line(translate(`modalities.${sport}`))),
    ),
    // An activity by its sport's icon, its time (which ranks it) and its day: names repeat
    // ("Morning Ride") and run long.
    list(
      translate('widgets.wrapped.topActivities'),
      review.activities.map((activity) =>
        row(
          [
            iconBox(sportIcon(activity), WRAPPED.item, colors.ink),
            line(
              `${durationParts(activity.movingTimeSeconds, 'minutes')
                .map(({ amount, unit }) => `${amount}${textContext.durationUnits[unit]}`)
                .join(
                  ' ',
                )} · ${formatActivityDate(activity.startLocal, textContext.locale, 'short')}`,
            ),
          ],
          WRAPPED.item * 0.3,
          'center',
        ),
      ),
    ),
  );
  // The favorite family's name as big as it goes beside its icon, smaller when long.
  const sportName = translate(`families.${review.favorite}`);
  const sportAt = (size: number) =>
    appTextBox(fonts, [{ text: sportName, size, bold: true }], colors.ink);
  const room = half - WRAPPED.favorite * 1.3;
  const fullSize = sportAt(WRAPPED.favorite);
  const favoriteName =
    fullSize.width <= room
      ? fullSize
      : sportAt((WRAPPED_PROBE * room) / sportAt(WRAPPED_PROBE).width);
  const favorite = row(
    [iconBox(review.favorite, WRAPPED.favorite, colors.ink), favoriteName],
    WRAPPED.favorite * 0.3,
    'center',
  );
  const figures = pair(
    titled(
      translate('widgets.wrapped.minutes'),
      appTextBox(
        fonts,
        [
          {
            text: new Intl.NumberFormat(textContext.locale).format(review.minutes),
            size: WRAPPED.big,
            bold: true,
          },
        ],
        colors.ink,
        { maxWidth: half },
      ),
    ),
    titled(translate('widgets.wrapped.favorite'), favorite),
  );
  const content = column(
    [
      row([turned(date), art], WRAPPED.date.gap, 'start'),
      lists,
      figures,
      // AllRun's name at the start and its monogram at the end, as the review's app signs it.
      row(
        [
          widened(logoBox(WRAPPED.logo, colors.ink), inner - markWidth(WRAPPED.mark), 'start'),
          markBrandBox(WRAPPED.mark, colors.ink),
        ],
        0,
        'center',
      ),
    ],
    WRAPPED.sectionGap,
    'start',
  );
  const height = content.height + 2 * WRAPPED.pad;
  return placed(WRAPPED.width, height, [
    {
      box: fillBox(WRAPPED.width, height, WRAPPED.radius, colors.card, { edge: colors.edge }),
      x: 0,
      y: 0,
    },
    { box: content, x: WRAPPED.pad, y: WRAPPED.pad },
  ]);
}

/**
 * A period's days, weeks or months as laps (see `periodLaps`), on the activities' board or timing
 * sheet (see `lapsTableBox`), its longest lap in AllRun's red or night ink; on the board, its
 * sport's icon (AllRun's monogram for every sport; the sheet's title names it).
 */
export function periodLapsBox(
  block: Extract<SummaryBlock, { design: 'periodLaps' }>,
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box | null {
  const laps = periodLaps(data, textContext, translate);
  if (laps.rows.length === 0) {
    return null;
  }
  return lapsTableBox(fonts, block.layout, block.cover, {
    ...laps,
    // Its sport when of one; AllRun's monogram for every sport.
    icon: data.families.length === 1 ? data.families[0] : 'allrun',
    // A pace as a timing sheet writes it, 5'42"; a count says what it counts, "2 act." (the
    // board's names it in its header, the sheet has none).
    sheetValue: (value) =>
      laps.value === 'pace'
        ? `${value.replace(':', "'")}"`
        : laps.value === 'count'
          ? translate('widgets.activities', { number: value })
          : value,
  });
}

/**
 * A period's activities as a race (see `grandPrixActivities`) on the activities' timing tower (see
 * `timingTowerBox`): the period's name and how many activities (by their sport's name, with its
 * icon, when the summary is of one; AllRun's monogram for every sport); each activity by its position, its sport's icon, its time and
 * its gap to the leader, the longest a third soft, the middle medium and the shortest hard, the
 * leader with the purple stopwatch.
 */
export function periodGrandPrixBox(
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box {
  const racers = grandPrixActivities(data.summary, data.activities);
  const times = racers.map((activity) => activity.movingTimeSeconds);
  const tyres = tyreCompounds(times);
  const [leader] = times;
  const kind = data.families.length === 1 ? data.families[0] : 'all';
  const count = data.activities.length;
  return timingTowerBox(fonts, {
    // Its sport when of one; AllRun's monogram for every sport.
    icon: data.families.length === 1 ? data.families[0] : 'allrun',
    title: periodName(data, textContext, translate),
    subtitle:
      count === 1
        ? translate(`widgets.playlist.counts.${kind}.one`)
        : translate(`widgets.playlist.counts.${kind}.other`, { count: String(count) }),
    rows: racers.map((activity, i) => ({
      number: String(i + 1),
      icon: sportIcon(activity),
      value: formatDuration(activity.movingTimeSeconds),
      gap:
        i === 0
          ? translate('widgets.grandPrix.leader')
          : `+${formatDuration(leader - activity.movingTimeSeconds)}`,
      mark: i === 0 ? 'fastest' : tyres[i],
    })),
  });
}

/**
 * A period as a shop's receipt (see `periodReceipt`), on the activities' thermal paper (see
 * `receiptBox`).
 */
export function periodReceiptBox(
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box {
  const receipt = periodReceipt(data, textContext, translate);
  return receiptBox(fonts, {
    ...receipt,
    thanks: translate('widgets.receipt.thanks'),
    seed: `${data.summary.range.start}${data.summary.range.end}`,
  });
}

/**
 * A period as a flight from its first activity to its last (see `periodBoardingPass`), on the
 * activities' boarding pass (see `boardingPassBox`): its sport's icon on its band and on the
 * dashed line (AllRun's monogram for every sport).
 */
export function periodBoardingPassBox(
  block: Extract<SummaryBlock, { design: 'periodBoardingPass' }>,
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box {
  const pass = periodBoardingPass(data, textContext, translate);
  const { distance } = pass;
  return boardingPassBox(fonts, block.cover, {
    title: pass.title,
    mark: data.families.length === 1 ? data.families[0] : 'allrun',
    // From no distance at the first activity to all of it at the last, under their days; without
    // a distance, the days alone.
    departure:
      distance === null
        ? { big: pass.firstDay, unit: null, under: null }
        : { big: '0', unit: distance.unit, under: pass.firstDay },
    arrival:
      distance === null
        ? { big: pass.lastDay, unit: null, under: null }
        : { big: distance.value, unit: distance.unit, under: pass.lastDay },
    names: {
      departure: translate('widgets.boardingPass.departure'),
      arrival: translate('widgets.boardingPass.arrival'),
    },
    fields: pass.fields,
    seed: `${data.summary.range.start}${data.summary.range.end}`,
  });
}

/**
 * A widget of the iPhone's home screen in dark and light mode: its card, its texts, the fainter
 * day numbers, a day outside the period, and the Calendar's red marking a day with the number on
 * it.
 */
const CALENDAR_COLORS = {
  dark: {
    card: '#1C1C1E',
    ink: '#FFFFFF',
    faded: '#8E8E93',
    outside: '#48484A',
    accent: '#FF453A',
    marked: '#FFFFFF',
  },
  light: {
    card: '#FFFFFF',
    ink: '#000000',
    faded: '#8E8E93',
    outside: '#D1D1D6',
    accent: '#FF3B30',
    marked: '#FFFFFF',
  },
} as const;

type CalendarColors = (typeof CALENDAR_COLORS)[keyof typeof CALENDAR_COLORS];

/**
 * The sizes of a period's calendar: its card's width, corners and room inside; its name and total
 * at the top (smaller when they don't fit), the total's sport icon (its size and the room after
 * it, shares of theirs), and the room under them. Day by day, each day's number over its figure (at most
 * `value` big, smaller when the widest doesn't fit `room` of its column), the icon of a day's
 * sport (a share of the figure's size), the room between them and between weeks. By months,
 * three a row, the room between them; each month's name and total over its days, always six weeks
 * tall so the months line up, the room under its name, each day's number and its mark (a share of
 * its column).
 */
const CALENDAR = {
  width: 840,
  radius: 46,
  pad: 56,
  title: 32,
  icon: { size: 1.1, gap: 0.3 },
  headGap: 60,
  days: { number: 20, value: 46, icon: 0.9, gap: 4, rowGap: 30, room: 0.72 },
  months: {
    perRow: 3,
    gap: 28,
    rowGap: 36,
    name: 26,
    total: 18,
    nameGap: 14,
    day: 14,
    mark: 0.9,
    weeks: 6,
  },
} as const;

/** How a calendar writes a text: its value, size, color, weight and longest width. */
type CalendarText = (
  value: string,
  size: number,
  color: string,
  bold: boolean,
  maxWidth?: number,
) => Box;

/**
 * A period as a calendar, a widget of the iPhone's home screen (see `calendarView`), in a wide,
 * geometric font as the widget it copies: its name and its distance in words ("143 kilómetros"),
 * or its time without any, after its sport's icon (AllRun's monogram for every sport), over its
 * weeks, Monday first, each day's number over its figure (see
 * `calendarFigures`: its distance or time, rounded and bare, or its sport's icon on a day without
 * any distance); or, longer, its months as the iPhone's Calendar shows a year, each with its
 * total, its active days marked in the Calendar's red.
 */
export function periodCalendarBox(
  block: Extract<SummaryBlock, { design: 'periodCalendar' }>,
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box | null {
  const view = calendarView(data.summary.range);
  if (view === null) {
    return null;
  }
  const colors = CALENDAR_COLORS[block.layout];
  const inner = CALENDAR.width - 2 * CALENDAR.pad;
  const { summary } = data;
  const measure = summaryHasDistance(summary) ? 'distance' : 'movingTime';
  const text: CalendarText = (value, size, color, bold, maxWidth) =>
    appTextBox(fonts, [{ text: value, size, bold }], color, {
      font: 'unbounded',
      ...(maxWidth === undefined ? {} : { maxWidth }),
    });
  const total =
    measure === 'distance'
      ? translate(`widgets.verified.${textContext.unit}`, {
          value: roundedChartValue('distance', summary.totalDistanceMeters, textContext, false),
        })
      : plainSummaryText('totalMovingTime', summary.totalMovingTimeSeconds, textContext);
  const name = periodName(data, textContext, translate);
  // Its sport when of one; AllRun's monogram for every sport.
  const mark: SportMark = data.families.length === 1 ? data.families[0] : 'allrun';
  const totalAt = (size: number) =>
    markedTotalBox(fonts, mark, total, size, colors.ink, CALENDAR.icon);
  // Both as big as fits, but never cut: smaller when a long name doesn't leave room for the total.
  const used =
    text(name, CALENDAR.title, colors.ink, true).width +
    totalAt(CALENDAR.title).width +
    CALENDAR.title;
  const title = Math.min(CALENDAR.title, (CALENDAR.title * inner) / used);
  const head = spread(text(name, title, colors.ink, true), totalAt(title), inner);
  // A day's number cut to its digits, so a mark around it is centered on them, and laid out
  // large so that it stays there on the phone, as small as it is.
  const digits: CalendarText = (value, size, color, bold) =>
    scaledBox((scale) =>
      capitalsBox(
        fonts,
        [{ text: value, size: size * scale, bold }],
        size * scale,
        0,
        1,
        { font: 'unbounded', color, bold: false, uppercase: false, italic: false },
        { shadow: false },
      ),
    );
  const body =
    view === 'days'
      ? calendarDaysBox(data, measure, inner, colors, text, textContext)
      : calendarMonthsBox(data, measure, inner, colors, text, digits, textContext);
  return panel(
    column([head, body], CALENDAR.headGap, 'start'),
    colors.card,
    CALENDAR.pad,
    CALENDAR.pad,
    CALENDAR.radius,
  );
}

/**
 * A total after its sport's icon, or AllRun's monogram (see `SportMark`), `size` big, the mark
 * centered on its capitals as a letter's middle is, not on its line's box, `look` its size and
 * the room after it (shares of the total's size).
 */
function markedTotalBox(
  fonts: Omit<BlockContext, 'canvas'>['fonts'],
  mark: SportMark,
  total: string,
  size: number,
  color: string,
  look: { readonly size: number; readonly gap: number },
): Box {
  const laidOut = paragraph(
    [{ text: total, size, bold: true }],
    fonts,
    { font: 'unbounded', color, bold: false, uppercase: false, italic: false },
    { shadow: false },
  );
  const written = textBox(laidOut);
  const icon = sportMarkBox(mark, size * look.size, color);
  const baseline = laidOut.getLineMetrics()[0]?.baseline ?? laidOut.getHeight();
  const middle = baseline - (CAP_HEIGHTS.unbounded * size) / 2;
  const gap = size * look.gap;
  return placed(icon.width + gap + written.width, written.height, [
    { box: icon, x: 0, y: middle - icon.height / 2 },
    { box: written, x: icon.width + gap, y: 0 },
  ]);
}

/**
 * A calendar's weeks one under another, `inner` wide: each day of the period its number over its
 * figure, the days around it empty. The figures all as big as the widest lets them be.
 */
function calendarDaysBox(
  data: SummaryData,
  measure: 'distance' | 'movingTime',
  inner: number,
  colors: CalendarColors,
  text: CalendarText,
  textContext: BlockContext['textContext'],
): Box {
  const sizes = CALENDAR.days;
  const cell = inner / 7;
  const figures = calendarFigures(data.summary, data.activities);
  const written = new Map(
    [...figures].flatMap(([day, figure]) =>
      figure.kind === 'amount'
        ? [[day, roundedChartValue(measure, figure.amount, textContext, false)] as const]
        : [],
    ),
  );
  const widest = Math.max(
    1,
    ...[...written.values()].map((value) => text(value, sizes.value, colors.ink, true).width),
  );
  const size = Math.min(sizes.value, (sizes.value * cell * sizes.room) / widest);
  const valueHeight = text('0', size, colors.ink, true).height;
  const weeks = calendarWeeks(data.summary.range).map((week) =>
    row(
      week.map((day) => {
        const figure = figures.get(day);
        if (figure === undefined) {
          return placed(cell, 0, []);
        }
        const value =
          figure.kind === 'amount'
            ? text(written.get(day) ?? '', size, colors.ink, true)
            : overlay(
                placed(0, valueHeight, []),
                iconBox(sportIcon(figure.activity), size * sizes.icon, colors.ink),
              );
        return widened(
          column(
            [text(day.slice(8, 10), sizes.number, colors.faded, false), value],
            sizes.gap,
            'center',
          ),
          cell,
          'center',
        );
      }),
      0,
      'end',
    ),
  );
  return column(weeks, sizes.rowGap, 'start');
}

/**
 * A calendar's months side by side, `inner` wide, as the iPhone's Calendar shows a year: each its
 * name and total over its days, those with activities marked in its red, those outside the period
 * fainter.
 */
function calendarMonthsBox(
  data: SummaryData,
  measure: 'distance' | 'movingTime',
  inner: number,
  colors: CalendarColors,
  text: CalendarText,
  digits: CalendarText,
  textContext: BlockContext['textContext'],
): Box {
  const sizes = CALENDAR.months;
  const { range } = data.summary;
  const months = calendarMonths(range);
  const perRow = Math.min(sizes.perRow, months.length);
  const width = (inner - (perRow - 1) * sizes.gap) / perRow;
  const cell = width / 7;
  const inPeriod = data.activities.filter((activity) => isInRange(activity.localDate, range));
  const active = new Set(inPeriod.map((activity) => activity.localDate));
  // Square days, so marks on days a week apart don't touch either.
  const dayHeight = cell;
  const grids = months.map((month) => {
    const amount = inPeriod
      .filter((activity) => isInRange(activity.localDate, month))
      .reduce(
        (sum, activity) =>
          sum + (measure === 'distance' ? activity.distanceMeters : activity.movingTimeSeconds),
        0,
      );
    const totalBox = text(
      roundedChartValue(measure, amount, textContext, true),
      sizes.total,
      colors.faded,
      false,
    );
    const name = text(
      formatShortBucketName(month, 'month', textContext.locale),
      sizes.name,
      colors.ink,
      true,
      width - totalBox.width - sizes.total,
    );
    const weeks = calendarWeeks(month).map((week) =>
      row(
        week.map((day) => {
          const space = placed(cell, dayHeight, []);
          if (!isInRange(day, month)) {
            return space;
          }
          const marked = active.has(day);
          const label = digits(
            String(Number(day.slice(8, 10))),
            sizes.day,
            marked ? colors.marked : isInRange(day, range) ? colors.ink : colors.outside,
            marked,
          );
          return overlay(
            space,
            marked ? overlay(discBox((cell * sizes.mark) / 2, colors.accent), label) : label,
          );
        }),
        0,
        'center',
      ),
    );
    return column(
      [
        spread(name, totalBox, width),
        placed(width, sizes.weeks * dayHeight, [{ box: column(weeks, 0, 'start'), x: 0, y: 0 }]),
      ],
      sizes.nameGap,
      'start',
    );
  });
  const rows = Array.from({ length: Math.ceil(grids.length / perRow) }, (_, i) =>
    row(grids.slice(i * perRow, (i + 1) * perRow), sizes.gap, 'start'),
  );
  return column(rows, sizes.rowGap, 'start');
}

/**
 * A streak's card, in dark and light mode as the calendar's widget: its card and texts, fainter
 * for what is secondary; the days without activities fainter still; and its flame and its active
 * days in AllRun's red, a flame on them in white.
 */
const STREAK_COLORS = {
  dark: {
    card: CALENDAR_COLORS.dark.card,
    ink: CALENDAR_COLORS.dark.ink,
    faded: CALENDAR_COLORS.dark.faded,
    empty: CALENDAR_COLORS.dark.outside,
    accent: BRAND_COVER_COLORS.red,
    onAccent: '#FFFFFF',
  },
  light: {
    card: CALENDAR_COLORS.light.card,
    ink: CALENDAR_COLORS.light.ink,
    faded: CALENDAR_COLORS.light.faded,
    empty: CALENDAR_COLORS.light.outside,
    accent: BRAND_COVER_COLORS.red,
    onAccent: '#FFFFFF',
  },
} as const;

/**
 * The sizes of a period's streak: its card's width, corners and room inside; the period's name
 * over its flame beside its figure (cut to its digits) and what it counts under them, and the room
 * between them; the active days under its strip. Its strip: day by day, each its initial over a disc with a flame (a share of
 * the disc) or a ring `ring` wide; by weeks, a dot per day `gap` apart; by months, a bar per month
 * `tall`, its initial under it.
 */
const STREAK = {
  width: 760,
  radius: 46,
  pad: 60,
  period: 34,
  flame: 140,
  figure: 150,
  label: 44,
  gap: 24,
  stripGap: 48,
  foot: 34,
  days: { initial: 28, disc: 64, flame: 0.6, ring: 4, gap: 14 },
  weeks: { dot: 40, gap: 16, ring: 3 },
  months: { tall: 140, gap: 12, radius: 8, initial: 24 },
} as const;

/**
 * A day without activities on a streak's strip: a ring `stroke` wide, as big over all as an
 * active day's `diameter` disc, so they line up.
 */
const ringBox = (diameter: number, stroke: number, color: string): Box =>
  overlay(placed(diameter, diameter, []), discBox(diameter / 2 - stroke / 2, color, stroke));

/**
 * A period's longest streak of days in a row with activities (see `periodStreak`), as the apps
 * that count one show it, in dark and light mode: the period's name, a flame in AllRun's red
 * beside the streak and "días de racha" under them; its days under it (see `streakStrip`): a week's one by one, its
 * active days in red with a flame; a month's as dots in rows of weeks; a year's as a bar per month
 * filled by its share of active days; and how many of its days had activities.
 */
export function periodStreakBox(
  block: Extract<SummaryBlock, { design: 'periodStreak' }>,
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box {
  const { summary } = data;
  const colors = STREAK_COLORS[block.layout];
  const inner = STREAK.width - 2 * STREAK.pad;
  const streak = periodStreak(summary, data.activities);
  const text = (value: string, size: number, color: string, bold: boolean) =>
    appTextBox(fonts, [{ text: value, size, bold }], color, { maxWidth: inner });
  const strip = (() => {
    switch (streakStrip(summary.range)) {
      case 'days': {
        const sizes = STREAK.days;
        const buckets = bucketize(data.activities, summary.range, 'day');
        const initials = formatBucketLabels(buckets, 'day', textContext.locale);
        return row(
          buckets.map((bucket, i) =>
            column(
              [
                text(initials[i], sizes.initial, colors.faded, true),
                streak.active.has(bucket.range.start)
                  ? overlay(
                      discBox(sizes.disc / 2, colors.accent),
                      iconBox('flame', sizes.disc * sizes.flame, colors.onAccent),
                    )
                  : ringBox(sizes.disc, sizes.ring, colors.empty),
              ],
              sizes.gap,
              'center',
            ),
          ),
          (inner - buckets.length * sizes.disc) / Math.max(1, buckets.length - 1),
          'end',
        );
      }
      case 'weeks': {
        const sizes = STREAK.weeks;
        const r = sizes.dot / 2;
        return column(
          calendarWeeks(summary.range).map((week) =>
            row(
              week.map((day) =>
                !isInRange(day, summary.range)
                  ? placed(sizes.dot, sizes.dot, [])
                  : streak.active.has(day)
                    ? discBox(r, colors.accent)
                    : ringBox(sizes.dot, sizes.ring, colors.empty),
              ),
              sizes.gap,
              'center',
            ),
          ),
          sizes.gap,
          'center',
        );
      }
      case 'months': {
        const sizes = STREAK.months;
        const months = calendarMonths(summary.range);
        const width = (inner - (months.length - 1) * sizes.gap) / months.length;
        const initials = formatBucketLabels(
          months.map((range) => ({
            range,
            activityCount: 0,
            distanceMeters: 0,
            movingTimeSeconds: 0,
          })),
          'month',
          textContext.locale,
        );
        return row(
          months.map((month, i) => {
            let days = 0;
            let active = 0;
            for (let day = month.start; day <= month.end; day = addDays(day, 1)) {
              if (isInRange(day, summary.range)) {
                days += 1;
                active += streak.active.has(day) ? 1 : 0;
              }
            }
            const filled = days === 0 ? 0 : (sizes.tall * active) / days;
            return column(
              [
                placed(width, sizes.tall, [
                  {
                    box: fillBox(width, sizes.tall, sizes.radius, colors.empty, {}),
                    x: 0,
                    y: 0,
                  },
                  ...(filled <= 0
                    ? []
                    : [
                        {
                          box: fillBox(
                            width,
                            Math.max(filled, 2 * sizes.radius),
                            sizes.radius,
                            colors.accent,
                            {},
                          ),
                          x: 0,
                          y: sizes.tall - Math.max(filled, 2 * sizes.radius),
                        },
                      ]),
                ]),
                text(initials[i], sizes.initial, colors.faded, true),
              ],
              sizes.gap,
              'center',
            );
          }),
          sizes.gap,
          'end',
        );
      }
    }
  })();
  const content = column(
    [
      text(periodTitle(data, textContext, translate), STREAK.period, colors.faded, true),
      column(
        [
          // The flame beside the figure cut to its digits, so they line up on their middles.
          row(
            [
              iconBox('flame', STREAK.flame, colors.accent),
              capitalsBox(
                fonts,
                [{ text: String(streak.longest), size: STREAK.figure, bold: true }],
                STREAK.figure,
                0,
                1,
                { font: 'inter', color: colors.ink, bold: false, uppercase: false, italic: false },
                { shadow: false },
              ),
            ],
            STREAK.gap,
            'center',
          ),
          text(
            translate(streak.longest === 1 ? 'widgets.streak.one' : 'widgets.streak.other'),
            STREAK.label,
            colors.ink,
            true,
          ),
        ],
        STREAK.gap,
        'center',
      ),
      strip,
      text(
        translate('widgets.streak.activeDays', {
          active: String(streak.activeDays),
          days: String(streak.days),
        }),
        STREAK.foot,
        colors.faded,
        false,
      ),
    ],
    STREAK.stripGap,
    'center',
  );
  return panel(
    widened(content, inner, 'center'),
    colors.card,
    STREAK.pad,
    STREAK.pad,
    STREAK.radius,
  );
}

/**
 * The iPhone's Weather by day and by night: its sky from top to bottom, its translucent cards and
 * the hairlines between their rows, its texts (the fainter for lows and names), and its bars: the
 * track, and the scale's colors from cold to warm, along which each bar shows its stretch.
 */
const WEATHER_COLORS = {
  light: {
    sky: ['#3D6CB9', '#6F94CF'],
    card: '#1F4C9466',
    rule: '#FFFFFF2E',
    ink: '#FFFFFF',
    faded: '#FFFFFFA6',
    track: '#16397059',
    scale: ['#7ED3C8', '#E8D35B', '#F0A13A'],
  },
  dark: {
    sky: ['#0A1430', '#2A3B66'],
    card: '#FFFFFF1A',
    rule: '#FFFFFF24',
    ink: '#FFFFFF',
    faded: '#FFFFFF99',
    track: '#FFFFFF1F',
    scale: ['#7ED3C8', '#E8D35B', '#F0A13A'],
  },
} as const;

/**
 * The sizes of a period's weather: its sky's width, corners and room inside; at the top, what it
 * is of beside the location arrow (a share of its size), the period's name, its total as the
 * temperature (smaller when it doesn't fit), its conditions and its highest and lowest, and the
 * room between them; then its card of rows: the room and corners inside it, its title, and each
 * row's texts, height, icon, bar's thickness and the room between its columns.
 */
const WEATHER = {
  width: 840,
  radius: 56,
  pad: 48,
  place: 28,
  arrow: 0.85,
  name: 60,
  figure: 170,
  line: 40,
  headGap: 4,
  cardGap: 48,
  card: { pad: 32, radius: 32, title: 24, titleGap: 18 },
  row: { text: 40, height: 86, icon: 46, bar: 10, gap: 24, rule: 2 },
} as const;

/**
 * A stretch of a bar of the weather's rows: the colors of the whole `width` long scale, cold to
 * warm, shown from `from` to `to` of it, rounded at its ends, as the app shows a day's low to high.
 */
function weatherBarBox(
  width: number,
  thick: number,
  from: number,
  to: number,
  colors: (typeof WEATHER_COLORS)[keyof typeof WEATHER_COLORS],
): Box {
  const start = from * width;
  // Never shorter than round: a short day still shows a dot.
  const length = Math.max(thick, (to - from) * width);
  return placed(width, thick, [
    { box: fillBox(width, thick, thick / 2, colors.track, {}), x: 0, y: 0 },
    {
      box: {
        width,
        height: thick,
        place: (x, y) => [
          {
            kind: 'shade',
            x,
            y,
            width,
            height: thick,
            colors: colors.scale,
            across: true,
            card: { x: x + start, y, width: length, height: thick, radius: thick / 2 },
          },
        ],
      },
      x: 0,
      y: 0,
    },
  ]);
}

/**
 * A period as the iPhone's Weather (see `weatherCondition`), by day (light) or by night (dark):
 * what it is of (its sport, or AllRun) beside the location arrow, its name as the city's, its
 * total as the temperature ("94 km", or its time without any distance), its conditions by its
 * share of active days ("Nubes y claros") and its longest and shortest day, week or month with
 * activities as the day's high and low; then a row per day, week or month (see `tableBucket`) as
 * the forecast's, its main sport's icon (a moon without activities), its time as the low (its
 * activities without any distance), its distance (or time) as the high, and a bar from nothing to
 * it along the scale of the longest.
 */
export function periodWeatherBox(
  block: Extract<SummaryBlock, { design: 'periodWeather' }>,
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box {
  const colors = WEATHER_COLORS[block.layout];
  const { summary } = data;
  const inner = WEATHER.width - 2 * WEATHER.pad;
  const measure = summaryHasDistance(summary) ? 'distance' : 'movingTime';
  const text = (
    value: string,
    size: number,
    color: string,
    look: { readonly bold?: boolean; readonly light?: boolean } = {},
  ) =>
    appTextBox(
      fonts,
      [{ text: value, size, bold: look.bold === true, light: look.light === true }],
      color,
    );
  const size = tableBucket(summary.range);
  const buckets = bucketize(data.activities, summary.range, size);
  const amount = (bucket: SummaryBucket) =>
    measure === 'distance' ? bucket.distanceMeters : bucket.movingTimeSeconds;
  const active = buckets.filter((bucket) => bucket.activityCount > 0 && amount(bucket) > 0);
  const highest = Math.max(0, ...active.map(amount));
  const lowest = Math.min(...active.map(amount));
  const written = (value: number, unit: boolean) =>
    roundedChartValue(measure, value, textContext, unit);
  const streak = periodStreak(summary, data.activities);

  const [family] = data.families;
  const place = row(
    [
      iconBox('location', WEATHER.place * WEATHER.arrow, colors.ink),
      text(
        (data.families.length === 1 ? translate(`families.${family}`) : 'AllRun').toLocaleUpperCase(
          textContext.locale,
        ),
        WEATHER.place,
        colors.ink,
        { bold: true },
      ),
    ],
    WEATHER.place * 0.25,
    'center',
  );
  const total =
    measure === 'distance'
      ? written(summary.totalDistanceMeters, true)
      : plainSummaryText('totalMovingTime', summary.totalMovingTimeSeconds, textContext);
  const figureAt = (figure: number) => text(total, figure, colors.ink, { light: true });
  const full = figureAt(WEATHER.figure);
  const figure = full.width <= inner ? full : figureAt((WEATHER.figure * inner) / full.width);
  const head = column(
    [
      place,
      text(periodName(data, textContext, translate), WEATHER.name, colors.ink),
      figure,
      text(
        translate(`widgets.weather.conditions.${weatherCondition(streak.activeDays, streak.days)}`),
        WEATHER.line,
        colors.ink,
      ),
      ...(active.length === 0
        ? []
        : [
            text(
              translate('widgets.weather.range', {
                max: written(highest, true),
                min: written(lowest, true),
              }),
              WEATHER.line,
              colors.ink,
            ),
          ]),
    ],
    WEATHER.headGap,
    'center',
  );

  const sizes = WEATHER.row;
  const cardInner = inner - 2 * WEATHER.card.pad;
  const rows = buckets.map((bucket) => {
    const activities = data.activities.filter((activity) =>
      isInRange(activity.localDate, bucket.range),
    );
    const name = formatShortBucketName(bucket.range, size, textContext.locale);
    return {
      name: text(
        name.charAt(0).toLocaleUpperCase(textContext.locale) + name.slice(1),
        sizes.text,
        colors.ink,
      ),
      icon:
        activities.length === 0
          ? iconBox('rest', sizes.icon, colors.faded)
          : iconBox(mainFamily(activities), sizes.icon, colors.ink),
      low: text(
        activities.length === 0
          ? MISSING_VALUE
          : measure === 'distance'
            ? roundedChartValue('movingTime', bucket.movingTimeSeconds, textContext, false)
            : translate('widgets.activities', { number: String(bucket.activityCount) }),
        sizes.text,
        colors.faded,
      ),
      high: text(
        activities.length === 0 ? MISSING_VALUE : written(amount(bucket), false),
        sizes.text,
        colors.ink,
      ),
      share: highest <= 0 ? 0 : amount(bucket) / highest,
    };
  });
  const widest = (boxes: readonly Box[]) => Math.max(...boxes.map((box) => box.width));
  const nameWidth = widest(rows.map((line) => line.name));
  const lowWidth = widest(rows.map((line) => line.low));
  const highWidth = widest(rows.map((line) => line.high));
  const barWidth = cardInner - nameWidth - sizes.icon - lowWidth - highWidth - 4 * sizes.gap;
  const lines = rows.map((line) => {
    const cells: { box: Box; width: number; align: 'start' | 'center' | 'end' }[] = [
      { box: line.name, width: nameWidth, align: 'start' },
      { box: line.icon, width: sizes.icon, align: 'center' },
      { box: line.low, width: lowWidth, align: 'end' },
      {
        box:
          line.share <= 0
            ? fillBox(barWidth, sizes.bar, sizes.bar / 2, colors.track, {})
            : weatherBarBox(barWidth, sizes.bar, 0, line.share, colors),
        width: barWidth,
        align: 'start',
      },
      { box: line.high, width: highWidth, align: 'end' },
    ];
    let left = 0;
    return placed(
      cardInner,
      sizes.height,
      cells.map((cell) => {
        const x =
          left +
          (cell.align === 'start'
            ? 0
            : cell.align === 'end'
              ? cell.width - cell.box.width
              : (cell.width - cell.box.width) / 2);
        left += cell.width + sizes.gap;
        return { box: cell.box, x, y: (sizes.height - cell.box.height) / 2 };
      }),
    );
  });
  const title = text(
    translate(`widgets.weather.title.${size}`, {
      unit:
        measure === 'distance'
          ? textContext.unitLabel(textContext.unit)
          : translate('widgets.weather.hours'),
    }).toLocaleUpperCase(textContext.locale),
    WEATHER.card.title,
    colors.faded,
    { bold: true },
  );
  const list = column(
    [
      title,
      column(
        lines.flatMap((line, i) =>
          i === 0 ? [line] : [hairlineBox(cardInner, 0, sizes.rule, colors.rule), line],
        ),
        0,
        'start',
      ),
    ],
    WEATHER.card.titleGap,
    'start',
  );
  // Flat, so it is drawn over the sky, in its turn among the app's marks.
  const cardWidth = list.width + 2 * WEATHER.card.pad;
  const cardHeight = list.height + 2 * WEATHER.card.pad;
  const card = placed(cardWidth, cardHeight, [
    { box: fillBox(cardWidth, cardHeight, WEATHER.card.radius, colors.card, {}), x: 0, y: 0 },
    { box: list, x: WEATHER.card.pad, y: WEATHER.card.pad },
  ]);
  const content = column([widened(head, inner, 'center'), card], WEATHER.cardGap, 'center');
  const width = WEATHER.width;
  const height = content.height + 2 * WEATHER.pad;
  return placed(width, height, [
    {
      box: {
        width,
        height,
        place: (x, y) => [
          {
            kind: 'shade',
            x,
            y,
            width,
            height,
            colors: colors.sky,
            card: { x, y, width, height, radius: WEATHER.radius },
          },
        ],
      },
      x: 0,
      y: 0,
    },
    { box: content, x: WEATHER.pad, y: WEATHER.pad },
  ]);
}

/**
 * A metro line's colors besides its line's (a brand color): its sign's enamel and print, the
 * fainter print of its rest days, and the white of its stations.
 */
const METRO_COLORS = {
  sign: '#FFFFFF',
  ink: '#141B2D',
  faded: '#141B2D8C',
  station: '#FFFFFF',
} as const;

/**
 * The sizes of a period's metro line: its sign's corners and room inside, its badge (and the
 * icon in it, a share of it), its title, direction and total, and the room under them; the line's
 * thickness; a stop with activities (its radius and ring), a rest day's and a terminal's outer
 * ring (its room and width); its stations' names and figures, and the room between them and the
 * line; across, the least room for each station; down, each station's height and the room between
 * the line and its texts.
 */
const METRO = {
  radius: 28,
  pad: 44,
  badge: 76,
  badgeRadius: 18,
  badgeIcon: 0.62,
  title: 44,
  direction: 26,
  total: 44,
  headGap: 40,
  line: 18,
  stop: { r: 21, ring: 7 },
  rest: 8,
  terminal: { gap: 5, ring: 5 },
  name: 26,
  figure: 30,
  labelGap: 16,
  across: { pitch: 118, gap: 16 },
  down: { row: 74, width: 640, gap: 28 },
} as const;

/** Outer radius of a terminal's ring: the farthest a station reaches from its center. */
const METRO_REACH = METRO.stop.r + METRO.terminal.gap + METRO.terminal.ring;

/**
 * A station of a metro line, drawn centered on its box: a stop with activities, white with an
 * inked ring; a rest day, a small white dot on the line; a terminal (its first and last), within
 * a ring of the line's color, as metro maps mark the ends of a line.
 */
function metroStationBox(active: boolean, terminal: boolean, line: string): Box {
  const ringed = (r: number) =>
    overlay(discBox(r, METRO_COLORS.station), discBox(r, METRO_COLORS.ink, METRO.stop.ring));
  if (!terminal) {
    return active ? ringed(METRO.stop.r) : discBox(METRO.rest, METRO_COLORS.station);
  }
  return overlay(
    overlay(
      discBox(METRO_REACH, line, METRO.terminal.ring),
      discBox(METRO_REACH - METRO.terminal.ring, METRO_COLORS.station),
    ),
    ringed(active ? METRO.stop.r : METRO.rest + METRO.stop.ring),
  );
}

/**
 * A period as a metro line on a station's sign, in a brand color (see `metroStations`): its
 * sport's icon on the line's badge (AllRun's monogram for every sport), its name, where it heads
 * (its last station) and its total; then its days, weeks or months as its stations, named short
 * ("LUN", "6–12 OCT", "OCT"), those with activities big with how far they went (or how long,
 * without any distance; a gym day in a period with some, by its sport's icon), the rest days
 * small and faded, its ends ringed as terminals. Across up to a week's seven stations, down
 * beyond (see `metroLayout`).
 */
export function periodMetroBox(
  block: Extract<SummaryBlock, { design: 'periodMetro' }>,
  data: SummaryData,
  { fonts, textContext, translate }: Omit<BlockContext, 'canvas'>,
): Box {
  const line = BRAND_COVER_COLORS[block.cover];
  const { summary } = data;
  const measure = summaryHasDistance(summary) ? 'distance' : 'movingTime';
  const text = (value: string, size: number, color: string, maxWidth?: number) =>
    appTextBox(fonts, [{ text: value, size, bold: true }], color, {
      ...(maxWidth === undefined ? {} : { maxWidth }),
    });
  const size = tableBucket(summary.range);
  const shortName = (station: MetroStation) =>
    formatShortBucketName(station.range, size, textContext.locale).toLocaleUpperCase(
      textContext.locale,
    );
  const all = metroStations(summary, data.activities);
  const stations = all.map((station, i) => {
    const active = station.activityCount > 0;
    return {
      active,
      terminal: i === 0 || i === all.length - 1,
      name: text(shortName(station), METRO.name, active ? METRO_COLORS.ink : METRO_COLORS.faded),
      figure: !active
        ? null
        : station.amount <= 0 && station.sport !== null
          ? iconBox(station.sport, METRO.figure * 1.2, METRO_COLORS.ink)
          : text(
              measure === 'distance'
                ? roundedChartValue('distance', station.amount, textContext, true)
                : plainSummaryText('totalMovingTime', station.amount, textContext),
              METRO.figure,
              METRO_COLORS.ink,
            ),
    };
  });
  const last = all[all.length - 1];

  const [family] = data.families;
  const badge = overlay(
    fillBox(METRO.badge, METRO.badge, METRO.badgeRadius, line, {}),
    sportMarkBox(
      data.families.length === 1 ? family : 'allrun',
      METRO.badge * METRO.badgeIcon,
      METRO_COLORS.station,
    ),
  );
  const total = text(
    measure === 'distance'
      ? roundedChartValue('distance', summary.totalDistanceMeters, textContext, true)
      : plainSummaryText('totalMovingTime', summary.totalMovingTimeSeconds, textContext),
    METRO.total,
    METRO_COLORS.ink,
  );
  /** The badge, the period's name and where it heads, and its total at the end, `width` wide. */
  const heading = (width: number) => {
    const room = width - METRO.badge - total.width - 2 * METRO.labelGap;
    const names = column(
      [
        text(periodName(data, textContext, translate), METRO.title, METRO_COLORS.ink, room),
        ...(last === undefined
          ? []
          : [
              appTextBox(
                fonts,
                [
                  {
                    text: translate('widgets.metro.direction', { station: shortName(last) }),
                    size: METRO.direction,
                    bold: false,
                  },
                ],
                METRO_COLORS.faded,
                { maxWidth: room },
              ),
            ]),
      ],
      4,
      'start',
    );
    const left = row([badge, names], METRO.labelGap, 'center');
    const height = Math.max(left.height, total.height);
    return placed(width, height, [
      { box: left, x: 0, y: (height - left.height) / 2 },
      { box: total, x: width - total.width, y: (height - total.height) / 2 },
    ]);
  };

  const map = (() => {
    if (metroLayout(stations.length) === 'across') {
      const pitch = Math.max(
        METRO.across.pitch,
        ...stations.map(
          (station) => Math.max(station.name.width, station.figure?.width ?? 0) + METRO.across.gap,
        ),
      );
      const width = pitch * stations.length;
      const nameHeight = Math.max(...stations.map((station) => station.name.height));
      const figureHeight = Math.max(0, ...stations.map((station) => station.figure?.height ?? 0));
      const lineY = nameHeight + METRO.labelGap + METRO_REACH;
      const height = lineY + METRO_REACH + METRO.labelGap + figureHeight;
      const centerOf = (i: number) => pitch * i + pitch / 2;
      return placed(width, height, [
        // The line from its first terminal to its last.
        {
          box: fillBox(
            centerOf(stations.length - 1) - centerOf(0),
            METRO.line,
            METRO.line / 2,
            line,
            {},
          ),
          x: centerOf(0),
          y: lineY - METRO.line / 2,
        },
        ...stations.flatMap((station, i) => {
          const dot = metroStationBox(station.active, station.terminal, line);
          return [
            { box: dot, x: centerOf(i) - dot.width / 2, y: lineY - dot.height / 2 },
            {
              box: station.name,
              x: centerOf(i) - station.name.width / 2,
              y: nameHeight - station.name.height,
            },
            ...(station.figure === null
              ? []
              : [
                  {
                    box: station.figure,
                    x: centerOf(i) - station.figure.width / 2,
                    y: lineY + METRO_REACH + METRO.labelGap,
                  },
                ]),
          ];
        }),
      ]);
    }
    const sizes = METRO.down;
    const textX = 2 * METRO_REACH + sizes.gap;
    const figureWidth = Math.max(0, ...stations.map((station) => station.figure?.width ?? 0));
    const width = Math.max(
      sizes.width,
      textX + Math.max(...stations.map((station) => station.name.width)) + sizes.gap + figureWidth,
    );
    const middleOf = (i: number) => sizes.row * i + sizes.row / 2;
    return placed(width, sizes.row * stations.length, [
      {
        box: fillBox(
          METRO.line,
          middleOf(stations.length - 1) - middleOf(0),
          METRO.line / 2,
          line,
          {},
        ),
        x: METRO_REACH - METRO.line / 2,
        y: middleOf(0),
      },
      ...stations.flatMap((station, i) => {
        const dot = metroStationBox(station.active, station.terminal, line);
        return [
          { box: dot, x: METRO_REACH - dot.width / 2, y: middleOf(i) - dot.height / 2 },
          { box: station.name, x: textX, y: middleOf(i) - station.name.height / 2 },
          ...(station.figure === null
            ? []
            : [
                {
                  box: station.figure,
                  x: width - station.figure.width,
                  y: middleOf(i) - station.figure.height / 2,
                },
              ]),
        ];
      }),
    ]);
  })();
  const content = column([heading(map.width), map], METRO.headGap, 'start');
  return panel(content, METRO_COLORS.sign, METRO.pad, METRO.pad, METRO.radius);
}
