# 009 - Redesign: galleries, mixed widgets, a full-screen editor and designs

Date: 2026-10-22

Status: agreed; to be built in milestones R1 to R4, before milestone 4 (Strava).

## Context

With the editor complete (milestone 3), the user wrote down the app they want in
`docs/AllRun Ideas.pdf` (kept out of git: it holds personal photos and screenshots of other apps), after studying AURA and similar apps. It plays the part of the review of
other apps planned before milestone 4. The editor works, but the app around it is plain (a list
of activities, a separate summary screen, a system photo picker), its widgets are single values
that take many steps to combine, and the editor's controls under the canvas leave the photo
small. The redesign closes the visual structure of the whole app before real data arrives:
every screen, button and feature that is planned gets its place now, even when what it does
comes later.

## Decision

### Home (R1)

- **Two tabs, Activities and Summaries**, Activities selected. Summaries stop being a separate
  screen.
- **Activities as a gallery** of cards, three per row (one column if three turn out too narrow):
  the route drawn on a dark card, the day ("Yesterday"), distance, pace and time, and the sport's
  icon. A filter by sport: Running, Cycling, Walking, Swimming and Training, plus Other only when
  the user has such activities; the filter only shows the sports the user has.
- **Walking becomes a family of its own** (walks and hikes), apart from Other (climbing, skiing,
  kayaking, unknown types). The families stay in `core/sports.ts`.
- **Summaries as cards**, one under another: this week, this month, this year and a custom range.
  Each card scrolls sideways through all sports first and then each sport done in the period,
  with its totals and a chart of the period itself (the week's days, the month's days or weeks),
  never a trend over earlier periods: the year or a custom range shows that.
- **The period's chart gets a line style:** points joined by a line over a fading area, a light
  grid, values on the axis and the highest value marked. The line is a variant next to the bars
  in the gallery; the home cards use the line.
- **The map under the route comes in milestone 4**, from a map provider (Mapbox or MapTiler), with
  its key kept behind Supabase. Until then the cards show the route alone.

### Mixed widgets (R2)

- **Widgets that combine several data** in one designed block (a big distance with its pace and
  time under it, the day with the totals, the route between two values, splits as a list with
  the fastest highlighted, a chat bubble "7.4 km, 7:33/km · Ran 10:20 AM", a vertical poster with
  calories, the week day by day with each activity's sport icon…). They take over the role of
  AllRun's templates: a good-looking set of data in one tap. The gallery keeps fewer single
  widgets.
- **Variants scroll inside their tile**, with dots, instead of filling the gallery with one tile
  each (date formats, data shown, logo versions…). Tiles go two per row, mixed widgets too, as in
  AURA; only charts take the whole width.
- **The gallery leads with the mixed widgets**, the ones people will use most. Since 2026-10-23
  its sections are: data widgets (typographic ones with data, the first section, once they are
  redone), creative ones (the replicas of apps and things, and the phrases, called "mixed" until
  then), charts, basics and the logo, whose name, monogram and both are a tile each, so the
  section is not a lone tile. Designs alike share a tile (`blockTile`), and the tiles go in an
  order that reads (reviewed with the user on 2026-10-23): data widgets from the big datum (wide
  and stretched; under the weekday; alone under it, the weekday small first; the tower) to the
  data alone (stacked, in a line, on a card), around the weekday, and last around the route (the
  big datum under it, and the weekday over it in a hand's marker, apart), only with GPS; creative ones by theme: words (the quote, the verse, the message, the chat
  message apart since only it is chosen from a list, the sentence, the badge), the phone's apps
  (the note too, though it lists the splits), the timing tables (the splits' bars and ladder, the
  laps' board and sheet, the race on TV apart as it looks nothing alike) and things of paper. Every page fills its tile, however big
  the others are, so none looks small in its space. The
  time is never offered on top: it is a gym session's main datum already, and elsewhere it read
  as a lesser copy of the main datum's widget (designs saved with it still draw). The basics are: every single datum in one tile (the distance first, then the rest of the
  sport's data, each followed by its other ways of writing it), the route, free text, the name,
  the date and the place.
- **Two families of mixed widgets.** Typographic ones start each in the font that suits it, as
  AURA does (a serif italic in small letters for a verse or a quote), and the user can still
  change their font, color, weight, slant and case. The first typographic ones with data
  (headline, columns, route, day, sport, poster, tall, wide, short weekday, serif) were retired
  on 2026-10-23, as none convinced: they are redone one by one from examples, and designs saved
  with them read without them. The first ones back: a datum big with two or three more under
  it, spread to its width (`bigPair`, `bigTrio`), wide, stretched upwards, under the weekday
  written as wide (wide or stretched, also over the big datum alone) or under the route, the
  main datum or the time on top; and date widgets around the weekday (with the route, between
  data, over data in columns, beside the date, under stacked data), each in its own font so the
  gallery reads varied; a tower to fit a corner of the photo, the big datum's amount, unit and
  sport's word one under another, tall and narrow, with two or three data small and turned on
  their side beside the word (the distance to its tenths, with the pace and time; without a
  distance, the calories, with the time and heart rate; never the elevation, which reads as
  minutes; times without seconds); the three or two most telling data in a line, first with their
  names over them as Strava writes them; and a card of three or six named data, with the activity's name or
  not; never a second reading of a measure, since they carry no names. Replicas of other apps (the iPhone's Notes with the splits, a sent chat
  message with the data, and the sport and the activity's time where its time goes, the lock
  screen's player of iOS 26 copied place by place, with the route as its cover (in AllRun's red
  or night ink) and the distance and time at the ends of its bar, the camera, the splits as a board
  of the activity's laps and as a karting's timing sheet, as a race's timing tower on TV, the start time as an
  iPhone alarm and the place as a location sticker, and later a receipt and a boarding
  pass, its band naming the city it started in, as a pass names its destination) keep the app's colors, font and icons, since recognizing the app is the point:
  only their opacity changes, their dark and light modes are versions in the carousel, and they
  carry no AllRun signature. A version in one brand color (the route's cover, in red or
  night ink) always comes with one in the other. The player's glass is a see-through tint with an edge, not a blur
  of the photo behind it. The camera frames the whole canvas, as the phone's screen does: the
  data where its settings go, the sport's icon on its f button, the route as the last photo's
  thumbnail (none without a route), and its view of the photo see-through, so touches there reach the photo and the
  widgets under it (`HitHole`). New widgets are built with the fonts the app already has.
- **Fonts:** Anton, Unbounded, Big Shoulders Display, Bowlby One SC (a heavy face, stretched
  upwards and set tight, as AURA's "WED") and Rubik Glitch, and then three styles the
  set lacked: a varsity jersey's letters (Graduate), a scoreboard's dot matrix (Doto) and a
  signature (Sacramento), all with open licenses. Fifteen in all.
  Paid fonts are left out: an app bundles its fonts, which needs an app license. Fonts too close
  to another or unfit for sport images go (Archivo Black, Dela Gothic One, Fredoka, Dancing
  Script): designs saved with them read with the closest one left.
- **Charts in AURA's style:** two data over every chart, big, as their data widgets write them
  (an elevation's distance and climb; average and fastest pace; average and highest heart rate or
  power; the splits' average pace and fastest split; a period's total and average per bar), and a
  line over an area that fades out downwards. The title under the chart, the labels at the ends
  of a line and its marked peak go: the header says it, and an average is a dashed line without
  text (its value is in the header), so nothing covers the data. The header is centered over the
  chart by default; each datum's value stands out, big, with its unit as big ("152 BPM"; a pace
  with its marks and no unit, `5'44"`), under its name, small, close and fainter, as the chart's
  area fades. Each chart also comes without its two data, under its name ("DESNIVEL", "KM
  POR SEMANA"), so it still says what it shows. Splits are a table as on Strava: number and pace,
  a bar per split, then the change in altitude and the heart rate (Strava gives each split's),
  right-aligned and without units, under short names of the columns ("Desn.", "FC"); no average.
  The splits that write each pace come first and have no header (it would repeat them); only the
  splits without paces carry the average pace and the fastest split over them.
- **A period's data widgets (R2c):** written data only, for a week, a month, a year or a custom
  range: the period's name small and centered over one, two or three of its main totals in a
  line; a table of its days with activity (its weeks in a month, its months in a year), each name
  small at the start and its value big at the end, rules between them and the total last; and
  the period's name over each sport's total, only when it mixes sports. A layer of their own
  (`summaryBlock`), laid out with the activities' measured boxes and in a lettering each.
- **A period's charts (R2c):** only the period's own data, never a trend over earlier periods
  (unlike the apps they draw from). Two widgets, each of distance and of time, under three totals
  and under two: square bars, translucent but the best one, with each value just over its bar;
  and a line with a dot per bar on a grid with its scale (the highest value, its half and zero),
  the highest dot with a halo and its value. Over them, the period's name and its main totals
  (distance, time, elevation gain and activities, those it has; names as written, "Distancia",
  not in capitals), what the chart draws first. The week in progress reads "Esta semana" rather
  than its dates; a month or a year keeps its name, short and telling. A summary of one sport
  names it after the period ("Esta semana · Carreras"). The rounded bars charts had before are
  gone, too close to the highlighted ones: designs saved with them read as highlighted bars, as
  the default design and AllRun's templates now are. The gallery has a tile per look and bar size
  (a year: bars by month, line by month, bars by week, line by week), so no carousel runs long.
  Values over bars are rounded
  and without unit ("41", "1:18"), "0" on empty bars so every bar reads alike, and only offered up
  to 16 bars (a month of days goes without). The average pace isn't offered in a summary: it mixes
  easy runs, intervals and walks, and says nothing.
- **Cards with depth:** the activity and summary cards and the gallery's tiles share one surface,
  dark and lit from above like the charts' areas, with a faint edge and a soft shadow; an
  activity's route glows softly. In the gallery each chart fills its own page (a zones table no
  longer shrinks its neighbours), and the dots of a carousel follow the finger.
- **Heart rate zones:** the heart rate line colored by zone, with a table of the time in each zone
  (bar, time, range), or the table alone. The time is counted from the heart rate stream; the
  zones are the athlete's, from Strava's `GET /athlete/zones`, which needs the `profile:read_all`
  scope when connecting (milestone 4). Until then the fixtures have synthetic zones.
- **Nothing rounded:** distances keep their two decimals and an activity's times their seconds,
  in every widget, chart and design. A period's total time drops the seconds, which say nothing
  over a week or more. Designs saved with rounded data read without the rounding.
- **The activity's place** ("Sevilla", "Sevilla, Andalucía", "Sevilla, España"), a text widget
  named from where the route starts. Until milestone 4 the device's geocoder names it
  (`expo-location`): iOS asks for nothing; Android needs the location permission, asked for only
  when the user picks the widget. Milestone 4 moves it to the map provider, without permissions.
- **Sport icons** are vectors drawn with Skia, from an icon set with a free license; SF Symbols
  cannot be drawn into an exported image.
- **Calories** come from the activity's detail (Strava only gives them there), fetched on demand
  like the streams (ADR 008).
- **The logo:** a watermark centered at the bottom that can be removed, an option inside the
  mixed widgets (as Strava does) and still a widget of its own.
- **Laps and splits as races:** the laps' board and timing sheet list the activity's laps (an
  interval session's reps and recoveries, or the watch's auto laps; Strava gives them with the
  activity's detail), only when it has more than one: number, distance, time and pace, the fastest
  on a row in a brand color (both versions, red and night ink). The timing tower lists the splits
  by kilometer or mile in their order, each with its pace and its gap to the fastest ("+0:21",
  "Leader" for the fastest, which carries the purple stopwatch of the fastest lap), and a tyre
  letter by thirds of pace (S, M, H), under the sport and the exact distance ("9,90 KM", not the
  number of splits), its header lit and casting a shadow on the rows as on TV; no Formula 1 logo,
  a trademark. More rows than fit are grouped like the note's (24 laps, 20 splits on the tower).
- **The alarm and the location:** the alarm writes the start time in the Clock's thin letters
  (Inter's light face, loaded for replicas only) with the sport and distance as its label; the
  location sticker writes the city and the distance after a pin, in a typewriter's letters, in
  light or dark mode, and is offered only when the place can be named (it asks for Android's
  permission as the place widget does). A version in Instagram's colors was left out.
- **Verses and quotes:** two widgets of words in quotation marks, in a serif italic, without data:
  a Bible verse with its reference, and a famous athlete's or writer's quote with its author. The
  gallery shows the first of each with a "Tap to choose" hint; a tap opens the list of all of
  them, and the one chosen is added. The first of each list is a short one (Philippians 4:13,
  Kipchoge's "No human is limited"), so the hint covers little of it. Pending: review the
  current verses and quotes, add a long list of both, and change a verse or quote already on the
  canvas by tapping it, without removing it and adding another. Phrases of our own over the data were
  tried and left out. Bible verses come from
  public-domain translations only (World English Bible or King James in English, Reina-Valera 1909
  in Spanish); the NIV or the Reina-Valera 1960 are copyrighted.

### Editor (R3)

- **One step, full screen.** The photo is chosen before the editor (R4), so the step that framed
  it with the widgets locked goes away. The canvas fills the screen; the controls float over it.
- **Floating controls on the right**, folding away: Collages, Designs, Ratio and Activity (shows
  another activity or period in the same design: widgets are bound to data). On top: add an
  image, depth, and the collage layouts.
- **A selected widget's tools in a column on the right** (size, font, color, background, KM/MI),
  instead of the panel under the canvas.
- **Photos move freely** and may leave part of the canvas empty, also in collages. The empty part
  shows a background color: by default the photo's dominant color (the largest group of similar
  colors in a reduced copy of the photo; the first photo's in a collage), changeable with the
  color menu, or transparent for a PNG.
- **Undo covers the photo too:** with one step, moving the photo by mistake is easier, so its
  framing joins the widgets in the history.
- **One color menu:** a grid of colors (no spectrum, no sliders), an eyedropper that takes a color
  from the canvas, opacity and favorite colors, all in one place.
- **KM or MI for the whole design**, whatever the device or account says. A unit per widget stays
  out: one image mixing units would be odd.
- **An image as a sticker:** another photo as a layer to move, scale and turn. Removing its
  background comes in milestone 5, with the same segmentation module as the depth effect.

### Choosing what to make (R4)

- **Choosing an activity or a summary opens the user's photos inside the app** (Recent,
  Favorites, Albums), with three tabs on top: Photo (default), Designs and Stickers. The photos
  are read with `expo-media-library`; with limited access on iOS, only the photos allowed show.
- **Photo** opens the editor with that photo and an empty design: widgets are added with +.
- **Designs** replace templates: collages and ready-made designs. A design is where the photo or
  photos go (full bleed, in a band, in a collage), the background, and optionally mixed widgets
  already placed. The user still saves their own designs, as they saved templates (ADR 007's
  storage and its sync with Supabase still apply). AllRun's template recipes are retired.
- **Stickers**: a gallery of mixed widgets ready to copy (tap) or save (long press), as PNGs cut
  to the widget, not a whole transparent canvas, with a button to change their font and color.
- **Sharing**: Story (straight to an Instagram story), Copy, Save and Share.
- **Filters on the photo**, changed by swiping sideways over it, as on Instagram: Zoom Blur, Motion
  Blur, Portra, Mono and Ink. Drawn with Skia (color matrices for the looks, runtime shaders for
  the blurs), so the exported image is the same as the canvas.
- **Images from the gallery as widgets**, picked from the same in-app grid: a plain image (the
  image layer of R3), and an instant photo, a white frame around it with handwritten text under
  it (date and start time, two data; Permanent Marker).

### Everything visible now

Every planned button has its place in this redesign, even when what it does comes later:
Instagram's Story button and the depth button (milestone 5), video (a flyover of the activity, a
fast replay of a summary's activities, after the MVP). Such a button looks like the rest and,
when tapped, says briefly that it is coming soon; it never does nothing silently.

### The template schema

New widgets are new layer kinds, which old templates don't use: no version change. Free photos,
the background and collages change what a design stores, so the schema moves to `version: 2`
with a migration from version 1 (R3 and R4).

## Milestones

R1 home · R2 mixed widgets · R3 editor · R4 choosing, designs, stickers, the photo's filters and
the images as widgets. Then milestone 4
(Strava, Supabase, the map under routes) and 5 (depth, the image sticker's cut-out, Instagram
Story, Sentry, TestFlight). Video after the MVP.

## Alternatives discarded

- **Keeping the two-step editor** with full-screen canvas: the photo is now chosen before, so the
  first step had little left to do.
- **The photo always covering the canvas** (ADR 005): collages and photos in a band need room
  around them, and the user wants to place photos freely.
- **The average color as background:** it tends to a dull grey-brown; the dominant color is one
  the photo really has.
- **Automatic palettes from the photo** next to the eyedropper: the user preferred one menu with
  the grid, eyedropper, opacity and favorites.
- **A trend over earlier periods** in a week's or month's chart: the year or a custom range
  already shows it.
- **The system photo picker:** it can't sit inside the screen with the Designs and Stickers tabs.
- **Stock photos and videos** among the photo tabs: no video yet, and stock photos need a
  provider with attribution.
- **A map under the routes now:** it needs a provider and a protected key; it comes with the
  backend in milestone 4.
